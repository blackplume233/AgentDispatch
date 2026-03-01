import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { v4 as uuid } from 'uuid';
import type { Client, ClientConfig, Task, AgentInfo, InteractionLogEntry, ClientLogEntry, AuthTokenRole } from '@agentdispatch/shared';
import { ServerHttpClient } from './http/server-client.js';
import { IPCServer } from './ipc/ipc-server.js';
import { TaskPoller } from './polling/task-poller.js';
import { Dispatcher } from './dispatch/dispatcher.js';
import { AcpController } from './acp/acp-controller.js';
import { WorkerManager } from './agents/worker-manager.js';

const WORKER_ONLY_COMMANDS = new Set([
  'worker.progress',
  'worker.complete',
  'worker.fail',
  'worker.status',
  'worker.log',
  'worker.heartbeat',
  'task.assign',
  'task.release',
  'task.cancel',
]);

interface TokenCacheEntry {
  role: AuthTokenRole;
  expiresAt: number;
}

interface WorkerToken {
  agentId: string;
  taskId: string;
}

export class ClientNode {
  private static readonly HEARTBEAT_FAIL_THRESHOLD = 3;
  private static readonly RECONNECT_BASE_DELAY = 2000;
  private static readonly RECONNECT_MAX_DELAY = 30000;
  private static readonly TOKEN_CACHE_TTL = 60_000;

  private config: ClientConfig;
  private httpClient: ServerHttpClient;
  private ipcServer: IPCServer;
  private poller: TaskPoller;
  private dispatcher: Dispatcher;
  private acpController: AcpController;
  private workerManager: WorkerManager;
  private client: Client | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pendingTasks: Task[] = [];
  private dispatching = false;
  private clientLogBuffer: ClientLogEntry[] = [];
  private taskOutputDirs: Map<string, string> = new Map();
  private taskInputDirs: Map<string, string> = new Map();
  private consecutiveHeartbeatFailures = 0;
  private reconnecting = false;
  private stopped = false;
  private ipcTokenCache = new Map<string, TokenCacheEntry>();
  private workerTokens = new Map<string, WorkerToken>();
  private workerTokensByAgent = new Map<string, string>();

  constructor(config: ClientConfig) {
    this.config = config;
    this.httpClient = new ServerHttpClient(config.serverUrl, config.token);
    this.ipcServer = new IPCServer(config.ipc.path, (cmd, payload, token) => this.handleIPC(cmd, payload, token));
    this.poller = new TaskPoller(this.httpClient, config.polling.interval, (tasks) => {
      this.pendingTasks = tasks;
      void this.dispatchPendingTasks();
    });
    this.dispatcher = new Dispatcher(config);
    this.acpController = new AcpController(config, {
      onAgentStarted: (agentId, pid) => {
        this.log(`Agent ${agentId} started (pid=${pid ?? 'unknown'})`);
        this.recordClientLog('info', 'agent.started', `Agent ${agentId} started`, { agentId, pid });
      },
      onAgentExited: (agentId, code, signal) => {
        this.log(`Agent ${agentId} exited (code=${code}, signal=${signal})`);
        this.workerManager.handleWorkerExit(agentId, code);
        this.recordClientLog('info', 'agent.exited', `Agent ${agentId} exited (code=${code})`, { agentId, code, signal });
        const worker = this.workerManager.getWorkerState(agentId);
        if (worker?.currentTaskId) {
          const taskId = worker.currentTaskId;
          const reason = code === 0
            ? 'Agent exited without completing task'
            : `Agent crashed with exit code ${code}`;
          this.log(`Releasing task ${taskId}: ${reason}`);
          void this.handleTaskCompletion(agentId, taskId, 'cancelled');
        }
      },
      onAgentError: (agentId, error) => {
        this.log(`Agent ${agentId} error: ${error}`);
        this.recordClientLog('error', 'agent.error', error, { agentId });
      },
      onTaskCompleted: (agentId, taskId, stopReason) => {
        this.log(`Agent ${agentId} task ${taskId} completed: ${stopReason}`);
        this.recordClientLog('info', 'task.completed', `Task ${taskId} completed by ${agentId}: ${stopReason}`, { agentId, taskId, stopReason });
        void this.handleTaskCompletion(agentId, taskId, stopReason);
      },
      onLogBatch: (agentId, taskId, entries) => {
        void this.uploadTaskLogs(agentId, taskId, entries);
      },
      onProgress: (agentId, taskId, status) => {
        void this.reportAgentProgress(agentId, taskId, status);
      },
    });
    this.workerManager = new WorkerManager(this.acpController, (taskId, reason) => {
      this.log(`Releasing task ${taskId}: ${reason}`);
      if (this.client) {
        void this.httpClient.releaseTask(taskId, { clientId: this.client.id, reason }).catch(() => {});
      }
    });

    for (const agentCfg of config.agents) {
      if (agentCfg.type === 'worker') {
        this.workerManager.registerWorker(agentCfg);
      }
    }
  }

  async start(): Promise<void> {
    await this.ipcServer.start();
    this.log(`IPC server started at ${this.config.ipc.path}`);
  }

  async register(): Promise<Client> {
    try {
      this.client = await this.httpClient.registerClient({
        name: this.config.name,
        host: os.hostname(),
        tags: this.config.tags,
        dispatchMode: this.config.dispatchMode,
        agents: this.config.agents.map((a) => ({
          id: a.id,
          type: a.type,
          command: a.command,
          workDir: a.workDir,
          capabilities: a.capabilities,
        })),
      });
      this.log(`Registered as ${this.client.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already registered')) {
        const clients = await this.httpClient.listClients();
        const existing = clients.find((c) => c.name === this.config.name);
        if (existing) {
          this.client = existing;
          this.log(`Re-using existing registration ${this.client.id}`);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    this.acpController.setClientId(this.client.id);
    this.recordClientLog('info', 'node.registered', `Registered as ${this.client.id}`);
    this.startHeartbeat();
    this.poller.start();
    return this.client;
  }

  async unregister(): Promise<void> {
    if (this.client) {
      await this.httpClient.unregisterClient(this.client.id);
      this.recordClientLog('info', 'node.unregistered', `Unregistered ${this.client.id}`);
      this.client = null;
    }
    this.stopHeartbeat();
    this.poller.stop();
    await this.acpController.stopAll();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.poller.stop();
    this.stopHeartbeat();
    this.workerTokens.clear();
    this.workerTokensByAgent.clear();
    await this.acpController.stopAll();
    await this.ipcServer.stop();
    this.flushClientLogs();
    this.log('Stopped');
  }

  getStatus(): {
    registered: boolean;
    clientId: string | null;
    serverUrl: string;
    ipcPath: string;
    polling: boolean;
    workers: Array<{ agentId: string; status: string; currentTaskId?: string }>;
  } {
    return {
      registered: this.client !== null,
      clientId: this.client?.id ?? null,
      serverUrl: this.config.serverUrl,
      ipcPath: this.config.ipc.path,
      polling: this.poller.isRunning(),
      workers: this.workerManager.getAllWorkers().map((w) => ({
        agentId: w.agentId,
        status: w.status,
        currentTaskId: w.currentTaskId,
      })),
    };
  }

  getHttpClient(): ServerHttpClient {
    return this.httpClient;
  }

  getClient(): Client | null {
    return this.client;
  }

  getPendingTasks(): Task[] {
    return this.pendingTasks;
  }

  getWorkerManager(): WorkerManager {
    return this.workerManager;
  }

  getAcpController(): AcpController {
    return this.acpController;
  }

  getDispatcher(): Dispatcher {
    return this.dispatcher;
  }

  private buildAgentInfos(): AgentInfo[] {
    return this.workerManager.getAllWorkers().map((w) => {
      const cfg = this.config.agents.find((a) => a.id === w.agentId);
      return {
        id: w.agentId,
        type: 'worker' as const,
        status: w.status === 'idle' ? ('idle' as const) :
               w.status === 'busy' ? ('busy' as const) :
               w.status === 'crashed' ? ('error' as const) : ('idle' as const),
        currentTaskId: w.currentTaskId,
        capabilities: cfg?.capabilities ?? [],
      };
    });
  }

  private async dispatchPendingTasks(): Promise<void> {
    if (this.dispatching || !this.client) return;
    this.dispatching = true;

    try {
      for (const task of this.pendingTasks) {
        const agents = this.buildAgentInfos();
        const decision = this.dispatcher.decide(task, agents);

        if (decision.action !== 'dispatch') continue;

        const worker = this.workerManager.getWorkerState(decision.agentId);
        if (!worker || worker.status !== 'idle') continue;

        try {
          await this.httpClient.claimTask(task.id, {
            clientId: this.client.id,
            agentId: decision.agentId,
          });
          this.log(`Claimed task "${task.title}" → ${decision.agentId}`);
          this.recordClientLog('info', 'task.claimed', `Claimed task "${task.title}" → ${decision.agentId}`, { taskId: task.id, agentId: decision.agentId });

          this.workerManager.assignTask(decision.agentId, task.id);

          const agentCfg = this.config.agents.find((a) => a.id === decision.agentId);
          if (agentCfg) {
            const outputDir = path.join(agentCfg.workDir, '.dispatch', 'output', task.id.slice(0, 12));
            await fs.promises.mkdir(outputDir, { recursive: true });
            this.taskOutputDirs.set(task.id, outputDir);

            let inputDir: string | undefined;
            if (task.attachments && task.attachments.length > 0) {
              inputDir = path.join(agentCfg.workDir, '.dispatch', 'input', task.id.slice(0, 12));
              await this.downloadAttachments(task, inputDir);
              this.taskInputDirs.set(task.id, inputDir);
            }

            const workerToken = this.config.token
              ? this.issueWorkerToken(decision.agentId, task.id)
              : undefined;
            await this.acpController.launchAgent(agentCfg, task, outputDir, inputDir, workerToken, (dir) => this.scanWorkDir(dir));
            this.log(`Launched agent ${decision.agentId} for task ${task.id.slice(0, 8)} (outputDir=${outputDir}${inputDir ? `, inputDir=${inputDir}` : ''})`);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log(`Claim/launch failed for task ${task.id.slice(0, 8)}: ${msg}`);
          this.recordClientLog('error', 'task.claim_failed', msg, { taskId: task.id });
        }
      }
    } finally {
      this.dispatching = false;
    }
  }

  private async handleTaskCompletion(agentId: string, taskId: string, stopReason: string): Promise<void> {
    this.revokeWorkerToken(agentId);

    if (!this.client) {
      this.markWorkerIdle(agentId);
      return;
    }

    if (stopReason === 'end_turn') {
      try {
        await this.httpClient.reportProgress(taskId, {
          clientId: this.client.id,
          agentId,
          progress: 0,
          message: 'Collecting artifacts...',
        });

        const outputDir = this.taskOutputDirs.get(taskId);
        const { zipPath, resultPath } = outputDir
          ? await this.collectArtifacts(outputDir, taskId)
          : { zipPath: null, resultPath: null };

        if (zipPath && resultPath) {
          await this.httpClient.completeTask(taskId, { zipPath, resultPath });
          this.log(`Task ${taskId.slice(0, 8)} artifacts uploaded`);
        } else {
          const agentCfg = this.config.agents.find((a) => a.id === agentId);
          const fallbackDir = outputDir ?? agentCfg?.workDir ?? os.tmpdir();
          const minimal = await this.generateMinimalResult(fallbackDir, taskId);
          await this.httpClient.completeTask(taskId, minimal);
          this.log(`Task ${taskId.slice(0, 8)} completed with minimal result`);
        }

        this.taskOutputDirs.delete(taskId);
        this.taskInputDirs.delete(taskId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`Failed to complete task ${taskId.slice(0, 8)}: ${msg}`);
        this.recordClientLog('error', 'task.completion_failed', msg, { taskId, agentId });
      }
    } else {
      try {
        await this.httpClient.releaseTask(taskId, {
          clientId: this.client.id,
          reason: `Agent stopped: ${stopReason}`,
        });
        this.log(`Releasing task ${taskId}: ${stopReason}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`Failed to release task ${taskId.slice(0, 8)}: ${msg}`);
      }
    }

    this.markWorkerIdle(agentId);
  }

  private markWorkerIdle(agentId: string): void {
    const worker = this.workerManager.getWorkerState(agentId);
    if (worker) {
      worker.status = 'idle';
      worker.currentTaskId = undefined;
    }
  }

  async cancelRunningTask(taskId: string, reason: string): Promise<{ success: boolean; message: string }> {
    const worker = this.workerManager.getAllWorkers().find((w) => w.currentTaskId === taskId);
    if (!worker) {
      return { success: false, message: `No worker found running task ${taskId}` };
    }

    this.log(`Cancelling task ${taskId.slice(0, 8)} on agent ${worker.agentId}: ${reason}`);
    this.recordClientLog('info', 'task.cancelling', `Cancelling task ${taskId}: ${reason}`, { taskId, agentId: worker.agentId });

    this.acpController.stopAgent(worker.agentId);
    this.revokeWorkerToken(worker.agentId);

    worker.status = 'idle';
    worker.currentTaskId = undefined;
    this.taskOutputDirs.delete(taskId);

    if (this.client) {
      try {
        await this.httpClient.cancelTask(taskId, reason);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`Failed to cancel task ${taskId.slice(0, 8)} on server: ${msg}`);
      }
    }

    return { success: true, message: `Task ${taskId.slice(0, 8)} cancelled` };
  }

  private async collectArtifacts(
    workDir: string,
    taskId: string,
  ): Promise<{ zipPath: string | null; resultPath: string | null }> {

    // Scan files written by the agent (skip hidden dirs, node_modules, etc.)
    const files = await this.scanWorkDir(workDir);
    if (files.length === 0) {
      this.log(`No artifact files found in ${workDir}`);
      return { zipPath: null, resultPath: null };
    }

    this.log(`Found ${files.length} artifact files in ${workDir}`);

    // Create zip
    const zip = new AdmZip();
    const outputs: Array<{ name: string; type: string; path: string; description?: string }> = [];

    for (const filePath of files) {
      const relativePath = path.relative(workDir, filePath);
      zip.addLocalFile(filePath, path.dirname(relativePath));
      const ext = path.extname(filePath).toLowerCase();
      const stat = await fs.promises.stat(filePath);
      outputs.push({
        name: path.basename(filePath),
        type: ext.replace('.', '') || 'file',
        path: relativePath,
        description: `${(stat.size / 1024).toFixed(1)} KB`,
      });
    }

    // Find summary from the first .md or .txt file
    let summary = `Agent completed task with ${files.length} output file(s)`;
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.md' || ext === '.txt') {
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? '';
          if (firstLine.length > 10) {
            summary = firstLine.replace(/^#+\s*/, '').slice(0, 500);
          }
        } catch { /* ignore read errors */ }
        break;
      }
    }

    const artifactDir = path.join(workDir, '.artifacts');
    await fs.promises.mkdir(artifactDir, { recursive: true });
    const zipPath = path.join(artifactDir, `${taskId}.zip`);
    zip.writeZip(zipPath);

    const resultJson = {
      taskId,
      success: true,
      summary,
      outputs,
    };
    const resultPath = path.join(artifactDir, 'result.json');
    await fs.promises.writeFile(resultPath, JSON.stringify(resultJson, null, 2), 'utf-8');

    this.log(`Artifacts packed: ${zipPath} (${outputs.length} files)`);
    return { zipPath, resultPath };
  }

  private async generateMinimalResult(
    baseDir: string,
    taskId: string,
  ): Promise<{ zipPath: string; resultPath: string }> {
    const artifactDir = path.join(baseDir, '.artifacts');
    await fs.promises.mkdir(artifactDir, { recursive: true });

    const resultJson = {
      taskId,
      success: true,
      summary: 'Task completed (no output files produced by worker)',
      outputs: [],
    };
    const resultPath = path.join(artifactDir, 'result.json');
    await fs.promises.writeFile(resultPath, JSON.stringify(resultJson, null, 2), 'utf-8');

    const zip = new AdmZip();
    zip.addFile('result.json', Buffer.from(JSON.stringify(resultJson, null, 2)));
    const zipPath = path.join(artifactDir, `${taskId}.zip`);
    zip.writeZip(zipPath);

    return { zipPath, resultPath };
  }

  private async scanWorkDir(dir: string): Promise<string[]> {
    const SKIP_DIRS = new Set(['.artifacts', '.git', 'node_modules', '.claude', '__pycache__']);
    const results: string[] = [];

    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await this.scanWorkDir(fullPath);
        results.push(...sub);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
    return results;
  }

  private async downloadAttachments(task: Task, inputDir: string): Promise<void> {
    if (!task.attachments || task.attachments.length === 0) return;

    await fs.promises.mkdir(inputDir, { recursive: true });
    this.log(`Downloading ${task.attachments.length} attachment(s) for task ${task.id.slice(0, 8)}...`);

    for (const attachment of task.attachments) {
      const destPath = path.join(inputDir, attachment.filename);
      try {
        await this.httpClient.downloadAttachment(task.id, attachment.filename, destPath);
        this.log(`  Downloaded: ${attachment.filename} (${(attachment.sizeBytes / 1024).toFixed(1)} KB)`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`  Failed to download ${attachment.filename}: ${msg}`);
      }
    }
  }

  private async reportAgentProgress(
    agentId: string,
    taskId: string,
    status: string,
  ): Promise<void> {
    if (!this.client) return;
    try {
      await this.httpClient.reportProgress(taskId, {
        clientId: this.client.id,
        agentId,
        progress: 0,
        message: status.split('\n')[0]?.slice(0, 300) ?? '',
      });
    } catch {
      // progress reporting is best-effort
    }
  }

  private async uploadTaskLogs(agentId: string, taskId: string, entries: InteractionLogEntry[]): Promise<void> {
    if (!this.client || entries.length === 0) return;
    try {
      await this.httpClient.appendTaskLogs(taskId, this.client.id, agentId, entries);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Failed to upload task logs for ${taskId.slice(0, 8)}: ${msg}`);
    }
  }

  private recordClientLog(
    level: 'info' | 'warn' | 'error' | 'debug',
    event: string,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.clientLogBuffer.push({
      id: uuid(),
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      context,
    });
    if (this.clientLogBuffer.length >= 10) {
      this.flushClientLogs();
    }
  }

  private flushClientLogs(): void {
    if (!this.client || this.clientLogBuffer.length === 0) return;
    const batch = this.clientLogBuffer.splice(0);
    void this.httpClient.appendClientLogs(this.client.id, batch).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Failed to upload client logs: ${msg}`);
    });
  }

  private startHeartbeat(): void {
    this.consecutiveHeartbeatFailures = 0;
    this.heartbeatTimer = setInterval(() => {
      void this.doHeartbeat();
    }, this.config.heartbeat.interval);
  }

  private async doHeartbeat(): Promise<void> {
    if (!this.client || this.reconnecting) return;
    try {
      await this.httpClient.heartbeat(this.client.id, {
        agents: this.buildAgentInfos(),
      });
      if (this.consecutiveHeartbeatFailures > 0) {
        this.log(`Heartbeat recovered after ${this.consecutiveHeartbeatFailures} failures`);
      }
      this.consecutiveHeartbeatFailures = 0;
      this.flushClientLogs();
    } catch {
      this.consecutiveHeartbeatFailures++;
      this.log(`Heartbeat failed (${this.consecutiveHeartbeatFailures}/${ClientNode.HEARTBEAT_FAIL_THRESHOLD})`);
      if (this.consecutiveHeartbeatFailures >= ClientNode.HEARTBEAT_FAIL_THRESHOLD) {
        void this.reconnect();
      }
    }
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting || this.stopped) return;
    this.reconnecting = true;
    this.poller.stop();
    this.log('Connection lost, attempting to reconnect...');

    let delay = ClientNode.RECONNECT_BASE_DELAY;
    while (!this.stopped) {
      try {
        this.client = await this.httpClient.registerClient({
          name: this.config.name,
          host: os.hostname(),
          tags: this.config.tags,
          dispatchMode: this.config.dispatchMode,
          agents: this.config.agents.map((a) => ({
            id: a.id,
            type: a.type,
            command: a.command,
            workDir: a.workDir,
            capabilities: a.capabilities,
          })),
        });
        this.acpController.setClientId(this.client.id);
        this.consecutiveHeartbeatFailures = 0;
        this.reconnecting = false;
        this.poller.start();
        this.log(`Reconnected as ${this.client.id}`);
        this.recordClientLog('info', 'node.reconnected', `Reconnected as ${this.client.id}`);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('already registered')) {
          try {
            const clients = await this.httpClient.listClients();
            const existing = clients.find((c) => c.name === this.config.name);
            if (existing) {
              this.client = existing;
              this.acpController.setClientId(this.client.id);
              this.consecutiveHeartbeatFailures = 0;
              this.reconnecting = false;
              this.poller.start();
              this.log(`Reconnected (reused) as ${this.client.id}`);
              this.recordClientLog('info', 'node.reconnected', `Reconnected (reused) as ${this.client.id}`);
              return;
            }
          } catch { /* fall through to retry */ }
        }
        this.log(`Reconnect failed: ${msg}, retrying in ${(delay / 1000).toFixed(1)}s...`);
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, ClientNode.RECONNECT_MAX_DELAY);
      }
    }
    this.reconnecting = false;
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    process.stdout.write(`[${ts}] [ClientNode] ${msg}\n`);
  }

  private issueWorkerToken(agentId: string, taskId: string): string {
    const token = `wt_${uuid()}`;
    this.workerTokens.set(token, { agentId, taskId });
    this.workerTokensByAgent.set(agentId, token);
    this.log(`Issued worker token for agent ${agentId} task ${taskId.slice(0, 8)}`);
    return token;
  }

  private revokeWorkerToken(agentId: string): void {
    const token = this.workerTokensByAgent.get(agentId);
    if (token) {
      this.workerTokens.delete(token);
      this.workerTokensByAgent.delete(agentId);
    }
  }

  private async validateIPCToken(token: string): Promise<AuthTokenRole> {
    const cached = this.ipcTokenCache.get(token);
    if (cached && Date.now() < cached.expiresAt) return cached.role;

    const url = `${this.config.serverUrl.replace(/\/$/, '')}/api/v1/auth/me`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      this.ipcTokenCache.delete(token);
      throw Object.assign(new Error('Invalid or expired token'), { code: 'UNAUTHORIZED' });
    }
    const data = (await response.json()) as { role?: AuthTokenRole };
    const role = data.role ?? 'operator';
    this.ipcTokenCache.set(token, { role, expiresAt: Date.now() + ClientNode.TOKEN_CACHE_TTL });
    return role;
  }

  private async enforceIPCAuth(command: string, token?: string): Promise<void> {
    if (!this.config.token) return;
    if (!WORKER_ONLY_COMMANDS.has(command)) return;

    if (!token) {
      throw Object.assign(
        new Error('Worker commands require a token (use --token or DISPATCH_TOKEN)'),
        { code: 'UNAUTHORIZED' },
      );
    }

    // Check local worker tokens first (issued to spawned Worker processes)
    if (this.workerTokens.has(token)) return;

    // Fall back to Server-side validation
    const role = await this.validateIPCToken(token);
    if (role !== 'admin' && role !== 'client') {
      throw Object.assign(
        new Error(`Role '${role}' is not allowed for worker commands`),
        { code: 'FORBIDDEN' },
      );
    }
  }

  private async handleIPC(command: string, payload: unknown, token?: string): Promise<unknown> {
    await this.enforceIPCAuth(command, token);

    switch (command) {
      case 'node.status':
        return this.getStatus();
      case 'node.register':
        return this.register();
      case 'node.unregister':
        await this.unregister();
        return { success: true };
      case 'node.stop':
        await this.stop();
        return { success: true };
      case 'task.list':
        return this.pendingTasks;

      case 'worker.progress': {
        const p = payload as {
          taskId: string;
          agentId: string;
          progress: number;
          message?: string;
        };
        if (!this.client) throw new Error('Not registered');
        await this.httpClient.reportProgress(p.taskId, {
          clientId: this.client.id,
          agentId: p.agentId,
          progress: p.progress,
          message: p.message,
        });
        return { success: true };
      }

      case 'worker.status': {
        const s = payload as { agentId: string };
        return this.workerManager.getWorkerState(s.agentId) ?? { error: 'Worker not found' };
      }

      case 'task.cancel': {
        const c = payload as { taskId: string; reason?: string };
        return this.cancelRunningTask(c.taskId, c.reason ?? 'User cancelled');
      }

      case 'config.show':
        return this.config;

      default:
        throw new Error(`Unknown IPC command: ${command}`);
    }
  }
}

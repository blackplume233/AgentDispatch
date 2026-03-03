import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { v4 as uuid } from 'uuid';
import type {
  Client,
  ClientConfig,
  WorkerConfig,
  Task,
  AgentInfo,
  InteractionLogEntry,
  ClientLogEntry,
  AuthTokenRole,
} from '@agentdispatch/shared';
import { loadClientConfig } from './config.js';
import { ServerHttpClient } from './http/server-client.js';
import { IPCServer } from './ipc/ipc-server.js';
import { TaskPoller } from './polling/task-poller.js';
import { Dispatcher } from './dispatch/dispatcher.js';
import { AcpController } from './acp/acp-controller.js';
import { WorkerManager } from './agents/worker-manager.js';
import { ManagerHandler } from './agents/manager-handler.js';
import {
  buildRuntimeAgents,
  isWorkerRuntimeConfig,
  type RuntimeAgentConfig,
  type WorkerRuntimeConfig,
} from './agents/runtime-agent-config.js';

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
  private static readonly COMPLETION_MAX_RETRIES = 2;
  private static readonly COMPLETION_RETRY_DELAY = 1000;
  private static readonly MAX_CLAIMS_PER_TASK = 3;
  private static readonly CLAIM_COUNT_TTL = 300_000;
  private static readonly GRACEFUL_STOP_TIMEOUT = 10_000;

  private config: ClientConfig;
  private httpClient: ServerHttpClient;
  private ipcServer: IPCServer;
  private poller: TaskPoller;
  private dispatcher: Dispatcher;
  private acpController: AcpController;
  private workerManager: WorkerManager;
  private managerHandler: ManagerHandler;
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
  private taskClaimCounts = new Map<string, { count: number; firstClaimed: number }>();
  private pendingCompletions = new Set<Promise<void>>();
  private claimCountCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private runtimeAgents: RuntimeAgentConfig[];
  private runtimeAgentsById = new Map<string, RuntimeAgentConfig>();
  private workerConfigsById = new Map<string, WorkerRuntimeConfig>();

  constructor(config: ClientConfig) {
    this.config = config;
    this.runtimeAgents = buildRuntimeAgents(config.agents);
    this.runtimeAgentsById = new Map(this.runtimeAgents.map((agent) => [agent.id, agent]));
    this.workerConfigsById = new Map(
      this.runtimeAgents.filter(isWorkerRuntimeConfig).map((agent) => [agent.id, agent]),
    );
    this.httpClient = new ServerHttpClient(config.serverUrl, config.token);
    this.ipcServer = new IPCServer(config.ipc.path, (cmd, payload, token) =>
      this.handleIPC(cmd, payload, token),
    );
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
        this.recordClientLog('info', 'agent.exited', `Agent ${agentId} exited (code=${code})`, {
          agentId,
          code,
          signal,
        });
        const worker = this.workerManager.getWorkerState(agentId);
        if (worker?.currentTaskId) {
          const taskId = worker.currentTaskId;
          const reason =
            code === 0
              ? 'Agent exited without completing task'
              : `Agent crashed with exit code ${code}`;
          this.log(`Releasing task ${taskId}: ${reason}`);
          this.trackCompletion(this.handleTaskCompletion(agentId, taskId, 'cancelled'));
        }
      },
      onAgentError: (agentId, error) => {
        this.log(`Agent ${agentId} error: ${error}`);
        this.recordClientLog('error', 'agent.error', error, { agentId });
      },
      onTaskCompleted: (agentId, taskId, stopReason) => {
        this.log(`Agent ${agentId} task ${taskId} completed: ${stopReason}`);
        this.recordClientLog(
          'info',
          'task.completed',
          `Task ${taskId} completed by ${agentId}: ${stopReason}`,
          { agentId, taskId, stopReason },
        );
        this.trackCompletion(this.handleTaskCompletion(agentId, taskId, stopReason));
      },
      onLogBatch: (agentId, taskId, entries) => {
        void this.uploadTaskLogs(agentId, taskId, entries);
      },
      onProgress: (agentId, taskId, status) => {
        void this.reportAgentProgress(agentId, taskId, status);
      },
    });
    this.workerManager = new WorkerManager(
      this.acpController,
      (taskId, reason) => {
        this.log(`Releasing task ${taskId}: ${reason}`);
        if (this.client) {
          void this.httpClient
            .releaseTask(taskId, { clientId: this.client.id, reason })
            .catch(() => {});
        }
      },
      (agentId, attempt) => {
        this.log(`Worker ${agentId} recovered (attempt ${attempt}), ready for new tasks`);
        this.recordClientLog(
          'info',
          'agent.restarted',
          `Worker ${agentId} auto-recovered (attempt ${attempt})`,
          { agentId, attempt },
        );
      },
    );

    this.managerHandler = new ManagerHandler(config, {
      consultTimeout: 30_000,
      log: (msg) => this.log(msg),
      onAudit: (event, detail) =>
        this.recordClientLog('info', event, JSON.stringify(detail), detail),
    });

    for (const agentCfg of this.runtimeAgents) {
      if (isWorkerRuntimeConfig(agentCfg)) {
        this.workerManager.registerWorker(agentCfg);
      }
    }
  }

  async start(): Promise<void> {
    process.stdout.setDefaultEncoding('utf8');
    await this.ipcServer.start();
    this.log(`IPC server started at ${this.config.ipc.path}`);
    this.recordClientLog('info', 'node.started', `IPC server started at ${this.config.ipc.path}`, {
      ipcPath: this.config.ipc.path,
    });
  }

  async register(): Promise<Client> {
    try {
      this.client = await this.httpClient.registerClient({
        name: this.config.name,
        host: os.hostname(),
        tags: this.config.tags,
        dispatchMode: this.config.dispatchMode,
        agents: this.buildAgentRegistrations(),
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
    this.recordClientLog('info', 'node.registered', `Registered as ${this.client.id}`, {
      clientId: this.client.id,
      name: this.config.name,
    });
    this.startHeartbeat();
    this.startClaimCountCleanup();
    await this.reconcileOrphanedTasks();
    this.poller.start();
    this.recordClientLog('info', 'polling.started', 'Task polling started', {
      clientId: this.client.id,
      interval: this.config.polling.interval,
    });
    await this.startManagerIfConfigured();
    return this.client;
  }

  async unregister(): Promise<void> {
    await this.managerHandler.stopManager();
    this.dispatcher.setManagerAvailable(false);
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
    this.recordClientLog('info', 'polling.stopped', 'Task polling stopped');
    this.stopHeartbeat();
    if (this.claimCountCleanupTimer) {
      clearInterval(this.claimCountCleanupTimer);
      this.claimCountCleanupTimer = null;
    }

    if (this.pendingCompletions.size > 0) {
      this.log(`Waiting for ${this.pendingCompletions.size} pending task completion(s)...`);
      await Promise.race([
        Promise.allSettled([...this.pendingCompletions]),
        new Promise((r) => setTimeout(r, ClientNode.GRACEFUL_STOP_TIMEOUT)),
      ]);
    }

    this.workerTokens.clear();
    this.workerTokensByAgent.clear();
    await this.managerHandler.stopManager();
    this.dispatcher.setManagerAvailable(false);
    await this.acpController.stopAll();
    await this.ipcServer.stop();
    this.recordClientLog('info', 'node.stopped', 'ClientNode stopped', {
      clientId: this.client?.id ?? null,
    });
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

  getManagerHandler(): ManagerHandler {
    return this.managerHandler;
  }

  private async startManagerIfConfigured(): Promise<void> {
    const managerCfg = this.runtimeAgents.find((a) => a.type === 'manager');
    if (!managerCfg) return;
    if (this.config.dispatchMode !== 'manager' && this.config.dispatchMode !== 'hybrid') return;

    this.log(`Starting Manager agent ${managerCfg.id}...`);
    await this.managerHandler.startManager(managerCfg);
    if (this.managerHandler.isAvailable()) {
      this.dispatcher.setManagerAvailable(true);
      this.log(`Manager agent ready, dispatch mode=${this.config.dispatchMode}`);
    } else {
      this.log('Manager agent failed to start, falling back to tag rules if hybrid');
    }
  }

  private buildAgentInfos(): AgentInfo[] {
    return this.workerManager.getAllWorkers().map((w) => {
      const cfg = this.workerConfigsById.get(w.agentId);
      return {
        id: w.agentId,
        groupId: cfg?.groupId,
        type: 'worker' as const,
        status:
          w.status === 'idle'
            ? ('idle' as const)
            : w.status === 'busy'
              ? ('busy' as const)
              : w.status === 'crashed'
                ? ('error' as const)
                : ('idle' as const),
        currentTaskId: w.currentTaskId,
        capabilities: cfg?.capabilities ?? [],
      };
    });
  }

  private buildAgentRegistrations(): Array<{
    id: string;
    groupId?: string;
    type: 'manager' | 'worker';
    command: string;
    workDir: string;
    capabilities?: string[];
  }> {
    return this.runtimeAgents.map((agent) => ({
      id: agent.id,
      groupId: isWorkerRuntimeConfig(agent) ? agent.groupId : undefined,
      type: agent.type,
      command: agent.command,
      workDir: agent.workDir,
      capabilities: agent.capabilities,
    }));
  }

  private resolveWorkerAgentId(agentIdOrGroupId: string): string | undefined {
    if (this.workerManager.getWorkerState(agentIdOrGroupId)) {
      return agentIdOrGroupId;
    }

    const groupedIdle = this.workerManager
      .getIdleWorkers()
      .find((worker) => this.workerConfigsById.get(worker.agentId)?.groupId === agentIdOrGroupId);

    return groupedIdle?.agentId;
  }

  private async dispatchPendingTasks(): Promise<void> {
    if (this.dispatching || !this.client) return;
    this.dispatching = true;

    try {
      for (const task of this.pendingTasks) {
        const claimEntry = this.taskClaimCounts.get(task.id);
        if (claimEntry && claimEntry.count >= ClientNode.MAX_CLAIMS_PER_TASK) {
          this.log(
            `Skipping poisoned task ${task.id.slice(0, 8)} (claimed ${claimEntry.count} times, circuit breaker active)`,
          );
          continue;
        }

        const agents = this.buildAgentInfos();
        const decision = this.dispatcher.decide(task, agents);

        let targetAgentId: string | undefined;

        if (decision.action === 'dispatch') {
          targetAgentId = decision.agentId;
        } else if (decision.action === 'consult-manager') {
          const advice = await this.managerHandler.consultForDispatch(task, agents);
          if (advice && advice.recommendedAgentId) {
            targetAgentId = advice.recommendedAgentId;
            this.recordClientLog(
              'info',
              'dispatch.manager_advice',
              `Manager recommended ${advice.recommendedAgentId} (confidence=${advice.confidence})`,
              {
                taskId: task.id,
                recommendedAgentId: advice.recommendedAgentId,
                confidence: advice.confidence,
                reason: advice.reason,
              },
            );
          } else {
            this.log(`Manager provided no advice for task ${task.id.slice(0, 8)}, skipping`);
            continue;
          }
        } else {
          continue;
        }

        if (!targetAgentId) continue;
        const resolvedTargetAgentId = this.resolveWorkerAgentId(targetAgentId);
        if (!resolvedTargetAgentId) continue;
        const worker = this.workerManager.getWorkerState(resolvedTargetAgentId);
        if (!worker || worker.status !== 'idle') continue;

        try {
          await this.httpClient.claimTask(task.id, {
            clientId: this.client.id,
            agentId: resolvedTargetAgentId,
          });
          this.log(`Claimed task "${task.title}" → ${resolvedTargetAgentId}`);
          this.recordClientLog(
            'info',
            'task.claimed',
            `Claimed task "${task.title}" → ${resolvedTargetAgentId}`,
            { taskId: task.id, agentId: resolvedTargetAgentId },
          );

          const prevClaim = this.taskClaimCounts.get(task.id);
          this.taskClaimCounts.set(task.id, {
            count: (prevClaim?.count ?? 0) + 1,
            firstClaimed: prevClaim?.firstClaimed ?? Date.now(),
          });

          this.workerManager.assignTask(resolvedTargetAgentId, task.id);

          const agentCfg = this.runtimeAgentsById.get(resolvedTargetAgentId);
          if (agentCfg) {
            const outputDir = path.join(
              agentCfg.workDir,
              '.dispatch',
              'output',
              task.id.slice(0, 12),
            );
            await fs.promises.mkdir(outputDir, { recursive: true });
            this.taskOutputDirs.set(task.id, outputDir);

            let inputDir: string | undefined;
            if (task.attachments && task.attachments.length > 0) {
              inputDir = path.join(agentCfg.workDir, '.dispatch', 'input', task.id.slice(0, 12));
              await this.downloadAttachments(task, inputDir);
              this.taskInputDirs.set(task.id, inputDir);
            }

            const workerToken = this.config.token
              ? this.issueWorkerToken(resolvedTargetAgentId, task.id)
              : undefined;
            await this.acpController.launchAgent(
              agentCfg,
              task,
              outputDir,
              inputDir,
              workerToken,
              (dir) => this.scanWorkDir(dir),
            );
            this.log(
              `Launched agent ${resolvedTargetAgentId} for task ${task.id.slice(0, 8)} (outputDir=${outputDir}${inputDir ? `, inputDir=${inputDir}` : ''})`,
            );
            this.recordClientLog('info', 'task.launched', `Task ${task.id} launched on agent ${resolvedTargetAgentId}`, {
              taskId: task.id,
              agentId: resolvedTargetAgentId,
              outputDir,
              inputDir: inputDir ?? null,
            });
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

  private async handleTaskCompletion(
    agentId: string,
    taskId: string,
    stopReason: string,
  ): Promise<void> {
    this.revokeWorkerToken(agentId);

    if (!this.client) {
      this.markWorkerIdle(agentId);
      return;
    }

    let serverAcknowledged = false;

    if (stopReason === 'end_turn') {
      serverAcknowledged = await this.tryCompleteTask(agentId, taskId);
      if (!serverAcknowledged) {
        serverAcknowledged = await this.tryCancelTaskFallback(taskId, agentId);
      }
    } else {
      serverAcknowledged = await this.tryReleaseTask(taskId, agentId, stopReason);
    }

    if (serverAcknowledged) {
      this.markWorkerIdle(agentId);
    } else {
      this.log(
        `Worker ${agentId} kept busy — task ${taskId.slice(0, 8)} may be orphaned, ` +
          'awaiting server heartbeat timeout to reclaim',
      );
      this.recordClientLog('warn', 'task.orphan_risk', 'Server did not acknowledge task state change', {
        taskId,
        agentId,
        stopReason,
      });
    }
  }

  private async tryCompleteTask(agentId: string, taskId: string): Promise<boolean> {
    if (!this.client) return false;
    const clientId = this.client.id;
    for (let attempt = 0; attempt < ClientNode.COMPLETION_MAX_RETRIES; attempt++) {
      try {
        await this.httpClient.reportProgress(taskId, {
          clientId,
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
          this.recordClientLog('info', 'task.artifacts_collected', `Task ${taskId} artifacts uploaded`, {
            taskId,
            agentId,
            zipPath,
            resultPath,
            kind: 'full',
          });
        } else {
          const agentCfg = this.runtimeAgentsById.get(agentId);
          const fallbackDir = outputDir ?? agentCfg?.workDir ?? os.tmpdir();
          const minimal = await this.generateMinimalResult(fallbackDir, taskId);
          await this.httpClient.completeTask(taskId, minimal);
          this.log(`Task ${taskId.slice(0, 8)} completed with minimal result`);
          this.recordClientLog('info', 'task.artifacts_collected', `Task ${taskId} completed with minimal result`, {
            taskId,
            agentId,
            kind: 'minimal',
          });
        }

        this.taskOutputDirs.delete(taskId);
        this.taskInputDirs.delete(taskId);
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(
          `Complete attempt ${attempt + 1}/${ClientNode.COMPLETION_MAX_RETRIES} failed for task ${taskId.slice(0, 8)}: ${msg}`,
        );
        this.recordClientLog('error', 'task.completion_failed', msg, {
          taskId,
          agentId,
          attempt: attempt + 1,
        });
        if (attempt < ClientNode.COMPLETION_MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, ClientNode.COMPLETION_RETRY_DELAY));
        }
      }
    }
    return false;
  }

  private async tryCancelTaskFallback(taskId: string, agentId: string): Promise<boolean> {
    try {
      await this.httpClient.cancelTask(taskId, 'Completion failed after retries');
      this.log(`Task ${taskId.slice(0, 8)} cancelled as fallback after completion failure`);
      this.recordClientLog('warn', 'task.cancel_fallback', 'Task cancelled after completion failure', {
        taskId,
        agentId,
      });
      this.taskOutputDirs.delete(taskId);
      this.taskInputDirs.delete(taskId);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Fallback cancel also failed for task ${taskId.slice(0, 8)}: ${msg}`);
      return false;
    }
  }

  private async tryReleaseTask(taskId: string, _agentId: string, stopReason: string): Promise<boolean> {
    if (!this.client) return false;
    const clientId = this.client.id;
    for (let attempt = 0; attempt < ClientNode.COMPLETION_MAX_RETRIES; attempt++) {
      try {
        await this.httpClient.releaseTask(taskId, {
          clientId,
          reason: `Agent stopped: ${stopReason}`,
        });
        this.log(`Released task ${taskId.slice(0, 8)}: ${stopReason}`);
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(
          `Release attempt ${attempt + 1}/${ClientNode.COMPLETION_MAX_RETRIES} failed for task ${taskId.slice(0, 8)}: ${msg}`,
        );
        if (attempt < ClientNode.COMPLETION_MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, ClientNode.COMPLETION_RETRY_DELAY));
        }
      }
    }
    return false;
  }

  private async addWorkerAtRuntime(raw: {
    id?: string;
    type?: string;
    command: string;
    workDir: string;
    capabilities?: string[];
    autoClaimTags?: string[];
    maxConcurrency?: number;
    presetPrompt?: string;
  }): Promise<{ success: boolean; agentId: string; expandedIds: string[] }> {
    if (!raw.command || !raw.workDir) {
      throw new Error('command and workDir are required');
    }
    const agentId = raw.id ?? `worker-${uuid().slice(0, 8)}`;
    if (this.runtimeAgentsById.has(agentId)) {
      throw new Error(`Agent ${agentId} already exists`);
    }

    const workerConfig: WorkerConfig = {
      id: agentId,
      type: 'worker',
      command: raw.command,
      workDir: raw.workDir,
      capabilities: raw.capabilities,
      autoClaimTags: raw.autoClaimTags,
      maxConcurrency: raw.maxConcurrency,
      presetPrompt: raw.presetPrompt,
    };

    const expanded = buildRuntimeAgents([workerConfig]);
    const expandedIds: string[] = [];
    for (const cfg of expanded) {
      if (!isWorkerRuntimeConfig(cfg)) continue;
      this.runtimeAgents.push(cfg);
      this.runtimeAgentsById.set(cfg.id, cfg);
      this.workerConfigsById.set(cfg.id, cfg);
      this.workerManager.registerWorker(cfg);
      expandedIds.push(cfg.id);
    }

    await this.syncAgentsToServer();
    this.log(`Added worker ${agentId} (${expandedIds.length} slot(s)): ${expandedIds.join(', ')}`);
    this.recordClientLog('info', 'agent.added', `Added worker ${agentId}`, {
      agentId,
      expandedIds,
    });
    return { success: true, agentId, expandedIds };
  }

  private async removeWorkerAtRuntime(
    agentId: string,
    force = false,
  ): Promise<{ success: boolean; message: string; removedIds: string[] }> {
    const removedIds: string[] = [];

    const directWorker = this.workerConfigsById.get(agentId);
    if (directWorker) {
      const groupId = directWorker.groupId;
      const idsToRemove = this.runtimeAgents
        .filter((a) => isWorkerRuntimeConfig(a) && a.groupId === groupId)
        .map((a) => a.id);

      for (const id of idsToRemove) {
        const w = this.workerManager.getWorkerState(id);
        if (w?.status === 'busy' && w.currentTaskId) {
          if (!force) {
            throw new Error(
              `Worker ${id} is busy (task=${w.currentTaskId}). Use force to remove.`,
            );
          }
          await this.cancelRunningTask(w.currentTaskId, 'Worker removed (force)');
        }
        this.workerManager.unregisterWorker(id, true);
        this.runtimeAgentsById.delete(id);
        this.workerConfigsById.delete(id);
        removedIds.push(id);
      }
      this.runtimeAgents = this.runtimeAgents.filter((a) => !removedIds.includes(a.id));
    } else {
      const byGroup = this.runtimeAgents.filter(
        (a) => isWorkerRuntimeConfig(a) && a.groupId === agentId,
      );
      if (byGroup.length === 0) {
        throw new Error(`Agent ${agentId} not found`);
      }
      for (const cfg of byGroup) {
        const w = this.workerManager.getWorkerState(cfg.id);
        if (w?.status === 'busy' && w.currentTaskId) {
          if (!force) {
            throw new Error(
              `Worker ${cfg.id} is busy (task=${w.currentTaskId}). Use force to remove.`,
            );
          }
          await this.cancelRunningTask(w.currentTaskId, 'Worker removed (force)');
        }
        this.workerManager.unregisterWorker(cfg.id, true);
        this.runtimeAgentsById.delete(cfg.id);
        this.workerConfigsById.delete(cfg.id);
        removedIds.push(cfg.id);
      }
      this.runtimeAgents = this.runtimeAgents.filter((a) => !removedIds.includes(a.id));
    }

    await this.syncAgentsToServer();
    this.log(`Removed worker(s): ${removedIds.join(', ')}`);
    this.recordClientLog('info', 'agent.removed', `Removed ${removedIds.length} worker(s)`, {
      agentId,
      removedIds,
    });
    return { success: true, message: `Removed ${removedIds.length} worker(s)`, removedIds };
  }

  private async reloadAgentsFromConfig(configPath?: string): Promise<{
    added: string[];
    removed: string[];
    kept: string[];
  }> {
    const newConfig = loadClientConfig(configPath);
    const newRuntime = buildRuntimeAgents(newConfig.agents);

    const oldIds = new Set(this.runtimeAgents.map((a) => a.id));
    const newIds = new Set(newRuntime.map((a) => a.id));

    const toAdd = newRuntime.filter((a) => !oldIds.has(a.id));
    const toRemove = this.runtimeAgents.filter((a) => !newIds.has(a.id));
    const kept = this.runtimeAgents.filter((a) => newIds.has(a.id)).map((a) => a.id);

    const removedIds: string[] = [];
    for (const cfg of toRemove) {
      if (!isWorkerRuntimeConfig(cfg)) continue;
      const w = this.workerManager.getWorkerState(cfg.id);
      if (w?.status === 'busy' && w.currentTaskId) {
        await this.cancelRunningTask(w.currentTaskId, 'Worker removed during config reload');
      }
      this.workerManager.unregisterWorker(cfg.id, true);
      this.runtimeAgentsById.delete(cfg.id);
      this.workerConfigsById.delete(cfg.id);
      removedIds.push(cfg.id);
    }
    this.runtimeAgents = this.runtimeAgents.filter((a) => !removedIds.includes(a.id));

    const addedIds: string[] = [];
    for (const cfg of toAdd) {
      this.runtimeAgents.push(cfg);
      this.runtimeAgentsById.set(cfg.id, cfg);
      if (isWorkerRuntimeConfig(cfg)) {
        this.workerConfigsById.set(cfg.id, cfg);
        this.workerManager.registerWorker(cfg);
      }
      addedIds.push(cfg.id);
    }

    this.config = { ...this.config, agents: newConfig.agents };

    await this.syncAgentsToServer();
    this.log(
      `Config reloaded: +${addedIds.length} added, -${removedIds.length} removed, ${kept.length} kept`,
    );
    this.recordClientLog('info', 'config.reloaded', 'Agent config reloaded', {
      added: addedIds,
      removed: removedIds,
      kept,
    });
    return { added: addedIds, removed: removedIds, kept };
  }

  private async syncAgentsToServer(): Promise<void> {
    if (!this.client) return;
    try {
      await this.httpClient.updateAgents(this.client.id, this.buildAgentInfos());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Failed to sync agents to server: ${msg}`);
    }
  }

  private markWorkerIdle(agentId: string): void {
    const worker = this.workerManager.getWorkerState(agentId);
    if (worker) {
      worker.status = 'idle';
      worker.currentTaskId = undefined;
    }
  }

  async cancelRunningTask(
    taskId: string,
    reason: string,
  ): Promise<{ success: boolean; message: string }> {
    const worker = this.workerManager.getAllWorkers().find((w) => w.currentTaskId === taskId);
    if (!worker) {
      return { success: false, message: `No worker found running task ${taskId}` };
    }

    this.log(`Cancelling task ${taskId.slice(0, 8)} on agent ${worker.agentId}: ${reason}`);
    this.recordClientLog('info', 'task.cancelling', `Cancelling task ${taskId}: ${reason}`, {
      taskId,
      agentId: worker.agentId,
    });

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
        } catch {
          /* ignore read errors */
        }
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
    this.log(
      `Downloading ${task.attachments.length} attachment(s) for task ${task.id.slice(0, 8)}...`,
    );

    for (const attachment of task.attachments) {
      const destPath = path.join(inputDir, attachment.filename);
      try {
        await this.httpClient.downloadAttachment(task.id, attachment.filename, destPath);
        this.log(
          `  Downloaded: ${attachment.filename} (${(attachment.sizeBytes / 1024).toFixed(1)} KB)`,
        );
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

  private async uploadTaskLogs(
    agentId: string,
    taskId: string,
    entries: InteractionLogEntry[],
  ): Promise<void> {
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
      const resp = await this.httpClient.heartbeat(this.client.id, {
        agents: this.buildAgentInfos(),
      });
      if (this.consecutiveHeartbeatFailures > 0) {
        this.log(`Heartbeat recovered after ${this.consecutiveHeartbeatFailures} failures`);
      }
      this.consecutiveHeartbeatFailures = 0;
      this.flushClientLogs();

      // Server instructs us to cancel tasks that have been cancelled server-side
      if (resp.cancelTasks && resp.cancelTasks.length > 0) {
        for (const taskId of resp.cancelTasks) {
          this.log(`Server instructed cancel for task ${taskId.slice(0, 8)}`);
          void this.cancelRunningTask(taskId, 'Cancelled by server');
        }
      }
    } catch {
      this.consecutiveHeartbeatFailures++;
      this.log(
        `Heartbeat failed (${this.consecutiveHeartbeatFailures}/${ClientNode.HEARTBEAT_FAIL_THRESHOLD})`,
      );
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
          agents: this.buildAgentRegistrations(),
        });
        this.acpController.setClientId(this.client.id);
        this.consecutiveHeartbeatFailures = 0;
        this.reconnecting = false;
        await this.reconcileOrphanedTasks();
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
              await this.reconcileOrphanedTasks();
              this.poller.start();
              this.log(`Reconnected (reused) as ${this.client.id}`);
              this.recordClientLog(
                'info',
                'node.reconnected',
                `Reconnected (reused) as ${this.client.id}`,
              );
              return;
            }
          } catch {
            /* fall through to retry */
          }
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

  private trackCompletion(promise: Promise<void>): void {
    this.pendingCompletions.add(promise);
    promise.finally(() => this.pendingCompletions.delete(promise));
  }

  private async reconcileOrphanedTasks(): Promise<void> {
    if (!this.client) return;
    const clientId = this.client.id;
    try {
      const allTasks = await this.httpClient.listTasks({});
      const taskMap = new Map(allTasks.map((t) => [t.id, t]));

      // Forward reconcile: release tasks that Server thinks we own but we have no worker for
      const myOrphans = allTasks.filter(
        (t) =>
          (t.status === 'in_progress' || t.status === 'claimed') &&
          t.claimedBy?.clientId === clientId,
      );

      const activeTaskIds = new Set(
        this.workerManager
          .getAllWorkers()
          .filter((w) => w.currentTaskId)
          .map((w) => w.currentTaskId),
      );

      let released = 0;
      for (const task of myOrphans) {
        if (!activeTaskIds.has(task.id)) {
          try {
            await this.httpClient.releaseTask(task.id, {
              clientId,
              reason: 'Orphan cleanup after client reconnect',
            });
            released++;
            this.log(`Released orphaned task ${task.id.slice(0, 8)} (was ${task.status})`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.log(`Failed to release orphaned task ${task.id.slice(0, 8)}: ${msg}`);
          }
        }
      }
      if (released > 0) {
        this.recordClientLog('info', 'task.orphan_cleanup', `Released ${released} orphaned task(s)`, {
          released,
          total: myOrphans.length,
        });
      }

      // Reverse reconcile: stop workers whose tasks have been cancelled on the Server
      let cancelled = 0;
      for (const worker of this.workerManager.getAllWorkers()) {
        if (!worker.currentTaskId) continue;
        const serverTask = taskMap.get(worker.currentTaskId);
        if (!serverTask || serverTask.status === 'cancelled') {
          try {
            await this.cancelRunningTask(
              worker.currentTaskId,
              'Task was cancelled on server during reconcile',
            );
            cancelled++;
            this.log(
              `Stopped worker for cancelled task ${worker.currentTaskId.slice(0, 8)} (server status: ${serverTask?.status ?? 'not found'})`,
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.log(
              `Failed to stop worker for cancelled task ${worker.currentTaskId.slice(0, 8)}: ${msg}`,
            );
          }
        }
      }
      if (cancelled > 0) {
        this.recordClientLog(
          'info',
          'task.cancelled_reconcile',
          `Stopped ${cancelled} worker(s) for server-cancelled tasks`,
          { cancelled },
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Orphan reconciliation failed: ${msg}`);
    }
  }

  private startClaimCountCleanup(): void {
    if (this.claimCountCleanupTimer) return;
    this.claimCountCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [taskId, entry] of this.taskClaimCounts) {
        if (now - entry.firstClaimed > ClientNode.CLAIM_COUNT_TTL) {
          this.taskClaimCounts.delete(taskId);
        }
      }
    }, 60_000);
    this.claimCountCleanupTimer.unref();
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
      throw Object.assign(new Error(`Role '${role}' is not allowed for worker commands`), {
        code: 'FORBIDDEN',
      });
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

      case 'config.reload': {
        const cr = payload as { configPath?: string } | undefined;
        return this.reloadAgentsFromConfig(cr?.configPath);
      }

      case 'agent.add': {
        const a = payload as {
          id?: string;
          type?: string;
          command: string;
          workDir: string;
          capabilities?: string[];
          autoClaimTags?: string[];
          maxConcurrency?: number;
          presetPrompt?: string;
        };
        return this.addWorkerAtRuntime(a);
      }

      case 'agent.remove': {
        const r = payload as { agentId: string; force?: boolean };
        return this.removeWorkerAtRuntime(r.agentId, r.force);
      }

      case 'agent.list':
        return this.buildAgentInfos();

      case 'agent.status': {
        const as = payload as { agentId: string };
        const state = this.workerManager.getWorkerState(as.agentId);
        if (!state) throw new Error(`Agent ${as.agentId} not found`);
        const cfg = this.workerConfigsById.get(as.agentId);
        return {
          ...state,
          config: cfg
            ? { command: cfg.command, workDir: cfg.workDir, capabilities: cfg.capabilities, groupId: cfg.groupId }
            : undefined,
        };
      }

      case 'agent.restart': {
        const ar = payload as { agentId: string };
        const worker = this.workerManager.getWorkerState(ar.agentId);
        if (!worker) throw new Error(`Agent ${ar.agentId} not found`);
        if (worker.status === 'busy' && worker.currentTaskId) {
          await this.cancelRunningTask(worker.currentTaskId, 'Agent restart requested');
        }
        this.acpController.stopAgent(ar.agentId);
        worker.status = 'idle';
        worker.currentTaskId = undefined;
        worker.restartCount = 0;
        return { success: true, message: `Agent ${ar.agentId} restarted` };
      }

      default:
        throw new Error(`Unknown IPC command: ${command}`);
    }
  }
}

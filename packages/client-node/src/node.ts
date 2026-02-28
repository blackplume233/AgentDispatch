import os from 'node:os';
import type { Client, ClientConfig, Task, AgentInfo } from '@agentdispatch/shared';
import { ServerHttpClient } from './http/server-client.js';
import { IPCServer } from './ipc/ipc-server.js';
import { TaskPoller } from './polling/task-poller.js';
import { Dispatcher } from './dispatch/dispatcher.js';
import { AcpController } from './acp/acp-controller.js';
import { WorkerManager } from './agents/worker-manager.js';

export class ClientNode {
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

  constructor(config: ClientConfig) {
    this.config = config;
    this.httpClient = new ServerHttpClient(config.serverUrl);
    this.ipcServer = new IPCServer(config.ipc.path, (cmd, payload) => this.handleIPC(cmd, payload));
    this.poller = new TaskPoller(this.httpClient, config.polling.interval, (tasks) => {
      this.pendingTasks = tasks;
      void this.dispatchPendingTasks();
    });
    this.dispatcher = new Dispatcher(config);
    this.acpController = new AcpController(config, {
      onAgentStarted: (agentId, pid) => {
        this.log(`Agent ${agentId} started (pid=${pid ?? 'unknown'})`);
      },
      onAgentExited: (agentId, code, signal) => {
        this.log(`Agent ${agentId} exited (code=${code}, signal=${signal})`);
        this.workerManager.handleWorkerExit(agentId, code);
      },
      onAgentError: (agentId, error) => {
        this.log(`Agent ${agentId} error: ${error}`);
      },
      onStopReason: (agentId, taskId, reason) => {
        this.log(`Agent ${agentId} task ${taskId} stop: ${reason}`);
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
    this.acpController.setClientId(this.client.id);
    this.startHeartbeat();
    this.poller.start();
    return this.client;
  }

  async unregister(): Promise<void> {
    if (this.client) {
      await this.httpClient.unregisterClient(this.client.id);
      this.client = null;
    }
    this.stopHeartbeat();
    this.poller.stop();
    await this.acpController.stopAll();
  }

  async stop(): Promise<void> {
    this.poller.stop();
    this.stopHeartbeat();
    await this.acpController.stopAll();
    await this.ipcServer.stop();
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

          this.workerManager.assignTask(decision.agentId, task.id);

          const agentCfg = this.config.agents.find((a) => a.id === decision.agentId);
          if (agentCfg) {
            await this.acpController.launchAgent(agentCfg, task);
            this.log(`Launched agent ${decision.agentId} for task ${task.id.slice(0, 8)}`);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log(`Claim/launch failed for task ${task.id.slice(0, 8)}: ${msg}`);
        }
      }
    } finally {
      this.dispatching = false;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.client) {
        void this.httpClient.heartbeat(this.client.id, {
          agents: this.buildAgentInfos(),
        }).catch(() => {});
      }
    }, this.config.heartbeat.interval);
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

  private async handleIPC(command: string, payload: unknown): Promise<unknown> {
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

      case 'worker.complete': {
        const c = payload as {
          taskId: string;
          agentId: string;
          zipPath: string;
          resultPath: string;
        };
        if (!this.client) throw new Error('Not registered');
        const task = await this.httpClient.completeTask(c.taskId, {
          zipPath: c.zipPath,
          resultPath: c.resultPath,
        });
        const worker = this.workerManager.getWorkerState(c.agentId);
        if (worker) {
          worker.status = 'idle';
          worker.currentTaskId = undefined;
        }
        this.log(`Task ${c.taskId.slice(0, 8)} completed by ${c.agentId}`);
        return task;
      }

      case 'worker.fail': {
        const f = payload as {
          taskId: string;
          agentId: string;
          reason: string;
        };
        if (!this.client) throw new Error('Not registered');
        await this.httpClient.releaseTask(f.taskId, {
          clientId: this.client.id,
          reason: f.reason,
        });
        const worker = this.workerManager.getWorkerState(f.agentId);
        if (worker) {
          worker.status = 'idle';
          worker.currentTaskId = undefined;
        }
        this.log(`Task ${f.taskId.slice(0, 8)} failed by ${f.agentId}: ${f.reason}`);
        return { success: true };
      }

      case 'worker.status': {
        const s = payload as { agentId: string };
        return this.workerManager.getWorkerState(s.agentId) ?? { error: 'Worker not found' };
      }

      case 'config.show':
        return this.config;

      default:
        throw new Error(`Unknown IPC command: ${command}`);
    }
  }
}

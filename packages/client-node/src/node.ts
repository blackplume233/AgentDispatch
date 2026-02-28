import os from 'node:os';
import type { Client, ClientConfig, Task } from '@agentdispatch/shared';
import { ServerHttpClient } from './http/server-client.js';
import { IPCServer } from './ipc/ipc-server.js';
import { TaskPoller } from './polling/task-poller.js';

export class ClientNode {
  private config: ClientConfig;
  private httpClient: ServerHttpClient;
  private ipcServer: IPCServer;
  private poller: TaskPoller;
  private client: Client | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pendingTasks: Task[] = [];

  constructor(config: ClientConfig) {
    this.config = config;
    this.httpClient = new ServerHttpClient(config.serverUrl);
    this.ipcServer = new IPCServer(config.ipc.path, (cmd, payload) => this.handleIPC(cmd, payload));
    this.poller = new TaskPoller(this.httpClient, config.polling.interval, (tasks) => {
      this.pendingTasks = tasks;
    });
  }

  async start(): Promise<void> {
    await this.ipcServer.start();
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
  }

  async stop(): Promise<void> {
    this.poller.stop();
    this.stopHeartbeat();
    await this.ipcServer.stop();
  }

  getStatus(): {
    registered: boolean;
    clientId: string | null;
    serverUrl: string;
    ipcPath: string;
    polling: boolean;
  } {
    return {
      registered: this.client !== null,
      clientId: this.client?.id ?? null,
      serverUrl: this.config.serverUrl,
      ipcPath: this.config.ipc.path,
      polling: this.poller.isRunning(),
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

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.client) {
        void this.httpClient.heartbeat(this.client.id, {});
      }
    }, this.config.heartbeat.interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
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
          clientId: string;
          agentId: string;
          progress: number;
          message?: string;
        };
        await this.httpClient.reportProgress(p.taskId, {
          clientId: p.clientId,
          agentId: p.agentId,
          progress: p.progress,
          message: p.message,
        });
        return { success: true };
      }
      case 'config.show':
        return this.config;
      default:
        throw new Error(`Unknown IPC command: ${command}`);
    }
  }
}

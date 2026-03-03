import type { ManagerConfig } from '@agentdispatch/shared';
import { AgentProcess } from '@agentdispatch/acp';
import { createAcpConnection } from '@agentdispatch/acp';
import type {
  AcpClient,
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  KillTerminalCommandRequest,
  KillTerminalCommandResponse,
  ClientSideConnection,
} from '@agentdispatch/acp';
import type { Logger } from '../utils/logger.js';

export interface ServerManagerOptions {
  agentConfig: ManagerConfig;
  heartbeatInterval?: number;
  restartOnFailure?: boolean;
  maxRestartAttempts?: number;
  restartDelay?: number;
}

/**
 * Minimal ACP client stub for the server-side Manager agent.
 * Captures no response content — the server manager is only used for
 * liveness / heartbeat probing, not prompt-based consultation.
 */
class ManagerAcpClient implements AcpClient {
  async sessionUpdate(_params: SessionNotification): Promise<void> {}
  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const option = params.options.find((o) => o.kind === 'allow_once') ?? params.options[0];
    return { outcome: { outcome: 'selected', optionId: option?.optionId ?? '' } };
  }
  async readTextFile(_p: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    return { content: '' };
  }
  async writeTextFile(_p: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    return {};
  }
  async createTerminal(_p: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    return { terminalId: '' };
  }
  async terminalOutput(_p: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    return { output: '', truncated: false };
  }
  async releaseTerminal(_p: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse | undefined> {
    return undefined;
  }
  async waitForTerminalExit(_p: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
    return { exitCode: -1 };
  }
  async killTerminal(_p: KillTerminalCommandRequest): Promise<KillTerminalCommandResponse | undefined> {
    return undefined;
  }
  async extMethod(_m: string, _p: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {};
  }
  async extNotification(_m: string, _p: Record<string, unknown>): Promise<void> {}
}

type ManagerState = 'stopped' | 'starting' | 'running' | 'restarting' | 'failed';

export class ServerManagerService {
  private state: ManagerState = 'stopped';
  private agentProcess: AgentProcess | null = null;
  private connection: ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private restartAttempts = 0;

  private readonly agentConfig: ManagerConfig;
  private readonly heartbeatInterval: number;
  private readonly restartOnFailure: boolean;
  private readonly maxRestartAttempts: number;
  private readonly restartDelay: number;
  private readonly logger: Logger;

  constructor(opts: ServerManagerOptions, logger: Logger) {
    this.agentConfig = opts.agentConfig;
    this.heartbeatInterval = opts.heartbeatInterval ?? 30_000;
    this.restartOnFailure = opts.restartOnFailure ?? true;
    this.maxRestartAttempts = opts.maxRestartAttempts ?? 3;
    this.restartDelay = opts.restartDelay ?? 5_000;
    this.logger = logger;
  }

  /** Start the Manager agent and begin heartbeat monitoring. */
  async start(): Promise<void> {
    if (this.state !== 'stopped' && this.state !== 'failed') return;
    this.restartAttempts = 0;
    await this.launchAgent();
    this.scheduleHeartbeat();
  }

  /** Stop heartbeat monitoring and terminate the Manager agent. */
  async stop(): Promise<void> {
    this.clearHeartbeat();
    await this.killAgent();
    this.state = 'stopped';
    this.logger.info('ServerManager stopped', {
      category: 'server-manager',
      event: 'server_manager.stopped',
    });
  }

  isAvailable(): boolean {
    return this.state === 'running';
  }

  getState(): ManagerState {
    return this.state;
  }

  getConnection(): ClientSideConnection | null {
    return this.connection;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  // ─── private ────────────────────────────────────────────────────────────────

  private async launchAgent(): Promise<void> {
    this.state = 'starting';
    this.logger.info('Starting ServerManager agent', {
      category: 'server-manager',
      event: 'server_manager.starting',
      context: { agentId: this.agentConfig.id },
    });

    try {
      const acpClient = new ManagerAcpClient();
      const handle = await createAcpConnection({
        agentConfig: this.agentConfig,
        acpClient,
        processEvents: {
          onExit: (code, signal) => {
            this.logger.warn('ServerManager agent exited unexpectedly', {
              category: 'server-manager',
              event: 'server_manager.exit',
              context: { agentId: this.agentConfig.id, code, signal },
            });
            this.agentProcess = null;
            this.connection = null;
            this.sessionId = null;
            if (this.state === 'running') {
              this.state = 'failed';
              void this.handleFailure();
            }
          },
          onStderr: (data) => {
            this.logger.debug(`ServerManager stderr: ${data.trim()}`, {
              category: 'server-manager',
            });
          },
        },
        clientInfo: { name: 'AgentDispatch-ServerManager', version: '0.0.1' },
      });

      this.agentProcess = handle.process;
      this.connection = handle.connection;
      this.sessionId = handle.sessionId;
      this.state = 'running';
      this.restartAttempts = 0;

      this.logger.info('ServerManager agent started', {
        category: 'server-manager',
        event: 'server_manager.started',
        context: { agentId: this.agentConfig.id, pid: handle.process.getPid() },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Failed to start ServerManager agent', {
        category: 'server-manager',
        event: 'server_manager.start_failed',
        context: { agentId: this.agentConfig.id, error: msg },
      });
      this.state = 'failed';
    }
  }

  private async killAgent(): Promise<void> {
    if (this.agentProcess) {
      this.agentProcess.kill();
      this.agentProcess = null;
    }
    this.connection = null;
    this.sessionId = null;
  }

  private scheduleHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat();
    }, this.heartbeatInterval);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Periodic health check: verify the agent process is still running. */
  private async heartbeat(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'starting' || this.state === 'restarting') {
      return;
    }

    const alive = this.agentProcess?.isRunning() ?? false;

    if (!alive) {
      this.logger.warn('ServerManager heartbeat: agent not running', {
        category: 'server-manager',
        event: 'server_manager.heartbeat_miss',
        context: { agentId: this.agentConfig.id },
      });
      this.state = 'failed';
      await this.handleFailure();
      return;
    }

    this.logger.debug('ServerManager heartbeat: ok', {
      category: 'server-manager',
      event: 'server_manager.heartbeat_ok',
      context: { agentId: this.agentConfig.id, pid: this.agentProcess?.getPid() },
    });
  }

  private async handleFailure(): Promise<void> {
    if (!this.restartOnFailure) {
      this.logger.error('ServerManager agent failed; restart disabled', {
        category: 'server-manager',
        event: 'server_manager.failed',
        context: { agentId: this.agentConfig.id },
      });
      return;
    }

    if (this.restartAttempts >= this.maxRestartAttempts) {
      this.logger.error('ServerManager agent exceeded max restart attempts', {
        category: 'server-manager',
        event: 'server_manager.max_restarts_exceeded',
        context: { agentId: this.agentConfig.id, attempts: this.restartAttempts },
      });
      this.state = 'failed';
      return;
    }

    this.restartAttempts++;
    this.state = 'restarting';

    this.logger.info('Scheduling ServerManager restart', {
      category: 'server-manager',
      event: 'server_manager.restart_scheduled',
      context: {
        agentId: this.agentConfig.id,
        attempt: this.restartAttempts,
        maxAttempts: this.maxRestartAttempts,
        delayMs: this.restartDelay,
      },
    });

    await new Promise<void>((resolve) => setTimeout(resolve, this.restartDelay));

    if (this.state !== 'restarting') return;

    await this.killAgent();
    await this.launchAgent();
  }
}

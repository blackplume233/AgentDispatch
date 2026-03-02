import type { Task, AgentConfig, ClientConfig, InteractionLogEntry } from '@agentdispatch/shared';
import { RequestError } from '@agentclientprotocol/sdk';
import type { ClientSideConnection, StopReason } from '@agentclientprotocol/sdk';
import { createAcpConnection, AgentProcess } from '@agentdispatch/acp';
import { DispatchAcpClient } from './dispatch-acp-client.js';
import { TaskWorkflowRunner } from '../workflow/task-workflow-runner.js';
import { InitialTaskPass } from '../workflow/passes/initial-task-pass.js';
import { ArtifactEnforcementPass } from '../workflow/passes/artifact-enforcement-pass.js';
import type { WorkflowContext } from '../workflow/task-workflow.js';

export interface AcpControllerEvents {
  onAgentStarted: (agentId: string, pid: number | undefined) => void;
  onAgentExited: (agentId: string, code: number | null, signal: string | null) => void;
  onAgentError: (agentId: string, error: string) => void;
  onTaskCompleted: (agentId: string, taskId: string, stopReason: StopReason) => void;
  onLogBatch: (agentId: string, taskId: string, entries: InteractionLogEntry[]) => void;
  onProgress: (agentId: string, taskId: string, status: string) => void;
}

export class AcpController {
  private processes: Map<string, AgentProcess> = new Map();
  private clients: Map<string, DispatchAcpClient> = new Map();
  private connections: Map<string, ClientSideConnection> = new Map();
  private events: AcpControllerEvents;
  private _nodeConfig: ClientConfig;

  constructor(nodeConfig: ClientConfig, events: AcpControllerEvents) {
    this._nodeConfig = nodeConfig;
    this.events = events;
  }

  setClientId(_clientId: string): void {
    // Reserved for future use (e.g. passing client context to agents)
  }

  async launchAgent(
    agentConfig: AgentConfig,
    task: Task,
    outputDir?: string,
    inputDir?: string,
    workerToken?: string,
    scanWorkDir?: (dir: string) => Promise<string[]>,
  ): Promise<void> {
    const extraEnv: Record<string, string> = {
      ...(agentConfig.env ?? {}),
    };
    if (workerToken) {
      extraEnv['DISPATCH_TOKEN'] = workerToken;
      extraEnv['DISPATCH_IPC_PATH'] = this._nodeConfig.ipc.path;
    }

    const acpClient = new DispatchAcpClient(
      agentConfig,
      (entries) => { this.events.onLogBatch(agentConfig.id, task.id, entries); },
      (status) => { this.events.onProgress(agentConfig.id, task.id, status); },
    );
    this.clients.set(agentConfig.id, acpClient);

    acpClient.flushLogs();
    this.events.onProgress(agentConfig.id, task.id, 'Initializing agent...');

    void this.runAcpSession(agentConfig, task, acpClient, extraEnv, outputDir, inputDir, scanWorkDir).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.events.onAgentError(agentConfig.id, `ACP session error: ${msg}`);
    });
  }

  private async runAcpSession(
    agentConfig: AgentConfig,
    task: Task,
    acpClient: DispatchAcpClient,
    extraEnv: Record<string, string>,
    outputDir?: string,
    inputDir?: string,
    scanWorkDir?: (dir: string) => Promise<string[]>,
  ): Promise<void> {
    try {
      let handle;
      try {
        handle = await createAcpConnection({
          agentConfig,
          acpClient,
          extraEnv,
          processEvents: {
            onExit: (code, signal) => {
              this.processes.delete(agentConfig.id);
              this.events.onAgentExited(agentConfig.id, code, signal);
            },
            onStderr: (data) => {
              this.events.onAgentError(agentConfig.id, data);
            },
          },
          clientInfo: { name: 'AgentDispatch', version: '0.0.1' },
        });
      } catch (connErr: unknown) {
        if (connErr instanceof RequestError && (connErr as { code?: number }).code === -32000) {
          this.events.onAgentError(agentConfig.id, 'Agent requires authentication. Run "claude /login" first.');
        }
        throw connErr;
      }

      this.processes.set(agentConfig.id, handle.process);
      this.connections.set(agentConfig.id, handle.connection);
      this.events.onAgentStarted(agentConfig.id, handle.process.getPid());

      const effectiveOutputDir = outputDir ?? agentConfig.workDir;
      const scanFn = scanWorkDir ?? (async () => [] as string[]);

      const ctx: WorkflowContext = {
        connection: handle.connection,
        sessionId: handle.sessionId,
        task,
        agentConfig,
        outputDir: effectiveOutputDir,
        inputDir,
        acpClient,
        scanOutputDir: () => scanFn(effectiveOutputDir),
        log: (msg) => this.events.onProgress(agentConfig.id, task.id, msg),
        reportProgress: (msg) => this.events.onProgress(agentConfig.id, task.id, msg),
      };

      const runner = this.createWorkflowRunner();
      const result = await runner.run(ctx);

      acpClient.flushLogs();
      this.events.onTaskCompleted(agentConfig.id, task.id, result.finalStopReason);
    } catch (err: unknown) {
      acpClient.flushLogs();
      const msg = err instanceof Error ? err.message : String(err);
      this.events.onAgentError(agentConfig.id, `ACP session failed: ${msg}`);
      this.events.onTaskCompleted(agentConfig.id, task.id, 'cancelled');
    } finally {
      acpClient.destroy();
      this.clients.delete(agentConfig.id);
      this.connections.delete(agentConfig.id);
    }
  }

  private createWorkflowRunner(): TaskWorkflowRunner {
    return new TaskWorkflowRunner([
      new InitialTaskPass(),
      new ArtifactEnforcementPass(),
    ]);
  }

  stopAgent(agentId: string): void {
    const proc = this.processes.get(agentId);
    if (proc) {
      proc.kill();
    }
    const client = this.clients.get(agentId);
    if (client) {
      client.destroy();
      this.clients.delete(agentId);
    }
    this.connections.delete(agentId);
  }

  isAgentRunning(agentId: string): boolean {
    const proc = this.processes.get(agentId);
    return proc?.isRunning() ?? false;
  }

  getRunningAgentIds(): string[] {
    return Array.from(this.processes.keys()).filter((id) =>
      this.isAgentRunning(id),
    );
  }

  getClient(agentId: string): DispatchAcpClient | undefined {
    return this.clients.get(agentId);
  }

  getNodeConfig(): ClientConfig {
    return this._nodeConfig;
  }

  async stopAll(): Promise<void> {
    for (const [id] of this.processes) {
      this.stopAgent(id);
    }
  }
}

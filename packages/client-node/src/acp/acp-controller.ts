import { Readable, Writable } from 'node:stream';
import type { Task, AgentConfig, ClientConfig, InteractionLogEntry } from '@agentdispatch/shared';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, RequestError } from '@agentclientprotocol/sdk';
import type { StopReason } from '@agentclientprotocol/sdk';
import { AgentProcess } from './agent-process.js';
import { DispatchAcpClient } from './dispatch-acp-client.js';

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

  async launchAgent(agentConfig: AgentConfig, task: Task): Promise<void> {
    const agentProcess = new AgentProcess(agentConfig, {
      onExit: (code, signal) => {
        this.processes.delete(agentConfig.id);
        this.events.onAgentExited(agentConfig.id, code, signal);
      },
      onStderr: (data) => {
        this.events.onAgentError(agentConfig.id, data);
      },
    });

    const { stdin, stdout } = agentProcess.start();
    this.processes.set(agentConfig.id, agentProcess);
    this.events.onAgentStarted(agentConfig.id, agentProcess.getPid());

    const acpClient = new DispatchAcpClient(
      agentConfig,
      (entries) => { this.events.onLogBatch(agentConfig.id, task.id, entries); },
      (status) => { this.events.onProgress(agentConfig.id, task.id, status); },
    );
    this.clients.set(agentConfig.id, acpClient);

    const output = Writable.toWeb(stdin as import('node:stream').Writable);
    const input = Readable.toWeb(stdout as import('node:stream').Readable);
    const stream = ndJsonStream(
      output as WritableStream<Uint8Array>,
      input as ReadableStream<Uint8Array>,
    );

    const connection = new ClientSideConnection(
      (_agent) => acpClient,
      stream,
    );
    this.connections.set(agentConfig.id, connection);

    // Record the prompt as a log entry
    acpClient.flushLogs();

    void this.runAcpSession(agentConfig, task, connection, acpClient).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.events.onAgentError(agentConfig.id, `ACP session error: ${msg}`);
    });
  }

  private async runAcpSession(
    agentConfig: AgentConfig,
    task: Task,
    connection: ClientSideConnection,
    acpClient: DispatchAcpClient,
  ): Promise<void> {
    try {
      const caps = agentConfig.acpCapabilities;
      await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: caps?.fs ? {
            readTextFile: caps.fs.readTextFile,
            writeTextFile: caps.fs.writeTextFile,
          } : undefined,
          terminal: caps?.terminal,
        },
        clientInfo: {
          name: 'AgentDispatch',
          version: '0.0.1',
        },
      });

      let session;
      try {
        session = await connection.newSession({
          cwd: agentConfig.workDir,
          mcpServers: [],
        });
      } catch (sessionErr: unknown) {
        if (sessionErr instanceof RequestError && sessionErr.code === -32000) {
          this.events.onAgentError(agentConfig.id, 'Agent requires authentication. Run "claude /login" first.');
          throw sessionErr;
        }
        throw sessionErr;
      }

      const promptText = this.buildTaskPrompt(task);

      acpClient.flushLogs();

      const result = await connection.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: 'text', text: promptText }],
      });

      acpClient.flushLogs();
      this.events.onTaskCompleted(agentConfig.id, task.id, result.stopReason);
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

  private buildTaskPrompt(task: Task): string {
    const parts = [`Task: ${task.title}`];
    if (task.description) {
      parts.push(`\nDescription:\n${task.description}`);
    }
    if (task.tags.length > 0) {
      parts.push(`\nTags: ${task.tags.join(', ')}`);
    }
    if (task.metadata) {
      parts.push(`\nMetadata: ${JSON.stringify(task.metadata)}`);
    }
    parts.push(`\nIMPORTANT: Write all output files to the current working directory. The files you create will be automatically collected as task artifacts.`);
    return parts.join('\n');
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

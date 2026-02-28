import type { Task, AgentConfig, ClientConfig } from '@agentdispatch/shared';
import { AgentProcess } from './agent-process.js';
import { DispatchAcpClient } from './dispatch-acp-client.js';
import type { StopReason } from './types.js';

export interface AcpControllerEvents {
  onAgentStarted: (agentId: string, pid: number | undefined) => void;
  onAgentExited: (agentId: string, code: number | null, signal: string | null) => void;
  onAgentError: (agentId: string, error: string) => void;
  onStopReason: (agentId: string, taskId: string, reason: StopReason) => void;
}

export class AcpController {
  private processes: Map<string, AgentProcess> = new Map();
  private clients: Map<string, DispatchAcpClient> = new Map();
  private events: AcpControllerEvents;
  private _nodeConfig: ClientConfig;

  constructor(nodeConfig: ClientConfig, events: AcpControllerEvents) {
    this._nodeConfig = nodeConfig;
    this.events = events;
  }

  async launchAgent(agentConfig: AgentConfig, _task?: Task): Promise<void> {
    const acpClient = new DispatchAcpClient(agentConfig);
    this.clients.set(agentConfig.id, acpClient);

    const agentProcess = new AgentProcess(agentConfig, {
      onExit: (code, signal) => {
        this.processes.delete(agentConfig.id);
        this.events.onAgentExited(agentConfig.id, code, signal);
      },
      onStderr: (data) => {
        this.events.onAgentError(agentConfig.id, data);
      },
    });

    try {
      agentProcess.start();
      this.processes.set(agentConfig.id, agentProcess);
      this.events.onAgentStarted(agentConfig.id, agentProcess.getPid());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.events.onAgentError(agentConfig.id, `Failed to start: ${message}`);
      throw err;
    }
  }

  stopAgent(agentId: string): void {
    const proc = this.processes.get(agentId);
    if (proc) {
      proc.kill();
    }
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

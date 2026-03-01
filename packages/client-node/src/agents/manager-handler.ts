import { Readable, Writable } from 'node:stream';
import type { Client as AcpClient, SessionNotification, RequestPermissionRequest, RequestPermissionResponse, ReadTextFileRequest, ReadTextFileResponse, WriteTextFileRequest, WriteTextFileResponse, CreateTerminalRequest, CreateTerminalResponse, TerminalOutputRequest, TerminalOutputResponse, ReleaseTerminalRequest, ReleaseTerminalResponse, WaitForTerminalExitRequest, WaitForTerminalExitResponse, KillTerminalCommandRequest, KillTerminalCommandResponse } from '@agentclientprotocol/sdk';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { AgentConfig, ClientConfig, Task, AgentInfo } from '@agentdispatch/shared';
import { AgentProcess } from '../acp/agent-process.js';

export interface DispatchAdvice {
  taskId: string;
  recommendedAgentId: string;
  confidence: number;
  reason?: string;
}

export interface ManagerHandlerOptions {
  consultTimeout?: number;
  log?: (msg: string) => void;
  onAudit?: (event: string, detail: Record<string, unknown>) => void;
}

/**
 * Minimal ACP client for the Manager Agent that captures text output
 * from session updates rather than driving a full Worker workflow.
 */
class ManagerAcpClient implements AcpClient {
  private responseText = '';

  clearResponse(): void { this.responseText = ''; }
  getResponseText(): string { return this.responseText; }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    const update = params.update;
    if ((update as { sessionUpdate: string }).sessionUpdate === 'agent_message_chunk') {
      const content = (update as { content?: { type: string; text?: string } }).content;
      if (content?.type === 'text' && content.text) {
        this.responseText += content.text;
      }
    }
  }

  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const option = params.options.find((o) => o.kind === 'allow_once') ?? params.options[0];
    return { outcome: { outcome: 'selected', optionId: option?.optionId ?? '' } };
  }

  async readTextFile(_params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    return { content: '' };
  }
  async writeTextFile(_params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    return {};
  }
  async createTerminal(_params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    return { terminalId: '' };
  }
  async terminalOutput(_params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    return { output: '', truncated: false };
  }
  async releaseTerminal(_params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse | undefined> {
    return undefined;
  }
  async waitForTerminalExit(_params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
    return { exitCode: -1 };
  }
  async killTerminal(_params: KillTerminalCommandRequest): Promise<KillTerminalCommandResponse | undefined> {
    return undefined;
  }
  async extMethod(_method: string, _params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {};
  }
  async extNotification(_method: string, _params: Record<string, unknown>): Promise<void> {}
}

export class ManagerHandler {
  private available = false;
  private agentId: string | null = null;
  private connection: ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private agentProcess: AgentProcess | null = null;
  private managerClient: ManagerAcpClient | null = null;
  private consultTimeout: number;
  private log: (msg: string) => void;
  private onAudit: (event: string, detail: Record<string, unknown>) => void;

  constructor(_config: ClientConfig, opts?: ManagerHandlerOptions) {
    this.consultTimeout = opts?.consultTimeout ?? 30_000;
    this.log = opts?.log ?? (() => {});
    this.onAudit = opts?.onAudit ?? (() => {});
  }

  async startManager(agentConfig: AgentConfig): Promise<void> {
    if (this.available) return;
    this.agentId = agentConfig.id;

    try {
      const agentProc = new AgentProcess(agentConfig, {
        onExit: (_code, _signal) => {
          this.log(`Manager agent ${agentConfig.id} exited (code=${_code})`);
          this.setUnavailable();
        },
        onStderr: (data) => {
          this.log(`Manager agent stderr: ${data.trim()}`);
        },
      });

      const { stdin, stdout } = agentProc.start();
      this.agentProcess = agentProc;

      const mgrClient = new ManagerAcpClient();
      this.managerClient = mgrClient;

      const output = Writable.toWeb(stdin as import('node:stream').Writable);
      const input = Readable.toWeb(stdout as import('node:stream').Readable);
      const stream = ndJsonStream(
        output as WritableStream<Uint8Array>,
        input as ReadableStream<Uint8Array>,
      );

      const connection = new ClientSideConnection(
        (_agent) => mgrClient,
        stream,
      );
      this.connection = connection;

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
        clientInfo: { name: 'AgentDispatch-Manager', version: '0.0.1' },
      });

      const session = await connection.newSession({
        cwd: agentConfig.workDir,
        mcpServers: [],
      });
      this.sessionId = session.sessionId;
      this.available = true;

      this.log(`Manager agent ${agentConfig.id} started (pid=${agentProc.getPid()})`);
      this.onAudit('manager.started', { agentId: agentConfig.id, pid: agentProc.getPid() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Failed to start Manager agent: ${msg}`);
      this.onAudit('manager.start_failed', { agentId: agentConfig.id, error: msg });
      this.setUnavailable();
    }
  }

  async stopManager(): Promise<void> {
    if (this.agentProcess) {
      this.agentProcess.kill();
      this.agentProcess = null;
    }
    this.managerClient = null;
    this.connection = null;
    this.sessionId = null;
    this.setUnavailable();
    this.log('Manager agent stopped');
  }

  setAvailable(agentId: string): void {
    this.agentId = agentId;
    this.available = true;
  }

  setUnavailable(): void {
    this.available = false;
  }

  isAvailable(): boolean {
    return this.available;
  }

  getAgentId(): string | null {
    return this.agentId;
  }

  async consultForDispatch(task: Task, agents: AgentInfo[]): Promise<DispatchAdvice | null> {
    if (!this.available || !this.connection || !this.sessionId || !this.managerClient) return null;

    const promptText = this.buildConsultPrompt(task, agents);
    this.onAudit('manager.consult_request', {
      taskId: task.id,
      taskTitle: task.title,
      agentCount: agents.length,
    });

    this.managerClient.clearResponse();

    try {
      const result = await Promise.race([
        this.connection.prompt({
          sessionId: this.sessionId,
          prompt: [{ type: 'text', text: promptText }],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Manager consultation timeout')), this.consultTimeout),
        ),
      ]);

      const responseText = this.managerClient.getResponseText();
      const advice = this.parseAdvice(task.id, result.stopReason, responseText);
      this.onAudit('manager.consult_response', {
        taskId: task.id,
        advice: advice ?? 'null',
        stopReason: result.stopReason,
        responsePreview: responseText.slice(0, 200),
      });
      return advice;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Manager consultation failed for task ${task.id.slice(0, 8)}: ${msg}`);
      this.onAudit('manager.consult_failed', { taskId: task.id, error: msg });
      return null;
    }
  }

  buildConsultPrompt(task: Task, agents: AgentInfo[]): string {
    const workerList = agents
      .filter((a) => a.type === 'worker')
      .map((a) => `  - ${a.id}: status=${a.status}, capabilities=[${a.capabilities.join(', ')}]${a.currentTaskId ? ` (busy: ${a.currentTaskId.slice(0, 8)})` : ''}`)
      .join('\n');

    return `You are a dispatch manager. Analyze the following task and available workers, then recommend which worker should handle it.

## Task
- ID: ${task.id}
- Title: ${task.title}
- Description: ${task.description ?? 'N/A'}
- Tags: [${task.tags.join(', ')}]
- Priority: ${task.priority}
${task.metadata ? `- Metadata: ${JSON.stringify(task.metadata)}` : ''}

## Available Workers
${workerList || '  (no workers registered)'}

## Instructions
Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
\`\`\`
{"recommendedAgentId": "<worker-id>", "confidence": <0.0-1.0>, "reason": "<brief explanation>"}
\`\`\`

If no worker is suitable, respond with:
\`\`\`
{"recommendedAgentId": "", "confidence": 0, "reason": "<why no worker fits>"}
\`\`\``;
  }

  parseAdvice(taskId: string, stopReason: string, text: string): DispatchAdvice | null {
    if (stopReason !== 'end_turn') return null;
    if (!text) return null;

    try {
      const jsonMatch = text.match(/\{[\s\S]*?"recommendedAgentId"[\s\S]*?\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        recommendedAgentId?: string;
        confidence?: number;
        reason?: string;
      };

      if (!parsed.recommendedAgentId) return null;

      return {
        taskId,
        recommendedAgentId: parsed.recommendedAgentId,
        confidence: parsed.confidence ?? 0.5,
        reason: parsed.reason,
      };
    } catch {
      this.log(`Failed to parse Manager advice: ${text.slice(0, 200)}`);
      return null;
    }
  }
}

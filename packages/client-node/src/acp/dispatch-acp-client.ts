import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { v4 as uuid } from 'uuid';
import type { Client as AcpClient } from '@agentclientprotocol/sdk';
import type {
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
} from '@agentclientprotocol/sdk';
import type { AgentConfig, InteractionLogEntry, InteractionStepType } from '@agentdispatch/shared';

export type PermissionPolicy = 'auto-allow' | 'auto-deny' | 'prompt';

export interface LogBatchCallback {
  (entries: InteractionLogEntry[]): void;
}

export interface ProgressCallback {
  (status: string): void;
}

const LOG_FLUSH_INTERVAL = 2000;
const LOG_BATCH_SIZE = 20;
const PROGRESS_THROTTLE_MS = 3000;

export class DispatchAcpClient implements AcpClient {
  private agentConfig: AgentConfig;
  private policy: PermissionPolicy;
  private logBuffer: InteractionLogEntry[] = [];
  private onLogBatch: LogBatchCallback;
  private onProgress: ProgressCallback | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private terminals: Map<string, ChildProcess> = new Map();

  private textBuffer: string = '';
  private thinkingBuffer: string = '';
  private promptBuffer: string = '';
  private currentSessionId: string = '';
  private flushingStreams: boolean = false;
  private lastProgressTime: number = 0;
  private lastProgressText: string = '';

  constructor(agentConfig: AgentConfig, onLogBatch: LogBatchCallback, onProgress?: ProgressCallback) {
    this.agentConfig = agentConfig;
    this.policy = (agentConfig.permissionPolicy as PermissionPolicy) ?? 'auto-allow';
    this.onLogBatch = onLogBatch;
    this.onProgress = onProgress ?? null;

    this.flushTimer = setInterval(() => this.flushLogs(), LOG_FLUSH_INTERVAL);
  }

  private flushStreamBuffers(): void {
    if (this.flushingStreams) return;
    this.flushingStreams = true;
    try {
      const sessionId = this.currentSessionId || undefined;
      if (this.textBuffer.length > 0) {
        const text = this.textBuffer;
        this.textBuffer = '';
        this.record('text', text, { sessionUpdate: 'agent_message_chunk' }, { sessionId });
      }
      if (this.thinkingBuffer.length > 0) {
        const text = this.thinkingBuffer;
        this.thinkingBuffer = '';
        this.record('thinking', text, { sessionUpdate: 'agent_thought_chunk' }, { sessionId });
      }
      if (this.promptBuffer.length > 0) {
        const text = this.promptBuffer;
        this.promptBuffer = '';
        this.record('prompt', text, { sessionUpdate: 'user_message_chunk' }, { sessionId });
      }
    } finally {
      this.flushingStreams = false;
    }
  }

  private notifyProgress(status: string, force?: boolean): void {
    if (!this.onProgress) return;
    const now = Date.now();
    if (!force && status === this.lastProgressText) return;
    if (!force && now - this.lastProgressTime < PROGRESS_THROTTLE_MS) return;
    this.lastProgressTime = now;
    this.lastProgressText = status;
    this.onProgress(status);
  }

  destroy(): void {
    this.flushStreamBuffers();
    this.flushLogs();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    for (const [id, proc] of this.terminals) {
      try { proc.kill(); } catch { /* ignore */ }
      this.terminals.delete(id);
    }
  }

  private record(type: InteractionStepType, content: string, raw?: Record<string, unknown>, metadata?: InteractionLogEntry['metadata']): void {
    const entry: InteractionLogEntry = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      type,
      content,
      raw,
      metadata,
    };
    this.logBuffer.push(entry);
    if (this.logBuffer.length >= LOG_BATCH_SIZE) {
      this.flushLogs();
    }
  }

  flushLogs(): void {
    this.flushStreamBuffers();
    if (this.logBuffer.length === 0) return;
    const batch = this.logBuffer.splice(0);
    this.onLogBatch(batch);
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    const update = params.update;
    const sessionId = params.sessionId;

    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const text = update.content?.type === 'text' ? (update.content as { text: string }).text : '';
        this.currentSessionId = sessionId;
        this.textBuffer += text;
        this.notifyProgress('Responding...');
        break;
      }
      case 'agent_thought_chunk': {
        const text = update.content?.type === 'text' ? (update.content as { text: string }).text : '';
        this.currentSessionId = sessionId;
        this.thinkingBuffer += text;
        this.notifyProgress('Thinking...');
        break;
      }
      case 'user_message_chunk': {
        const text = update.content?.type === 'text' ? (update.content as { text: string }).text : '';
        this.currentSessionId = sessionId;
        this.promptBuffer += text;
        break;
      }
      case 'tool_call': {
        this.flushStreamBuffers();
        const tc = update as unknown as { toolCallId: string; title: string; kind?: string; status?: string };
        this.notifyProgress(`Calling: ${tc.title ?? 'tool'}`, true);
        this.record('tool_call', tc.title ?? 'tool_call', {
          sessionUpdate: update.sessionUpdate,
          toolCallId: tc.toolCallId,
          kind: tc.kind,
          status: tc.status,
        }, {
          toolCallId: tc.toolCallId,
          toolName: tc.title,
          toolKind: tc.kind,
          status: tc.status,
          sessionId,
        });
        break;
      }
      case 'tool_call_update': {
        this.flushStreamBuffers();
        const tcu = update as unknown as { toolCallId: string; title?: string; kind?: string; status?: string };
        if (tcu.status === 'completed') {
          this.notifyProgress(`Done: ${tcu.title ?? 'tool'}`, true);
        } else if (tcu.status) {
          this.notifyProgress(`${tcu.title ?? 'tool'} (${tcu.status})`, true);
        }
        this.record('tool_call_update', tcu.title ?? `tool_call_update ${tcu.toolCallId}`, {
          sessionUpdate: update.sessionUpdate,
          toolCallId: tcu.toolCallId,
          kind: tcu.kind,
          status: tcu.status,
        }, {
          toolCallId: tcu.toolCallId,
          toolName: tcu.title ?? undefined,
          toolKind: tcu.kind,
          status: tcu.status,
          sessionId,
        });
        break;
      }
      case 'plan': {
        const plan = update as unknown as { entries?: Array<{ content: string; status: string }> };
        const entries = plan.entries ?? [];
        const inProgress = entries.find((e) => e.status === 'in_progress' || e.status === 'active');
        const statusText = inProgress
          ? inProgress.content
          : entries.find((e) => e.status !== 'completed' && e.status !== 'done')?.content ?? 'Planning';
        this.notifyProgress(statusText);
        const summary = entries.map((e) => `[${e.status}] ${e.content}`).join('\n') || 'plan';
        this.record('plan', summary, { sessionUpdate: update.sessionUpdate, plan: update }, { sessionId });
        break;
      }
      default: {
        this.record('system', `session_update: ${(update as { sessionUpdate: string }).sessionUpdate}`, {
          sessionUpdate: (update as { sessionUpdate: string }).sessionUpdate,
          raw: update as unknown as Record<string, unknown>,
        }, { sessionId });
        break;
      }
    }
  }

  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const toolCall = params.toolCall;
    const description = toolCall?.title ?? 'unknown operation';

    switch (this.policy) {
      case 'auto-allow': {
        const option = params.options.find((o) => o.kind === 'allow_once' || o.kind === 'allow_always');
        const oid = option?.optionId ?? params.options[0]?.optionId ?? '';
        this.record('permission', `Auto-allow: ${description}`, {
          toolCallId: toolCall?.toolCallId,
          policy: this.policy,
          optionId: oid,
        }, {
          toolCallId: toolCall?.toolCallId,
          toolName: description,
          status: 'allowed',
          sessionId: params.sessionId,
        });
        return { outcome: { outcome: 'selected', optionId: oid } };
      }
      case 'auto-deny': {
        const option = params.options.find((o) => o.kind === 'reject_once' || o.kind === 'reject_always');
        const oid = option?.optionId ?? params.options[0]?.optionId ?? '';
        this.record('permission', `Auto-deny: ${description}`, {
          toolCallId: toolCall?.toolCallId,
          policy: this.policy,
          optionId: oid,
        }, {
          toolCallId: toolCall?.toolCallId,
          toolName: description,
          status: 'denied',
          sessionId: params.sessionId,
        });
        return { outcome: { outcome: 'selected', optionId: oid } };
      }
      default: {
        const option = params.options.find((o) => o.kind === 'allow_once');
        const oid = option?.optionId ?? params.options[0]?.optionId ?? '';
        this.record('permission', `Prompt-allow: ${description}`, {
          toolCallId: toolCall?.toolCallId,
          policy: this.policy,
          optionId: oid,
        }, {
          toolCallId: toolCall?.toolCallId,
          toolName: description,
          status: 'allowed',
          sessionId: params.sessionId,
        });
        return { outcome: { outcome: 'selected', optionId: oid } };
      }
    }
  }

  async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    const filePath = params.path;
    try {
      let content = await fs.promises.readFile(filePath, 'utf-8');
      if (params.line || params.limit) {
        const lines = content.split('\n');
        const start = (params.line ?? 1) - 1;
        const end = params.limit ? start + params.limit : lines.length;
        content = lines.slice(start, end).join('\n');
      }
      this.record('fs_read', `Read: ${filePath} (${content.length} chars)`, undefined, { filePath });
      return { content };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.record('error', `readTextFile failed: ${filePath}: ${msg}`, undefined, { filePath });
      throw err;
    }
  }

  async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    const filePath = params.path;
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, params.content, 'utf-8');
      this.record('fs_write', `Write: ${filePath} (${params.content.length} chars)`, undefined, { filePath });
      return {};
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.record('error', `writeTextFile failed: ${filePath}: ${msg}`, undefined, { filePath });
      throw err;
    }
  }

  async createTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    const id = uuid();
    const proc = spawn(params.command, params.args ?? [], {
      cwd: params.cwd ?? this.agentConfig.workDir,
      env: params.env ? { ...process.env, ...Object.fromEntries(params.env.map((e) => [e.name, e.value])) } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    this.terminals.set(id, proc);
    this.record('terminal', `Terminal created: ${params.command} ${(params.args ?? []).join(' ')}`, { terminalId: id });
    return { terminalId: id };
  }

  async terminalOutput(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    const proc = this.terminals.get(params.terminalId);
    if (!proc) {
      return { output: '', truncated: false, exitStatus: { exitCode: -1 } };
    }
    return { output: '', truncated: false };
  }

  async releaseTerminal(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse | undefined> {
    const proc = this.terminals.get(params.terminalId);
    if (proc) {
      try { proc.kill(); } catch { /* ignore */ }
      this.terminals.delete(params.terminalId);
    }
    this.record('terminal', `Terminal released: ${params.terminalId}`, { terminalId: params.terminalId });
    return undefined;
  }

  async waitForTerminalExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
    const proc = this.terminals.get(params.terminalId);
    if (!proc) {
      return { exitCode: -1 };
    }
    return new Promise((resolve) => {
      proc.on('exit', (code, signal) => {
        resolve({ exitCode: code ?? -1, signal: signal ?? undefined });
      });
    });
  }

  async killTerminal(params: KillTerminalCommandRequest): Promise<KillTerminalCommandResponse | undefined> {
    const proc = this.terminals.get(params.terminalId);
    if (proc) {
      try { proc.kill(); } catch { /* ignore */ }
    }
    this.record('terminal', `Terminal killed: ${params.terminalId}`, { terminalId: params.terminalId });
    return undefined;
  }

  async extMethod(_method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.record('system', `extMethod: ${_method}`, params);
    return {};
  }

  async extNotification(_method: string, params: Record<string, unknown>): Promise<void> {
    this.record('system', `extNotification: ${_method}`, params);
  }

  getWorkDir(): string {
    return this.agentConfig.workDir;
  }
}

import { readFileSync, createWriteStream } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  Task,
  TaskAttachment,
  Client,
  RegisterClientDTO,
  HeartbeatDTO,
  HeartbeatResponse,
  ProgressDTO,
  ClaimTaskDTO,
  ReleaseTaskDTO,
  AgentInfo,
  InteractionLogEntry,
  ClientLogEntry,
} from '@agentdispatch/shared';

export interface CompleteTaskOptions {
  zipPath: string;
  resultPath: string;
}

export class ServerHttpClient {
  private baseUrl: string;
  private token?: string;

  constructor(serverUrl: string, token?: string) {
    this.baseUrl = serverUrl.replace(/\/$/, '') + '/api/v1';
    this.token = token;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private authHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    if (response.status === 204) return undefined as T;
    const data = await response.json();
    if (!response.ok) {
      const err = data as { error?: { code?: string; message?: string } };
      throw new Error(err.error?.message ?? `HTTP ${response.status}`);
    }
    return data as T;
  }

  async listTasks(params?: { status?: string; tag?: string }): Promise<Task[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.tag) query.set('tag', params.tag);
    const qs = query.toString();
    return this.request<Task[]>('GET', `/tasks${qs ? '?' + qs : ''}`);
  }

  async getTask(taskId: string): Promise<Task> {
    return this.request<Task>('GET', `/tasks/${taskId}`);
  }

  async claimTask(taskId: string, dto: ClaimTaskDTO): Promise<Task> {
    return this.request<Task>('POST', `/tasks/${taskId}/claim`, dto);
  }

  async releaseTask(taskId: string, dto: ReleaseTaskDTO): Promise<Task> {
    return this.request<Task>('POST', `/tasks/${taskId}/release`, dto);
  }

  async reportProgress(taskId: string, dto: ProgressDTO): Promise<void> {
    await this.request<unknown>('POST', `/tasks/${taskId}/progress`, dto);
  }

  async cancelTask(taskId: string, reason?: string): Promise<Task> {
    return this.request<Task>('POST', `/tasks/${taskId}/cancel`, { reason });
  }

  async failTask(taskId: string, clientId: string, reason: string): Promise<Task> {
    return this.request<Task>('POST', `/tasks/${taskId}/fail`, { clientId, reason });
  }

  async registerClient(dto: RegisterClientDTO): Promise<Client> {
    return this.request<Client>('POST', '/clients/register', dto);
  }

  async listClients(): Promise<Client[]> {
    return this.request<Client[]>('GET', '/clients');
  }

  async unregisterClient(clientId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/clients/${clientId}`);
  }

  async heartbeat(clientId: string, dto: HeartbeatDTO): Promise<HeartbeatResponse> {
    return this.request<HeartbeatResponse>('POST', `/clients/${clientId}/heartbeat`, dto);
  }

  async updateAgents(clientId: string, agents: AgentInfo[]): Promise<Client> {
    return this.request<Client>('PATCH', `/clients/${clientId}/agents`, agents);
  }

  async appendTaskLogs(
    taskId: string,
    clientId: string,
    agentId: string,
    entries: InteractionLogEntry[],
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.request<undefined>('POST', `/tasks/${taskId}/logs`, {
      clientId,
      agentId,
      entries,
    });
  }

  async appendClientLogs(clientId: string, entries: ClientLogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.request<undefined>('POST', `/clients/${clientId}/logs`, { entries });
  }

  async listAttachments(taskId: string): Promise<TaskAttachment[]> {
    return this.request<TaskAttachment[]>('GET', `/tasks/${taskId}/attachments`);
  }

  async downloadAttachment(taskId: string, filename: string, destPath: string): Promise<void> {
    const url = `${this.baseUrl}/tasks/${taskId}/attachments/${encodeURIComponent(filename)}`;
    const response = await fetch(url, { headers: this.authHeaders() });
    if (!response.ok) {
      throw new Error(`Failed to download attachment "${filename}": HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error(`Empty response body for attachment "${filename}"`);
    }
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    const readable = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
    await pipeline(readable, createWriteStream(destPath));
  }

  async completeTask(taskId: string, opts: CompleteTaskOptions): Promise<Task> {
    const zipBuf = readFileSync(opts.zipPath);
    const resultBuf = readFileSync(opts.resultPath);
    const zipName = path.basename(opts.zipPath);
    const resultName = path.basename(opts.resultPath);

    const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
    const parts: Buffer[] = [];

    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="zip"; filename="${zipName}"\r\nContent-Type: application/zip\r\n\r\n`,
    ));
    parts.push(zipBuf);
    parts.push(Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="result"; filename="${resultName}"\r\nContent-Type: application/json\r\n\r\n`,
    ));
    parts.push(resultBuf);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const url = `${this.baseUrl}/tasks/${taskId}/complete`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...this.authHeaders() },
      body,
    });

    const data = await response.json();
    if (!response.ok) {
      const err = data as { error?: { code?: string; message?: string } };
      throw new Error(err.error?.message ?? `HTTP ${response.status}`);
    }
    return data as Task;
  }
}

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  Task,
  Client,
  RegisterClientDTO,
  HeartbeatDTO,
  ProgressDTO,
  ClaimTaskDTO,
  ReleaseTaskDTO,
  AgentInfo,
} from '@agentdispatch/shared';

export interface CompleteTaskOptions {
  zipPath: string;
  resultPath: string;
}

export class ServerHttpClient {
  private baseUrl: string;

  constructor(serverUrl: string) {
    this.baseUrl = serverUrl.replace(/\/$/, '') + '/api/v1';
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
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

  async registerClient(dto: RegisterClientDTO): Promise<Client> {
    return this.request<Client>('POST', '/clients/register', dto);
  }

  async unregisterClient(clientId: string): Promise<void> {
    await this.request<undefined>('DELETE', `/clients/${clientId}`);
  }

  async heartbeat(clientId: string, dto: HeartbeatDTO): Promise<void> {
    await this.request<undefined>('POST', `/clients/${clientId}/heartbeat`, dto);
  }

  async updateAgents(clientId: string, agents: AgentInfo[]): Promise<Client> {
    return this.request<Client>('PATCH', `/clients/${clientId}/agents`, agents);
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
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
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

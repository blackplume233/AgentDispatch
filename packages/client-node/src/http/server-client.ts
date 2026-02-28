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

export class ServerHttpClient {
  private baseUrl: string;

  constructor(serverUrl: string) {
    this.baseUrl = serverUrl.replace(/\/$/, '') + '/api/v1';
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
}

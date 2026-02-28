import type { Task, Client, CreateTaskInput, InteractionLogEntry, ClientLogEntry, ArtifactFileEntry } from "@/types";

const BASE = "/api/v1";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, options);
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  tasks: {
    list: (params?: { status?: string }): Promise<Task[]> => {
      const qs = params?.status ? `?status=${params.status}` : "";
      return request<Task[]>("GET", `/tasks${qs}`);
    },
    get: (id: string): Promise<Task> => request<Task>("GET", `/tasks/${id}`),
    create: (input: CreateTaskInput): Promise<Task> => request<Task>("POST", "/tasks", input),
    cancel: (id: string): Promise<Task> => request<Task>("POST", `/tasks/${id}/cancel`, {}),
    delete: (id: string): Promise<undefined> => request<undefined>("DELETE", `/tasks/${id}`),
  },
  clients: {
    list: (): Promise<Client[]> => request<Client[]>("GET", "/clients"),
    get: (id: string): Promise<Client> => request<Client>("GET", `/clients/${id}`),
  },
  taskLogs: {
    list: (taskId: string, afterId?: string): Promise<InteractionLogEntry[]> => {
      const qs = afterId ? `?after=${afterId}` : "";
      return request<InteractionLogEntry[]>("GET", `/tasks/${taskId}/logs${qs}`);
    },
  },
  clientLogs: {
    list: (clientId: string, afterId?: string): Promise<ClientLogEntry[]> => {
      const qs = afterId ? `?after=${afterId}` : "";
      return request<ClientLogEntry[]>("GET", `/clients/${clientId}/logs${qs}`);
    },
  },
  artifacts: {
    listFiles: (taskId: string): Promise<ArtifactFileEntry[]> =>
      request<ArtifactFileEntry[]>("GET", `/tasks/${taskId}/artifacts/files`),
    getFileContent: async (taskId: string, filePath: string): Promise<string> => {
      const res = await fetch(`${BASE}/tasks/${taskId}/artifacts/files/${filePath}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    downloadZipUrl: (taskId: string): string =>
      `${BASE}/tasks/${taskId}/artifacts/download`,
    downloadFileUrl: (taskId: string, filePath: string): string =>
      `${BASE}/tasks/${taskId}/artifacts/files/${filePath}`,
  },
};

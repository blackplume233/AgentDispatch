import type { Task, TaskSummary, TaskAttachment, Client, CreateTaskInput, InteractionLogEntry, ClientLogEntry, ArtifactFileEntry } from "@/types";

const BASE = "/api/v1";
const TOKEN_KEY = "dispatch_token";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handle401(res: Response): void {
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "/login";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, options);
  if (res.status === 204) return undefined as T;
  handle401(res);
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
    create: (input: CreateTaskInput, files?: File[]): Promise<Task> => {
      if (files && files.length > 0) {
        const formData = new FormData();
        formData.append("data", JSON.stringify(input));
        for (const file of files) {
          formData.append("files", file, file.name);
        }
        return fetch(`${BASE}/tasks`, { method: "POST", headers: authHeaders(), body: formData })
          .then(async (res) => {
            handle401(res);
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
              throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
            }
            return res.json() as Promise<Task>;
          });
      }
      return request<Task>("POST", "/tasks", input);
    },
    cancel: (id: string): Promise<Task> => request<Task>("POST", `/tasks/${id}/cancel`, {}),
    delete: (id: string): Promise<undefined> => request<undefined>("DELETE", `/tasks/${id}`),
    listArchived: (params?: { search?: string; page?: number; limit?: number }): Promise<TaskSummary[]> => {
      const parts: string[] = [];
      if (params?.search) parts.push(`search=${encodeURIComponent(params.search)}`);
      if (params?.page) parts.push(`page=${params.page}`);
      if (params?.limit) parts.push(`limit=${params.limit}`);
      const qs = parts.length > 0 ? `?${parts.join("&")}` : "";
      return request<TaskSummary[]>("GET", `/tasks/archived${qs}`);
    },
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
  attachments: {
    list: (taskId: string): Promise<TaskAttachment[]> =>
      request<TaskAttachment[]>("GET", `/tasks/${taskId}/attachments`),
    downloadUrl: (taskId: string, filename: string): string =>
      `${BASE}/tasks/${taskId}/attachments/${encodeURIComponent(filename)}`,
  },
  artifacts: {
    listFiles: (taskId: string): Promise<ArtifactFileEntry[]> =>
      request<ArtifactFileEntry[]>("GET", `/tasks/${taskId}/artifacts/files`),
    getFileContent: async (taskId: string, filePath: string): Promise<string> => {
      const res = await fetch(`${BASE}/tasks/${taskId}/artifacts/files/${filePath}`, { headers: authHeaders() });
      handle401(res);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    downloadZipUrl: (taskId: string): string =>
      `${BASE}/tasks/${taskId}/artifacts/download`,
    downloadFileUrl: (taskId: string, filePath: string): string =>
      `${BASE}/tasks/${taskId}/artifacts/files/${filePath}`,
  },
};

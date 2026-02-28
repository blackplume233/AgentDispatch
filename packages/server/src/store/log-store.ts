import fs from 'node:fs';
import path from 'node:path';
import type { InteractionLogEntry, ClientLogEntry } from '@agentdispatch/shared';

export class LogStore {
  private logsDir: string;

  constructor(logsDir: string) {
    this.logsDir = logsDir;
  }

  async init(): Promise<void> {
    await fs.promises.mkdir(path.join(this.logsDir, 'tasks'), { recursive: true });
    await fs.promises.mkdir(path.join(this.logsDir, 'clients'), { recursive: true });
  }

  private taskLogPath(taskId: string): string {
    return path.join(this.logsDir, 'tasks', `${taskId}.jsonl`);
  }

  private clientLogPath(clientId: string): string {
    return path.join(this.logsDir, 'clients', `${clientId}.jsonl`);
  }

  async appendTaskLogs(taskId: string, entries: InteractionLogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.promises.appendFile(this.taskLogPath(taskId), lines, 'utf-8');
  }

  async getTaskLogs(taskId: string, afterId?: string): Promise<InteractionLogEntry[]> {
    return this.readJsonl<InteractionLogEntry>(this.taskLogPath(taskId), afterId);
  }

  async appendClientLogs(clientId: string, entries: ClientLogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.promises.appendFile(this.clientLogPath(clientId), lines, 'utf-8');
  }

  async getClientLogs(clientId: string, afterId?: string): Promise<ClientLogEntry[]> {
    return this.readJsonl<ClientLogEntry>(this.clientLogPath(clientId), afterId);
  }

  private async readJsonl<T extends { id: string }>(filePath: string, afterId?: string): Promise<T[]> {
    let content: string;
    try {
      content = await fs.promises.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }

    const lines = content.trim().split('\n').filter(Boolean);
    const entries: T[] = lines.map((line) => JSON.parse(line) as T);

    if (!afterId) return entries;

    const idx = entries.findIndex((e) => e.id === afterId);
    if (idx === -1) return entries;
    return entries.slice(idx + 1);
  }
}

import fs from 'node:fs';
import path from 'node:path';
import type { Task, TaskSummary } from '@agentdispatch/shared';
import { toTaskSummary } from '@agentdispatch/shared';
import { FileStore } from './file-store.js';

export interface ArchiveListFilters {
  tag?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class ArchiveIndex {
  private index: Map<string, TaskSummary> = new Map();
  private store: FileStore;
  private archiveDir: string;
  private indexPath: string;

  constructor(archiveDir: string) {
    this.archiveDir = archiveDir;
    this.indexPath = path.join(archiveDir, 'index.json');
    this.store = new FileStore(archiveDir);
  }

  async init(): Promise<void> {
    await this.store.init();
    const loaded = await this.loadIndexFile();
    if (!loaded) {
      await this.rebuild();
    }
  }

  has(taskId: string): boolean {
    return this.index.has(taskId);
  }

  getSummary(taskId: string): TaskSummary | null {
    return this.index.get(taskId) ?? null;
  }

  async addSummary(task: Task): Promise<void> {
    this.index.set(task.id, toTaskSummary(task));
    await this.persist();
  }

  async removeSummary(taskId: string): Promise<void> {
    if (this.index.delete(taskId)) {
      await this.persist();
    }
  }

  listSummaries(filters?: ArchiveListFilters): TaskSummary[] {
    let results = Array.from(this.index.values());

    if (filters?.tag) {
      const tag = filters.tag;
      results = results.filter((s) => s.tags.includes(tag));
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (filters?.page !== undefined && filters?.limit !== undefined) {
      const start = (filters.page - 1) * filters.limit;
      results = results.slice(start, start + filters.limit);
    }

    return results;
  }

  size(): number {
    return this.index.size;
  }

  private async loadIndexFile(): Promise<boolean> {
    try {
      const content = await fs.promises.readFile(this.indexPath, 'utf-8');
      const entries = JSON.parse(content) as TaskSummary[];
      if (!Array.isArray(entries)) return false;
      this.index.clear();
      for (const entry of entries) {
        if (entry.id && entry.title) {
          this.index.set(entry.id, { ...entry, archived: true });
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  async rebuild(): Promise<void> {
    this.index.clear();
    const files = await this.store.listFiles(this.archiveDir, '.json');
    for (const file of files) {
      if (file === 'index.json') continue;
      const filePath = path.join(this.archiveDir, file);
      const task = await this.store.readJson<Task>(filePath);
      if (task?.id && task.title) {
        this.index.set(task.id, toTaskSummary(task));
      }
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    const entries = Array.from(this.index.values());
    await this.store.atomicWrite(this.indexPath, JSON.stringify(entries, null, 2));
  }
}

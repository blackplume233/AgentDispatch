import type { Task } from '@agentdispatch/shared';

interface CacheEntry {
  task: Task;
  lastAccess: number;
}

const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes

export class ArchiveCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxAge: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxAge: number = 3600000) {
    this.maxAge = maxAge;
  }

  start(): void {
    this.cleanupTimer = setInterval(() => this.evictStale(), CLEANUP_INTERVAL);
  }

  get(taskId: string): Task | null {
    const entry = this.cache.get(taskId);
    if (!entry) return null;
    entry.lastAccess = Date.now();
    return entry.task;
  }

  set(taskId: string, task: Task): void {
    this.cache.set(taskId, { task, lastAccess: Date.now() });
  }

  remove(taskId: string): void {
    this.cache.delete(taskId);
  }

  size(): number {
    return this.cache.size;
  }

  private evictStale(): void {
    const now = Date.now();
    for (const [id, entry] of this.cache) {
      if (now - entry.lastAccess > this.maxAge) {
        this.cache.delete(id);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }
}

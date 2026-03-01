import type { Task } from '@agentdispatch/shared';
import { TERMINAL_TASK_STATUSES } from '@agentdispatch/shared';
import type { TaskStore } from '../store/task-store.js';
import type { ArchiveIndex } from '../store/archive-index.js';
import type { OperationQueue } from '../queue/operation-queue.js';
import type { Logger } from '../utils/logger.js';

export class ArchiveScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private store: TaskStore,
    private archiveIndex: ArchiveIndex,
    private queue: OperationQueue,
    private logger: Logger,
    private checkInterval: number = 3600000,
    private archiveAfterDays: number = 1,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.run(), this.checkInterval);
    void this.run();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const tasks = await this.store.list();
      const cutoff = this.getCutoffDate();
      const toArchive = tasks.filter(
        (t) =>
          TERMINAL_TASK_STATUSES.includes(t.status) &&
          new Date(t.updatedAt).getTime() < cutoff,
      );

      if (toArchive.length === 0) return;

      this.logger.info(`Archiving ${toArchive.length} task(s)`, {
        category: 'archive',
        event: 'archive.batch_start',
        context: { count: toArchive.length },
      });

      for (const task of toArchive) {
        await this.archiveOne(task);
      }

      this.logger.info(`Archive batch complete`, {
        category: 'archive',
        event: 'archive.batch_done',
        context: { archived: toArchive.length },
      });
    } catch (err) {
      this.logger.error('Archive scheduler error', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.running = false;
    }
  }

  private async archiveOne(task: Task): Promise<void> {
    await this.queue.enqueue({
      type: 'task.archive',
      execute: async () => {
        const moved = await this.store.moveToArchive(task.id);
        if (moved) {
          await this.archiveIndex.addSummary(task);
        }
      },
    });
  }

  private getCutoffDate(): number {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return today.getTime() - (this.archiveAfterDays - 1) * 86400000;
  }
}

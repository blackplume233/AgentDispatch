import type { Task } from '@agentdispatch/shared';
import type { Logger } from '../utils/logger.js';

export interface CallbackConfig {
  retryCount: number;
  retryDelay: number;
}

export class CallbackService {
  constructor(
    private config: CallbackConfig,
    private logger: Logger,
  ) {}

  async notifyTaskClosed(task: Task): Promise<void> {
    if (!task.callbackUrl) return;

    const payload = {
      taskId: task.id,
      status: task.status,
      title: task.title,
      completedAt: task.completedAt,
      updatedAt: task.updatedAt,
      artifacts: task.artifacts
        ? { zipFile: task.artifacts.zipFile, summary: task.artifacts.resultJson?.summary }
        : undefined,
    };

    for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
      try {
        const response = await fetch(task.callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          this.logger.info('Task callback delivered', {
            category: 'task',
            event: 'task.callback.success',
            context: { taskId: task.id, url: task.callbackUrl, attempt },
          });
          return;
        }

        this.logger.warn(`Task callback returned ${response.status}`, {
          category: 'task',
          event: 'task.callback.failed',
          context: { taskId: task.id, url: task.callbackUrl, attempt, statusCode: response.status },
        });
      } catch (err) {
        this.logger.warn('Task callback request failed', {
          category: 'task',
          event: 'task.callback.error',
          context: {
            taskId: task.id,
            url: task.callbackUrl,
            attempt,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }

      if (attempt < this.config.retryCount) {
        await this.delay(this.config.retryDelay);
      }
    }

    this.logger.error('Task callback exhausted all retries', {
      taskId: task.id,
      url: task.callbackUrl,
      retryCount: this.config.retryCount,
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

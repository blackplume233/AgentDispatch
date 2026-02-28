import { AppError, ErrorCode } from '@agentdispatch/shared';

export interface Operation {
  type: string;
  execute: () => Promise<void>;
}

export class OperationQueue {
  private queue: Array<{
    operation: Operation;
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];
  private processing = false;
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  private totalPending(): number {
    return this.queue.length + (this.processing ? 1 : 0);
  }

  async enqueue(operation: Operation): Promise<void> {
    if (this.totalPending() >= this.maxSize) {
      throw new AppError(ErrorCode.QUEUE_FULL, `Operation queue is full (max: ${this.maxSize})`, 503);
    }
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      void this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    const item = this.queue.shift();
    if (!item) return;

    this.processing = true;
    try {
      await item.operation.execute();
      item.resolve();
    } catch (err) {
      item.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.processing = false;
      void this.processNext();
    }
  }

  size(): number {
    return this.queue.length;
  }

  async drain(): Promise<void> {
    if (this.queue.length === 0 && !this.processing) return;
    return new Promise<void>((resolve) => {
      const check = (): void => {
        if (this.queue.length === 0 && !this.processing) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }
}

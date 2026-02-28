import type { Task } from '@agentdispatch/shared';
import type { ServerHttpClient } from '../http/server-client.js';

export type PollCallback = (tasks: Task[]) => void;

export class TaskPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private interval: number;
  private httpClient: ServerHttpClient;
  private callback: PollCallback;
  private polling = false;

  constructor(httpClient: ServerHttpClient, interval: number, callback: PollCallback) {
    this.httpClient = httpClient;
    this.interval = interval;
    this.callback = callback;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.interval);
    void this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const tasks = await this.httpClient.listTasks({ status: 'pending' });
      this.callback(tasks);
    } catch {
      // Poll failure is non-fatal
    } finally {
      this.polling = false;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}

import type { WorkerConfig } from '@agentdispatch/shared';
import type { AcpController } from '../acp/acp-controller.js';

export interface WorkerState {
  agentId: string;
  status: 'idle' | 'busy' | 'crashed' | 'restarting';
  currentTaskId?: string;
  restartCount: number;
  maxRestarts: number;
  pid?: number;
}

export class WorkerManager {
  private static readonly RESTART_BASE_DELAY = 2000;
  private static readonly RESTART_MAX_DELAY = 30000;

  private workers: Map<string, WorkerState> = new Map();
  private configs: Map<string, WorkerConfig> = new Map();
  private controller: AcpController;
  private onTaskRelease?: (taskId: string, reason: string) => void;
  private onWorkerRestarted?: (agentId: string, attempt: number) => void;

  constructor(
    controller: AcpController,
    onTaskRelease?: (taskId: string, reason: string) => void,
    onWorkerRestarted?: (agentId: string, attempt: number) => void,
  ) {
    this.controller = controller;
    this.onTaskRelease = onTaskRelease;
    this.onWorkerRestarted = onWorkerRestarted;
  }

  registerWorker(config: WorkerConfig, maxRestarts = 3): void {
    this.configs.set(config.id, config);
    this.workers.set(config.id, {
      agentId: config.id,
      status: 'idle',
      restartCount: 0,
      maxRestarts,
    });
  }

  unregisterWorker(agentId: string): void {
    this.controller.stopAgent(agentId);
    this.workers.delete(agentId);
    this.configs.delete(agentId);
  }

  assignTask(agentId: string, taskId: string): void {
    const worker = this.workers.get(agentId);
    if (worker) {
      worker.status = 'busy';
      worker.currentTaskId = taskId;
    }
  }

  handleWorkerExit(agentId: string, exitCode: number | null): void {
    const worker = this.workers.get(agentId);
    if (!worker) return;

    const taskId = worker.currentTaskId;

    if (exitCode === 0) {
      if (!taskId) {
        worker.status = 'idle';
      }
      worker.restartCount = 0;
      return;
    }

    worker.status = 'crashed';

    if (taskId) {
      this.onTaskRelease?.(taskId, `Worker ${agentId} crashed with exit code ${exitCode}`);
      worker.currentTaskId = undefined;
    }

    if (worker.restartCount < worker.maxRestarts) {
      worker.restartCount++;
      worker.status = 'restarting';
      const delay = Math.min(
        WorkerManager.RESTART_BASE_DELAY * Math.pow(2, worker.restartCount - 1),
        WorkerManager.RESTART_MAX_DELAY,
      );
      setTimeout(() => {
        const w = this.workers.get(agentId);
        if (w && w.status === 'restarting') {
          w.status = 'idle';
          this.onWorkerRestarted?.(agentId, w.restartCount);
        }
      }, delay);
    }
  }

  getWorkerState(agentId: string): WorkerState | undefined {
    return this.workers.get(agentId);
  }

  getIdleWorkers(): WorkerState[] {
    return Array.from(this.workers.values()).filter((w) => w.status === 'idle');
  }

  getAllWorkers(): WorkerState[] {
    return Array.from(this.workers.values());
  }
}

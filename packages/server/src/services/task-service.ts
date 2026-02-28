import { v4 as uuidv4 } from 'uuid';
import type {
  Task,
  TaskStatus,
  CreateTaskDTO,
  UpdateTaskDTO,
  ClaimTaskDTO,
  ReleaseTaskDTO,
  ProgressDTO,
  CancelTaskDTO,
} from '@agentdispatch/shared';
import {
  ErrorCode,
  NotFoundError,
  ConflictError,
  ValidationError,
  isValidTransition,
} from '@agentdispatch/shared';
import type { OperationQueue } from '../queue/operation-queue.js';
import type { TaskStore } from '../store/task-store.js';
import type { Logger } from '../utils/logger.js';

export class TaskService {
  constructor(
    private store: TaskStore,
    private queue: OperationQueue,
    private logger: Logger,
  ) {}

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: uuidv4(),
      title: dto.title,
      description: dto.description,
      status: 'pending',
      tags: dto.tags,
      priority: dto.priority ?? 'normal',
      metadata: dto.metadata,
      callbackUrl: dto.callbackUrl,
      createdAt: now,
      updatedAt: now,
    };

    await this.queue.enqueue({
      type: 'task.create',
      execute: async () => {
        await this.store.save(task);
      },
    });

    this.logger.info('Task created', { category: 'task', event: 'task.created', context: { taskId: task.id } });
    return task;
  }

  async getTask(taskId: string): Promise<Task> {
    const task = await this.store.get(taskId);
    if (!task) {
      throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, `Task ${taskId} not found`);
    }
    return task;
  }

  async listTasks(filters?: { status?: TaskStatus; tag?: string; page?: number; limit?: number }): Promise<Task[]> {
    let tasks = await this.store.list();

    if (filters?.status) {
      tasks = tasks.filter((t) => t.status === filters.status);
    }
    if (filters?.tag) {
      const tag = filters.tag;
      tasks = tasks.filter((t) => t.tags.includes(tag));
    }

    tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (filters?.page !== undefined && filters?.limit !== undefined) {
      const start = (filters.page - 1) * filters.limit;
      tasks = tasks.slice(start, start + filters.limit);
    }

    return tasks;
  }

  async updateTask(taskId: string, dto: UpdateTaskDTO): Promise<Task> {
    const task = await this.getTask(taskId);
    const updated: Task = {
      ...task,
      ...dto,
      updatedAt: new Date().toISOString(),
    };

    await this.queue.enqueue({
      type: 'task.update',
      execute: async () => {
        await this.store.save(updated);
      },
    });

    return updated;
  }

  async claimTask(taskId: string, dto: ClaimTaskDTO): Promise<Task> {
    const task = await this.getTask(taskId);

    if (task.status !== 'pending') {
      if (task.status === 'claimed' || task.status === 'in_progress') {
        throw new ConflictError(ErrorCode.TASK_ALREADY_CLAIMED, `Task ${taskId} is already claimed`);
      }
      throw new ValidationError(
        ErrorCode.TASK_INVALID_TRANSITION,
        `Cannot claim task in ${task.status} status`,
      );
    }

    const updated: Task = {
      ...task,
      status: 'claimed',
      claimedBy: { clientId: dto.clientId, agentId: dto.agentId },
      claimedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.queue.enqueue({
      type: 'task.claim',
      execute: async () => {
        await this.store.save(updated);
      },
    });

    this.logger.info('Task claimed', {
      category: 'task',
      event: 'task.claimed',
      context: { taskId, clientId: dto.clientId, agentId: dto.agentId },
    });
    return updated;
  }

  async releaseTask(taskId: string, dto: ReleaseTaskDTO): Promise<Task> {
    const task = await this.getTask(taskId);

    if (!isValidTransition(task.status, 'pending')) {
      throw new ValidationError(
        ErrorCode.TASK_INVALID_TRANSITION,
        `Cannot release task in ${task.status} status`,
      );
    }

    const updated: Task = {
      ...task,
      status: 'pending',
      claimedBy: undefined,
      claimedAt: undefined,
      progress: undefined,
      progressMessage: undefined,
      updatedAt: new Date().toISOString(),
    };

    await this.queue.enqueue({
      type: 'task.release',
      execute: async () => {
        await this.store.save(updated);
      },
    });

    this.logger.info('Task released', {
      category: 'task',
      event: 'task.released',
      context: { taskId, clientId: dto.clientId, reason: dto.reason },
    });
    return updated;
  }

  async reportProgress(taskId: string, dto: ProgressDTO): Promise<Task> {
    const task = await this.getTask(taskId);

    let updated: Task;
    if (task.status === 'claimed') {
      updated = {
        ...task,
        status: 'in_progress',
        progress: dto.progress,
        progressMessage: dto.message,
        updatedAt: new Date().toISOString(),
      };
    } else if (task.status === 'in_progress') {
      updated = {
        ...task,
        progress: dto.progress,
        progressMessage: dto.message,
        updatedAt: new Date().toISOString(),
      };
    } else {
      throw new ValidationError(
        ErrorCode.TASK_INVALID_TRANSITION,
        `Cannot report progress for task in ${task.status} status`,
      );
    }

    await this.queue.enqueue({
      type: 'task.progress',
      execute: async () => {
        await this.store.save(updated);
      },
    });

    return updated;
  }

  async cancelTask(taskId: string, _dto: CancelTaskDTO): Promise<Task> {
    const task = await this.getTask(taskId);

    if (!isValidTransition(task.status, 'cancelled')) {
      throw new ValidationError(
        ErrorCode.TASK_INVALID_TRANSITION,
        `Cannot cancel task in ${task.status} status`,
      );
    }

    const updated: Task = {
      ...task,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    };

    await this.queue.enqueue({
      type: 'task.cancel',
      execute: async () => {
        await this.store.save(updated);
      },
    });

    this.logger.info('Task cancelled', {
      category: 'task',
      event: 'task.cancelled',
      context: { taskId },
    });
    return updated;
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = await this.store.get(taskId);
    if (!task) {
      throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, `Task ${taskId} not found`);
    }

    await this.queue.enqueue({
      type: 'task.delete',
      execute: async () => {
        await this.store.delete(taskId);
      },
    });

    this.logger.info('Task deleted', {
      category: 'task',
      event: 'task.deleted',
      context: { taskId },
    });
  }

  async completeTask(taskId: string, artifacts: Task['artifacts']): Promise<Task> {
    const task = await this.getTask(taskId);

    if (!isValidTransition(task.status, 'completed')) {
      throw new ValidationError(
        ErrorCode.TASK_INVALID_TRANSITION,
        `Cannot complete task in ${task.status} status`,
      );
    }

    const updated: Task = {
      ...task,
      status: 'completed',
      progress: 100,
      artifacts,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.queue.enqueue({
      type: 'task.complete',
      execute: async () => {
        await this.store.save(updated);
      },
    });

    this.logger.info('Task completed', {
      category: 'task',
      event: 'task.completed',
      context: { taskId },
    });
    return updated;
  }

  async failTask(taskId: string, reason: string): Promise<Task> {
    const task = await this.getTask(taskId);

    if (!isValidTransition(task.status, 'failed')) {
      throw new ValidationError(
        ErrorCode.TASK_INVALID_TRANSITION,
        `Cannot fail task in ${task.status} status`,
      );
    }

    const updated: Task = {
      ...task,
      status: 'failed',
      progressMessage: reason,
      updatedAt: new Date().toISOString(),
    };

    await this.queue.enqueue({
      type: 'task.fail',
      execute: async () => {
        await this.store.save(updated);
      },
    });

    this.logger.info('Task failed', {
      category: 'task',
      event: 'task.failed',
      context: { taskId, reason },
    });
    return updated;
  }
}

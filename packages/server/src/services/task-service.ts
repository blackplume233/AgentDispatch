import { v4 as uuidv4 } from 'uuid';
import type {
  Task,
  TaskStatus,
  TaskSummary,
  TaskAttachment,
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
import type { ArchiveIndex, ArchiveListFilters } from '../store/archive-index.js';
import type { ArchiveCache } from '../store/archive-cache.js';
import type { CallbackService } from './callback-service.js';
import type { Logger } from '../utils/logger.js';

export class TaskService {
  private archiveIndex: ArchiveIndex | null = null;
  private archiveCache: ArchiveCache | null = null;
  private callbackService: CallbackService | null = null;

  constructor(
    private store: TaskStore,
    private queue: OperationQueue,
    private logger: Logger,
  ) {}

  setCallbackService(service: CallbackService): void {
    this.callbackService = service;
  }

  setArchive(index: ArchiveIndex, cache: ArchiveCache): void {
    this.archiveIndex = index;
    this.archiveCache = cache;
  }

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    if (!dto.title || typeof dto.title !== 'string') {
      throw new ValidationError(ErrorCode.VALIDATION_ERROR, 'title is required and must be a string');
    }
    if (!Array.isArray(dto.tags)) {
      throw new ValidationError(ErrorCode.VALIDATION_ERROR, 'tags is required and must be an array');
    }

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
    if (task) return task;

    if (this.archiveCache && this.archiveIndex?.has(taskId)) {
      const cached = this.archiveCache.get(taskId);
      if (cached) return cached;

      const archived = await this.store.getArchived(taskId);
      if (archived) {
        this.archiveCache.set(taskId, archived);
        return archived;
      }
    }

    throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, `Task ${taskId} not found`);
  }

  async listTasks(filters?: { status?: TaskStatus; tag?: string; page?: number; limit?: number }): Promise<Task[]> {
    let tasks = await this.store.list();

    if (filters?.status) {
      tasks = tasks.filter((t) => t.status === filters.status);
    }
    if (filters?.tag) {
      const tag = filters.tag;
      tasks = tasks.filter((t) => Array.isArray(t.tags) && t.tags.includes(tag));
    }

    tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (filters?.page !== undefined && filters?.limit !== undefined) {
      const start = (filters.page - 1) * filters.limit;
      tasks = tasks.slice(start, start + filters.limit);
    }

    return tasks;
  }

  async updateTask(taskId: string, dto: UpdateTaskDTO): Promise<Task> {
    const FORBIDDEN_FIELDS = ['id', 'status', 'createdAt', 'updatedAt', 'claimedBy', 'claimedAt', 'completedAt', 'artifacts', 'attachments'];
    const dtoKeys = Object.keys(dto as Record<string, unknown>);
    const sentForbidden = FORBIDDEN_FIELDS.filter((k) => dtoKeys.includes(k));
    if (sentForbidden.length > 0) {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        `Cannot update protected fields: ${sentForbidden.join(', ')}`,
      );
    }

    const task = await this.getTask(taskId);
    const allowed: (keyof UpdateTaskDTO)[] = ['title', 'description', 'tags', 'priority', 'metadata'];

    if ('tags' in dto && dto.tags !== undefined && !Array.isArray(dto.tags)) {
      throw new ValidationError(ErrorCode.VALIDATION_ERROR, 'tags must be an array');
    }

    const patch: Partial<Task> = {};
    for (const key of allowed) {
      if (key in dto && dto[key] !== undefined) {
        (patch as Record<string, unknown>)[key] = dto[key];
      }
    }

    const updated: Task = {
      ...task,
      ...patch,
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

  async setAttachments(taskId: string, attachments: TaskAttachment[]): Promise<Task> {
    const task = await this.getTask(taskId);
    const updated: Task = {
      ...task,
      attachments,
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

    if (task.claimedBy?.clientId) {
      if (!dto.clientId || task.claimedBy.clientId !== dto.clientId) {
        throw new ConflictError(
          ErrorCode.TASK_ALREADY_CLAIMED,
          `Only the task owner (${task.claimedBy.clientId}) can release this task`,
        );
      }
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

    if (task.claimedBy?.clientId) {
      if (!dto.clientId || task.claimedBy.clientId !== dto.clientId) {
        throw new ConflictError(
          ErrorCode.TASK_ALREADY_CLAIMED,
          `Only the task owner (${task.claimedBy.clientId}) can report progress`,
        );
      }
    }

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

  async cancelTask(taskId: string, dto: CancelTaskDTO): Promise<Task> {
    const task = await this.getTask(taskId);

    if (!isValidTransition(task.status, 'cancelled')) {
      throw new ValidationError(
        ErrorCode.TASK_INVALID_TRANSITION,
        `Cannot cancel task in ${task.status} status`,
      );
    }

    if (task.claimedBy?.clientId) {
      if (!dto.clientId || task.claimedBy.clientId !== dto.clientId) {
        throw new ConflictError(
          ErrorCode.TASK_ALREADY_CLAIMED,
          `Only the task owner (${task.claimedBy.clientId}) can cancel this task`,
        );
      }
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

    this.fireCallback(updated);
    return updated;
  }

  async listArchivedTasks(filters?: ArchiveListFilters): Promise<TaskSummary[]> {
    if (!this.archiveIndex) return [];
    return this.archiveIndex.listSummaries(filters);
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = await this.store.get(taskId);
    const inArchiveIndex = this.archiveIndex?.has(taskId) ?? false;

    if (!task && !inArchiveIndex) {
      throw new NotFoundError(ErrorCode.TASK_NOT_FOUND, `Task ${taskId} not found`);
    }

    await this.queue.enqueue({
      type: 'task.delete',
      execute: async () => {
        await this.store.delete(taskId);
        if (inArchiveIndex) {
          await this.archiveIndex?.removeSummary(taskId);
          this.archiveCache?.remove(taskId);
        }
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

    this.fireCallback(updated);
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

    this.fireCallback(updated);
    return updated;
  }

  private fireCallback(task: Task): void {
    if (!task.callbackUrl || !this.callbackService) return;
    this.callbackService.notifyTaskClosed(task).catch((err) => {
      this.logger.error('Callback dispatch error', {
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

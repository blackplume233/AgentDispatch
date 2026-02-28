import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { ErrorCode } from '@agentdispatch/shared';
import { TaskService } from '../../src/services/task-service.js';
import { TaskStore } from '../../src/store/task-store.js';
import { OperationQueue } from '../../src/queue/operation-queue.js';
import { Logger } from '../../src/utils/logger.js';

describe('TaskService', () => {
  let tmpDir: string;
  let service: TaskService;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `task-svc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const store = new TaskStore(tmpDir);
    await store.init();
    const queue = new OperationQueue();
    const logger = new Logger(path.join(tmpDir, 'logs'));
    await logger.init();
    service = new TaskService(store, queue, logger);
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create a task with pending status', async () => {
    const task = await service.createTask({
      title: 'Test task',
      tags: ['test'],
    });

    expect(task.id).toBeDefined();
    expect(task.status).toBe('pending');
    expect(task.title).toBe('Test task');
    expect(task.priority).toBe('normal');
  });

  it('should get a task by id', async () => {
    const created = await service.createTask({ title: 'Get test', tags: [] });
    const fetched = await service.getTask(created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('should throw TASK_NOT_FOUND for missing task', async () => {
    await expect(service.getTask('nonexistent')).rejects.toThrow();
    try {
      await service.getTask('nonexistent');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe(ErrorCode.TASK_NOT_FOUND);
    }
  });

  it('should list tasks with filters', async () => {
    await service.createTask({ title: 'A', tags: ['frontend'] });
    await service.createTask({ title: 'B', tags: ['backend'] });

    const all = await service.listTasks();
    expect(all.length).toBe(2);

    const frontend = await service.listTasks({ tag: 'frontend' });
    expect(frontend.length).toBe(1);
    expect(frontend[0]!.title).toBe('A');
  });

  it('should claim a pending task', async () => {
    const task = await service.createTask({ title: 'Claim', tags: [] });
    const claimed = await service.claimTask(task.id, {
      clientId: 'c1',
      agentId: 'a1',
    });

    expect(claimed.status).toBe('claimed');
    expect(claimed.claimedBy).toEqual({ clientId: 'c1', agentId: 'a1' });
  });

  it('should reject claiming an already claimed task', async () => {
    const task = await service.createTask({ title: 'Double claim', tags: [] });
    await service.claimTask(task.id, { clientId: 'c1', agentId: 'a1' });

    await expect(
      service.claimTask(task.id, { clientId: 'c2', agentId: 'a2' }),
    ).rejects.toThrow();
  });

  it('should release a claimed task back to pending', async () => {
    const task = await service.createTask({ title: 'Release', tags: [] });
    await service.claimTask(task.id, { clientId: 'c1', agentId: 'a1' });
    const released = await service.releaseTask(task.id, { clientId: 'c1', reason: 'test' });

    expect(released.status).toBe('pending');
    expect(released.claimedBy).toBeUndefined();
  });

  it('should report progress and transition to in_progress', async () => {
    const task = await service.createTask({ title: 'Progress', tags: [] });
    await service.claimTask(task.id, { clientId: 'c1', agentId: 'a1' });
    const updated = await service.reportProgress(task.id, {
      clientId: 'c1',
      agentId: 'a1',
      progress: 50,
      message: 'halfway',
    });

    expect(updated.status).toBe('in_progress');
    expect(updated.progress).toBe(50);
  });

  it('should cancel a pending task', async () => {
    const task = await service.createTask({ title: 'Cancel', tags: [] });
    const cancelled = await service.cancelTask(task.id, {});

    expect(cancelled.status).toBe('cancelled');
  });

  it('should reject invalid state transitions', async () => {
    const task = await service.createTask({ title: 'Invalid', tags: [] });
    const cancelled = await service.cancelTask(task.id, {});

    await expect(
      service.claimTask(cancelled.id, { clientId: 'c1', agentId: 'a1' }),
    ).rejects.toThrow();
  });

  it('should complete a task', async () => {
    const task = await service.createTask({ title: 'Complete', tags: [] });
    await service.claimTask(task.id, { clientId: 'c1', agentId: 'a1' });
    await service.reportProgress(task.id, {
      clientId: 'c1',
      agentId: 'a1',
      progress: 100,
    });

    const completed = await service.completeTask(task.id, {
      zipFile: 'artifacts/test/artifact.zip',
      zipSizeBytes: 1024,
      zipHash: 'abc123',
      resultJson: {
        taskId: task.id,
        success: true,
        summary: 'Done',
        outputs: [{ name: 'code', type: 'file', path: 'src/' }],
      },
      uploadedAt: new Date().toISOString(),
    });

    expect(completed.status).toBe('completed');
    expect(completed.artifacts).toBeDefined();
  });

  it('should fail a task', async () => {
    const task = await service.createTask({ title: 'Fail', tags: [] });
    await service.claimTask(task.id, { clientId: 'c1', agentId: 'a1' });
    await service.reportProgress(task.id, {
      clientId: 'c1',
      agentId: 'a1',
      progress: 10,
    });

    const failed = await service.failTask(task.id, 'something went wrong');
    expect(failed.status).toBe('failed');
  });

  it('should allow re-claiming a failed task', async () => {
    const task = await service.createTask({ title: 'Reclaim', tags: [] });
    await service.claimTask(task.id, { clientId: 'c1', agentId: 'a1' });
    await service.reportProgress(task.id, {
      clientId: 'c1',
      agentId: 'a1',
      progress: 10,
    });
    const failed = await service.failTask(task.id, 'error');

    const released = await service.releaseTask(failed.id, { clientId: 'c1' });
    expect(released.status).toBe('pending');

    const reclaimed = await service.claimTask(released.id, {
      clientId: 'c2',
      agentId: 'a2',
    });
    expect(reclaimed.status).toBe('claimed');
  });

  it('should delete a task', async () => {
    const task = await service.createTask({ title: 'Delete', tags: [] });
    await service.deleteTask(task.id);

    await expect(service.getTask(task.id)).rejects.toThrow();
  });
});

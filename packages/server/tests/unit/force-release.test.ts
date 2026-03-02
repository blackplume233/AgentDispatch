import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { ErrorCode } from '@agentdispatch/shared';
import { TaskService } from '../../src/services/task-service.js';
import { TaskStore } from '../../src/store/task-store.js';
import { OperationQueue } from '../../src/queue/operation-queue.js';
import { Logger } from '../../src/utils/logger.js';

describe('TaskService forceReleaseTask', () => {
  let tmpDir: string;
  let service: TaskService;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `force-release-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  it('should force-release a claimed task without clientId check', async () => {
    const task = await service.createTask({ title: 'Force release', tags: [] });
    await service.claimTask(task.id, { clientId: 'client-1', agentId: 'agent-1' });

    const released = await service.forceReleaseTask(task.id, 'admin override');

    expect(released.status).toBe('pending');
    expect(released.claimedBy).toBeUndefined();
    expect(released.claimedAt).toBeUndefined();
    expect(released.progress).toBeUndefined();
    expect(released.progressMessage).toBeUndefined();
  });

  it('should force-release an in_progress task', async () => {
    const task = await service.createTask({ title: 'In progress', tags: [] });
    await service.claimTask(task.id, { clientId: 'client-1', agentId: 'agent-1' });
    await service.reportProgress(task.id, {
      clientId: 'client-1',
      agentId: 'agent-1',
      progress: 50,
      message: 'working',
    });

    const released = await service.forceReleaseTask(task.id, 'stuck task');

    expect(released.status).toBe('pending');
    expect(released.claimedBy).toBeUndefined();
    expect(released.progress).toBeUndefined();
    expect(released.progressMessage).toBeUndefined();
  });

  it('should reject force-release on pending task', async () => {
    const task = await service.createTask({ title: 'Pending', tags: [] });

    await expect(service.forceReleaseTask(task.id, 'reason')).rejects.toMatchObject({
      code: ErrorCode.TASK_INVALID_TRANSITION,
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { ClientService } from '../../src/services/client-service.js';
import { TaskService } from '../../src/services/task-service.js';
import { ClientStore } from '../../src/store/client-store.js';
import { TaskStore } from '../../src/store/task-store.js';
import { OperationQueue } from '../../src/queue/operation-queue.js';
import { Logger } from '../../src/utils/logger.js';

describe('Heartbeat cross-validation', () => {
  let tmpDir: string;
  let clientService: ClientService;
  let taskService: TaskService;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `hb-xval-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const clientStore = new ClientStore(path.join(tmpDir, 'clients'));
    const taskStore = new TaskStore(path.join(tmpDir, 'tasks'));
    await clientStore.init();
    await taskStore.init();
    const queue = new OperationQueue();
    const logger = new Logger(path.join(tmpDir, 'logs'));
    await logger.init();

    taskService = new TaskService(taskStore, queue, logger);
    clientService = new ClientService(clientStore, queue, logger, 60000, 15000);
    clientService.setTaskService(taskService);
  });

  afterEach(async () => {
    clientService.stopHeartbeatCheck();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  async function registerClient(name: string, agents: Array<{ id: string }>) {
    return clientService.register({
      name,
      host: 'localhost',
      dispatchMode: 'tag-auto',
      agents: agents.map((a) => ({
        id: a.id,
        type: 'worker' as const,
        command: 'echo',
        workDir: '/tmp',
      })),
    });
  }

  async function createAndClaimTask(
    clientId: string,
    agentId: string,
    claimedSecondsAgo = 0,
  ) {
    const task = await taskService.createTask({ title: 'Test', tags: ['t'] });
    await taskService.claimTask(task.id, { clientId, agentId });

    if (claimedSecondsAgo > 0) {
      const claimed = await taskService.getTask(task.id);
      const backdated = new Date(Date.now() - claimedSecondsAgo * 1000).toISOString();
      Object.assign(claimed, { claimedAt: backdated, updatedAt: backdated });
      const store = (taskService as unknown as { store: { save: (t: unknown) => Promise<void> } }).store;
      await store.save(claimed);
    }

    return taskService.getTask(task.id);
  }

  it('should release task when agent reports idle but server shows in_progress', async () => {
    const client = await registerClient('node-1', [{ id: 'w1' }]);
    const task = await createAndClaimTask(client.id, 'w1', 180);

    await taskService.reportProgress(task.id, {
      clientId: client.id,
      agentId: 'w1',
      progress: 0,
      message: 'working',
    });

    await clientService.heartbeat(client.id, {
      agents: [{ id: 'w1', type: 'worker', status: 'idle', capabilities: [] }],
    });

    const checkHeartbeats = (
      clientService as unknown as Record<string, () => Promise<void>>
    )['checkHeartbeats'].bind(clientService);
    await checkHeartbeats();

    const updated = await taskService.getTask(task.id);
    expect(updated.status).toBe('pending');
    expect(updated.claimedBy).toBeUndefined();
  });

  it('should NOT release task within grace period', async () => {
    const client = await registerClient('node-2', [{ id: 'w1' }]);
    const task = await createAndClaimTask(client.id, 'w1', 0);

    await clientService.heartbeat(client.id, {
      agents: [{ id: 'w1', type: 'worker', status: 'idle', capabilities: [] }],
    });

    const checkHeartbeats = (
      clientService as unknown as Record<string, () => Promise<void>>
    )['checkHeartbeats'].bind(clientService);
    await checkHeartbeats();

    const updated = await taskService.getTask(task.id);
    expect(updated.status).toBe('claimed');
    expect(updated.claimedBy?.clientId).toBe(client.id);
  });

  it('should NOT release task when agent reports matching currentTaskId', async () => {
    const client = await registerClient('node-3', [{ id: 'w1' }]);
    const task = await createAndClaimTask(client.id, 'w1', 180);

    await clientService.heartbeat(client.id, {
      agents: [
        { id: 'w1', type: 'worker', status: 'busy', currentTaskId: task.id, capabilities: [] },
      ],
    });

    const checkHeartbeats = (
      clientService as unknown as Record<string, () => Promise<void>>
    )['checkHeartbeats'].bind(clientService);
    await checkHeartbeats();

    const updated = await taskService.getTask(task.id);
    expect(updated.status).toBe('claimed');
    expect(updated.claimedBy?.agentId).toBe('w1');
  });

  it('should release task when agent is unknown in heartbeat', async () => {
    const client = await registerClient('node-4', [{ id: 'w1' }, { id: 'w2' }]);
    const task = await createAndClaimTask(client.id, 'w1', 180);

    await clientService.heartbeat(client.id, {
      agents: [
        { id: 'w2', type: 'worker', status: 'idle', capabilities: [] },
      ],
    });

    const checkHeartbeats = (
      clientService as unknown as Record<string, () => Promise<void>>
    )['checkHeartbeats'].bind(clientService);
    await checkHeartbeats();

    const updated = await taskService.getTask(task.id);
    expect(updated.status).toBe('pending');
  });
});

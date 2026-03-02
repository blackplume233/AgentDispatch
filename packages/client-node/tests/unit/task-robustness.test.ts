import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClientNode } from '../../src/node.js';
import type { ClientConfig, Task } from '@agentdispatch/shared';

function makeConfig(agents: ClientConfig['agents'] = []): ClientConfig {
  return {
    name: 'test-node',
    serverUrl: 'http://localhost:9800',
    tags: [],
    dispatchMode: 'tag-auto',
    polling: { interval: 60000 },
    ipc: { path: '\\\\.\\pipe\\dispatch-test-robustness' },
    heartbeat: { interval: 60000 },
    autoDispatch: { rules: [] },
    logging: {
      dir: '',
      rotateDaily: true,
      retainDays: 30,
      httpLog: true,
      auditLog: true,
      agentLog: true,
    },
    agents,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001',
    title: 'Test task',
    status: 'pending',
    tags: ['test'],
    priority: 'normal',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

type AnyFn = (...args: unknown[]) => unknown;
type AsyncFn = (...args: unknown[]) => Promise<unknown>;

function getPrivate<T>(obj: unknown, key: string): T {
  return (obj as Record<string, unknown>)[key] as T;
}

function callPrivate(obj: unknown, method: string, ...args: unknown[]): unknown {
  return (getPrivate<AnyFn>(obj, method)).call(obj, ...args);
}

describe('Task Robustness (Fix 1/2/3/5)', () => {
  let node: ClientNode;

  beforeEach(() => {
    node = new ClientNode(
      makeConfig([{ id: 'w1', type: 'worker', command: 'echo', workDir: '/tmp/w1' }]),
    );
  });

  afterEach(async () => {
    getPrivate<Set<Promise<void>>>(node, 'pendingCompletions').clear();
    await node.stop();
  });

  describe('Fix 1: handleTaskCompletion retry + fallback cancel + conditional idle', () => {
    it('should mark worker idle when release succeeds', async () => {
      const httpClient = node.getHttpClient();
      vi.spyOn(httpClient, 'releaseTask').mockResolvedValue(makeTask({ status: 'pending' }));

      const wm = node.getWorkerManager();
      const worker = wm.getWorkerState('w1');
      worker!.status = 'busy';
      worker!.currentTaskId = 'task-001';

      (node as unknown as Record<string, unknown>)['client'] = { id: 'client-1' };

      await (callPrivate(node, 'handleTaskCompletion', 'w1', 'task-001', 'cancelled') as Promise<void>);

      expect(worker!.status).toBe('idle');
      expect(worker!.currentTaskId).toBeUndefined();
    });

    it('should retry release and keep worker busy if all attempts fail', async () => {
      const httpClient = node.getHttpClient();
      vi.spyOn(httpClient, 'releaseTask').mockRejectedValue(new Error('HTTP 500'));

      const wm = node.getWorkerManager();
      const worker = wm.getWorkerState('w1');
      worker!.status = 'busy';
      worker!.currentTaskId = 'task-001';

      (node as unknown as Record<string, unknown>)['client'] = { id: 'client-1' };

      await (callPrivate(node, 'handleTaskCompletion', 'w1', 'task-001', 'cancelled') as Promise<void>);

      expect(httpClient.releaseTask).toHaveBeenCalledTimes(2);
      expect(worker!.status).toBe('busy');
      expect(worker!.currentTaskId).toBe('task-001');
    });

    it('should fallback to cancelTask when completeTask fails', async () => {
      const httpClient = node.getHttpClient();
      vi.spyOn(httpClient, 'reportProgress').mockRejectedValue(new Error('HTTP 400'));
      vi.spyOn(httpClient, 'cancelTask').mockResolvedValue(makeTask({ status: 'cancelled' }));

      const wm = node.getWorkerManager();
      const worker = wm.getWorkerState('w1');
      worker!.status = 'busy';
      worker!.currentTaskId = 'task-001';

      (node as unknown as Record<string, unknown>)['client'] = { id: 'client-1' };

      await (callPrivate(node, 'handleTaskCompletion', 'w1', 'task-001', 'end_turn') as Promise<void>);

      expect(httpClient.cancelTask).toHaveBeenCalledTimes(1);
      expect(worker!.status).toBe('idle');
    });
  });

  describe('Fix 2: Claim circuit breaker', () => {
    it('should skip tasks that exceeded max claim count', async () => {
      const claimCounts = getPrivate<Map<string, { count: number; firstClaimed: number }>>(
        node,
        'taskClaimCounts',
      );
      claimCounts.set('task-poison', { count: 3, firstClaimed: Date.now() });

      (node as unknown as Record<string, unknown>)['client'] = { id: 'client-1' };
      (node as unknown as Record<string, unknown>)['pendingTasks'] = [
        makeTask({ id: 'task-poison', tags: ['test'] }),
      ];

      const httpClient = node.getHttpClient();
      const claimSpy = vi.spyOn(httpClient, 'claimTask');

      await (callPrivate(node, 'dispatchPendingTasks') as Promise<void>);

      expect(claimSpy).not.toHaveBeenCalled();
    });

    it('should increment claim count on successful claim', async () => {
      (node as unknown as Record<string, unknown>)['client'] = { id: 'client-1' };
      (node as unknown as Record<string, unknown>)['pendingTasks'] = [
        makeTask({ id: 'task-new', tags: ['test'] }),
      ];

      const httpClient = node.getHttpClient();
      vi.spyOn(httpClient, 'claimTask').mockResolvedValue(makeTask({ id: 'task-new', status: 'claimed' }));

      const acpController = node.getAcpController();
      vi.spyOn(acpController, 'launchAgent').mockResolvedValue();

      const dispatcher = node.getDispatcher();
      vi.spyOn(dispatcher, 'decide').mockReturnValue({
        action: 'dispatch',
        taskId: 'task-new',
        agentId: 'w1',
        rule: { taskTags: ['test'], priority: 1 },
      });

      await (callPrivate(node, 'dispatchPendingTasks') as Promise<void>);

      const claimCounts = getPrivate<Map<string, { count: number; firstClaimed: number }>>(
        node,
        'taskClaimCounts',
      );
      expect(claimCounts.get('task-new')?.count).toBe(1);
    });
  });

  describe('Fix 3: Orphan reconciliation', () => {
    it('should release orphaned tasks on reconciliation', async () => {
      (node as unknown as Record<string, unknown>)['client'] = { id: 'client-1' };

      const httpClient = node.getHttpClient();
      vi.spyOn(httpClient, 'listTasks').mockResolvedValue([
        makeTask({
          id: 'orphan-1',
          status: 'in_progress',
          claimedBy: { clientId: 'client-1', agentId: 'w-old' },
        }),
        makeTask({
          id: 'active-1',
          status: 'in_progress',
          claimedBy: { clientId: 'other-client', agentId: 'w2' },
        }),
      ]);
      const releaseSpy = vi
        .spyOn(httpClient, 'releaseTask')
        .mockResolvedValue(makeTask({ status: 'pending' }));

      await (callPrivate(node, 'reconcileOrphanedTasks') as Promise<void>);

      expect(releaseSpy).toHaveBeenCalledTimes(1);
      expect(releaseSpy).toHaveBeenCalledWith('orphan-1', {
        clientId: 'client-1',
        reason: 'Orphan cleanup after client reconnect',
      });
    });

    it('should not release tasks that workers are actively processing', async () => {
      (node as unknown as Record<string, unknown>)['client'] = { id: 'client-1' };

      const wm = node.getWorkerManager();
      const worker = wm.getWorkerState('w1');
      worker!.status = 'busy';
      worker!.currentTaskId = 'active-task';

      const httpClient = node.getHttpClient();
      vi.spyOn(httpClient, 'listTasks').mockResolvedValue([
        makeTask({
          id: 'active-task',
          status: 'in_progress',
          claimedBy: { clientId: 'client-1', agentId: 'w1' },
        }),
      ]);
      const releaseSpy = vi.spyOn(httpClient, 'releaseTask');

      await (callPrivate(node, 'reconcileOrphanedTasks') as Promise<void>);

      expect(releaseSpy).not.toHaveBeenCalled();
    });
  });

  describe('Fix 5: Graceful stop with pending completions', () => {
    it('should wait for pending completions on stop', async () => {
      let resolveCompletion: () => void;
      const slowCompletion = new Promise<void>((r) => {
        resolveCompletion = r;
      });

      const pendingCompletions = getPrivate<Set<Promise<void>>>(node, 'pendingCompletions');
      pendingCompletions.add(slowCompletion);

      let stopDone = false;
      const stopPromise = node.stop().then(() => {
        stopDone = true;
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(stopDone).toBe(false);

      resolveCompletion!();
      await stopPromise;
      expect(stopDone).toBe(true);
    });

    it('should respect graceful stop timeout', async () => {
      const pendingCompletions = getPrivate<Set<Promise<void>>>(node, 'pendingCompletions');
      const neverResolves = new Promise<void>(() => {});
      pendingCompletions.add(neverResolves);

      const origTimeout = (ClientNode as unknown as Record<string, number>)['GRACEFUL_STOP_TIMEOUT'];
      (ClientNode as unknown as Record<string, number>)['GRACEFUL_STOP_TIMEOUT'] = 100;

      const start = Date.now();
      await node.stop();
      const elapsed = Date.now() - start;

      (ClientNode as unknown as Record<string, number>)['GRACEFUL_STOP_TIMEOUT'] = origTimeout;
      pendingCompletions.clear();

      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(elapsed).toBeLessThan(5000);
    }, 15000);
  });
});

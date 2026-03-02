import { describe, it, expect, vi } from 'vitest';
import { WorkerManager } from '../../src/agents/worker-manager.js';
import { AcpController } from '../../src/acp/acp-controller.js';
import type { AgentConfig, ClientConfig } from '@agentdispatch/shared';

describe('WorkerManager', () => {
  const mockConfig: ClientConfig = {
    name: 'test',
    serverUrl: '',
    tags: [],
    dispatchMode: 'tag-auto',
    polling: { interval: 10000 },
    ipc: { path: '' },
    heartbeat: { interval: 30000 },
    autoDispatch: { rules: [] },
    logging: {
      dir: '',
      rotateDaily: true,
      retainDays: 30,
      httpLog: true,
      auditLog: true,
      agentLog: true,
    },
    agents: [],
  };

  const controller = new AcpController(mockConfig, {
    onAgentStarted: () => {},
    onAgentExited: () => {},
    onAgentError: () => {},
    onStopReason: () => {},
  });

  const workerConfig: AgentConfig = {
    id: 'w1',
    type: 'worker',
    command: 'echo',
    workDir: '/tmp',
  };

  it('should register and track workers', () => {
    const manager = new WorkerManager(controller);
    manager.registerWorker(workerConfig);

    const state = manager.getWorkerState('w1');
    expect(state).toBeDefined();
    expect(state!.status).toBe('idle');
  });

  it('should assign task to worker', () => {
    const manager = new WorkerManager(controller);
    manager.registerWorker(workerConfig);
    manager.assignTask('w1', 'task-1');

    const state = manager.getWorkerState('w1');
    expect(state!.status).toBe('busy');
    expect(state!.currentTaskId).toBe('task-1');
  });

  it('should keep busy on normal exit when task is active (ACP handler releases)', () => {
    const manager = new WorkerManager(controller);
    manager.registerWorker(workerConfig);
    manager.assignTask('w1', 'task-1');
    manager.handleWorkerExit('w1', 0);

    const state = manager.getWorkerState('w1');
    expect(state!.status).toBe('busy');
    expect(state!.currentTaskId).toBe('task-1');
  });

  it('should mark idle on normal exit when no task is active', () => {
    const manager = new WorkerManager(controller);
    manager.registerWorker(workerConfig);
    manager.handleWorkerExit('w1', 0);

    const state = manager.getWorkerState('w1');
    expect(state!.status).toBe('idle');
  });

  it('should release task on crash', () => {
    const release = vi.fn();
    const manager = new WorkerManager(controller, release);
    manager.registerWorker(workerConfig);
    manager.assignTask('w1', 'task-1');
    manager.handleWorkerExit('w1', 1);

    expect(release).toHaveBeenCalledWith('task-1', expect.stringContaining('crashed'));
  });

  it('should list idle workers', () => {
    const manager = new WorkerManager(controller);
    manager.registerWorker(workerConfig);
    manager.registerWorker({ ...workerConfig, id: 'w2' });
    manager.assignTask('w1', 'task-1');

    const idle = manager.getIdleWorkers();
    expect(idle).toHaveLength(1);
    expect(idle[0]!.agentId).toBe('w2');
  });

  it('should unregister idle worker', () => {
    const manager = new WorkerManager(controller);
    manager.registerWorker(workerConfig);
    manager.unregisterWorker('w1');

    expect(manager.getWorkerState('w1')).toBeUndefined();
    expect(manager.getAllWorkers()).toHaveLength(0);
  });

  it('should reject unregister of busy worker without force', () => {
    const manager = new WorkerManager(controller);
    manager.registerWorker(workerConfig);
    manager.assignTask('w1', 'task-1');

    expect(() => manager.unregisterWorker('w1')).toThrow(/busy/);
    expect(manager.getWorkerState('w1')).toBeDefined();
  });

  it('should force unregister busy worker', () => {
    const manager = new WorkerManager(controller);
    manager.registerWorker(workerConfig);
    manager.assignTask('w1', 'task-1');

    manager.unregisterWorker('w1', true);
    expect(manager.getWorkerState('w1')).toBeUndefined();
  });

  it('should expose worker config via getWorkerConfig', () => {
    const manager = new WorkerManager(controller);
    manager.registerWorker(workerConfig);

    const cfg = manager.getWorkerConfig('w1');
    expect(cfg).toBeDefined();
    expect(cfg!.command).toBe('echo');
    expect(manager.getWorkerConfig('nonexistent')).toBeUndefined();
  });
});

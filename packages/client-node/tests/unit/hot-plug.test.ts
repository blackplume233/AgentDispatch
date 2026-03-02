import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientNode } from '../../src/node.js';
import type { ClientConfig } from '@agentdispatch/shared';

function makeConfig(agents: ClientConfig['agents'] = []): ClientConfig {
  return {
    name: 'test-node',
    serverUrl: 'http://localhost:9800',
    tags: [],
    dispatchMode: 'tag-auto',
    polling: { interval: 60000 },
    ipc: { path: '\\\\.\\pipe\\dispatch-test-hotplug' },
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

describe('ClientNode hot-plug via IPC', () => {
  let node: ClientNode;

  beforeEach(() => {
    node = new ClientNode(makeConfig([
      { id: 'w1', type: 'worker', command: 'echo', workDir: '/tmp/w1' },
    ]));
  });

  it('agent.list should return registered workers', () => {
    const agents = (node as Record<string, unknown>)['buildAgentInfos'] as () => unknown[];
    const result = agents.call(node);
    expect(result).toHaveLength(1);
    expect((result[0] as { id: string }).id).toBe('w1');
  });

  it('agent.add should register a new worker at runtime', async () => {
    const addMethod = (node as Record<string, (...args: unknown[]) => Promise<unknown>>)[
      'addWorkerAtRuntime'
    ].bind(node) as (raw: Record<string, unknown>) => Promise<{
      success: boolean;
      agentId: string;
      expandedIds: string[];
    }>;

    const result = await addMethod({
      command: 'echo-new',
      workDir: '/tmp/w2',
    });

    expect(result.success).toBe(true);
    expect(result.expandedIds).toHaveLength(1);

    const wm = node.getWorkerManager();
    expect(wm.getAllWorkers()).toHaveLength(2);
    expect(wm.getWorkerState(result.expandedIds[0]!)).toBeDefined();
  });

  it('agent.add with maxConcurrency should expand to virtual workers', async () => {
    const addMethod = (node as Record<string, (...args: unknown[]) => Promise<unknown>>)[
      'addWorkerAtRuntime'
    ].bind(node) as (raw: Record<string, unknown>) => Promise<{
      success: boolean;
      agentId: string;
      expandedIds: string[];
    }>;

    const result = await addMethod({
      id: 'multi',
      command: 'echo-multi',
      workDir: '/tmp/multi',
      maxConcurrency: 3,
    });

    expect(result.expandedIds).toHaveLength(3);
    expect(result.expandedIds).toEqual(['multi:0', 'multi:1', 'multi:2']);
    expect(node.getWorkerManager().getAllWorkers()).toHaveLength(4);
  });

  it('agent.add should reject duplicate id', async () => {
    const addMethod = (node as Record<string, (...args: unknown[]) => Promise<unknown>>)[
      'addWorkerAtRuntime'
    ].bind(node) as (raw: Record<string, unknown>) => Promise<unknown>;

    await expect(
      addMethod({ id: 'w1', command: 'echo', workDir: '/tmp' }),
    ).rejects.toThrow(/already exists/);
  });

  it('agent.remove should remove an idle worker', async () => {
    const removeMethod = (node as Record<string, (...args: unknown[]) => Promise<unknown>>)[
      'removeWorkerAtRuntime'
    ].bind(node) as (
      agentId: string,
      force?: boolean,
    ) => Promise<{ removedIds: string[] }>;

    const result = await removeMethod('w1');
    expect(result.removedIds).toContain('w1');
    expect(node.getWorkerManager().getAllWorkers()).toHaveLength(0);
  });

  it('agent.remove should reject busy worker without force', async () => {
    node.getWorkerManager().assignTask('w1', 'task-1');

    const removeMethod = (node as Record<string, (...args: unknown[]) => Promise<unknown>>)[
      'removeWorkerAtRuntime'
    ].bind(node) as (agentId: string, force?: boolean) => Promise<unknown>;

    await expect(removeMethod('w1', false)).rejects.toThrow(/busy/);
    expect(node.getWorkerManager().getAllWorkers()).toHaveLength(1);
  });

  it('agent.remove with force should cancel task and remove worker', async () => {
    node.getWorkerManager().assignTask('w1', 'task-1');

    const removeMethod = (node as Record<string, (...args: unknown[]) => Promise<unknown>>)[
      'removeWorkerAtRuntime'
    ].bind(node) as (
      agentId: string,
      force?: boolean,
    ) => Promise<{ removedIds: string[] }>;

    const result = await removeMethod('w1', true);
    expect(result.removedIds).toContain('w1');
    expect(node.getWorkerManager().getAllWorkers()).toHaveLength(0);
  });

  it('agent.remove by groupId should remove all virtual workers', async () => {
    const addMethod = (node as Record<string, (...args: unknown[]) => Promise<unknown>>)[
      'addWorkerAtRuntime'
    ].bind(node) as (raw: Record<string, unknown>) => Promise<{
      expandedIds: string[];
    }>;

    await addMethod({ id: 'grp', command: 'echo', workDir: '/tmp/grp', maxConcurrency: 2 });
    expect(node.getWorkerManager().getAllWorkers()).toHaveLength(3);

    const removeMethod = (node as Record<string, (...args: unknown[]) => Promise<unknown>>)[
      'removeWorkerAtRuntime'
    ].bind(node) as (
      agentId: string,
      force?: boolean,
    ) => Promise<{ removedIds: string[] }>;

    const result = await removeMethod('grp:0');
    expect(result.removedIds).toEqual(expect.arrayContaining(['grp:0', 'grp:1']));
    expect(node.getWorkerManager().getAllWorkers()).toHaveLength(1);
  });
});

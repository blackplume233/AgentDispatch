import { describe, it, expect } from 'vitest';
import { Dispatcher } from '../../src/dispatch/dispatcher.js';
import type { Task, AgentInfo, ClientConfig } from '@agentdispatch/shared';

describe('Dispatcher', () => {
  const makeTask = (tags: string[]): Task => ({
    id: 't1',
    title: 'Test',
    status: 'pending',
    tags,
    priority: 'normal',
    createdAt: '',
    updatedAt: '',
  });

  const agents: AgentInfo[] = [
    { id: 'w1', type: 'worker', status: 'idle', capabilities: ['node'] },
  ];

  const baseConfig: ClientConfig = {
    name: 'test',
    serverUrl: 'http://localhost:9800',
    tags: [],
    dispatchMode: 'tag-auto',
    polling: { interval: 10000 },
    ipc: { path: '/tmp/test.sock' },
    heartbeat: { interval: 30000 },
    autoDispatch: {
      rules: [{ taskTags: ['backend'], targetCapabilities: ['node'] }],
      fallbackAction: 'skip',
    },
    logging: {
      dir: '/tmp',
      rotateDaily: true,
      retainDays: 30,
      httpLog: true,
      auditLog: true,
      agentLog: true,
    },
    agents: [],
  };

  it('tag-auto: should dispatch matching task', () => {
    const dispatcher = new Dispatcher(baseConfig);
    const decision = dispatcher.decide(makeTask(['backend']), agents);
    expect(decision.action).toBe('dispatch');
    if (decision.action === 'dispatch') {
      expect(decision.agentId).toBe('w1');
    }
  });

  it('tag-auto: should skip non-matching task', () => {
    const dispatcher = new Dispatcher(baseConfig);
    const decision = dispatcher.decide(makeTask(['frontend']), agents);
    expect(decision.action).toBe('skip');
  });

  it('tag-auto: should queue-local when configured', () => {
    const config = {
      ...baseConfig,
      autoDispatch: { ...baseConfig.autoDispatch, fallbackAction: 'queue-local' as const },
    };
    const dispatcher = new Dispatcher(config);
    const decision = dispatcher.decide(makeTask(['frontend']), agents);
    expect(decision.action).toBe('queue-local');
  });

  it('manager: should consult manager when available', () => {
    const config = { ...baseConfig, dispatchMode: 'manager' as const };
    const dispatcher = new Dispatcher(config);
    dispatcher.setManagerAvailable(true);
    const decision = dispatcher.decide(makeTask(['backend']), agents);
    expect(decision.action).toBe('consult-manager');
  });

  it('manager: should skip when manager unavailable', () => {
    const config = { ...baseConfig, dispatchMode: 'manager' as const };
    const dispatcher = new Dispatcher(config);
    const decision = dispatcher.decide(makeTask(['backend']), agents);
    expect(decision.action).toBe('skip');
  });

  it('hybrid: should consult manager when available', () => {
    const config = { ...baseConfig, dispatchMode: 'hybrid' as const };
    const dispatcher = new Dispatcher(config);
    dispatcher.setManagerAvailable(true);
    const decision = dispatcher.decide(makeTask(['backend']), agents);
    expect(decision.action).toBe('consult-manager');
  });

  it('hybrid: should fall back to tag-auto when manager unavailable', () => {
    const config = { ...baseConfig, dispatchMode: 'hybrid' as const };
    const dispatcher = new Dispatcher(config);
    const decision = dispatcher.decide(makeTask(['backend']), agents);
    expect(decision.action).toBe('dispatch');
  });
});

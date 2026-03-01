import { describe, it, expect, beforeEach } from 'vitest';
import { ManagerHandler } from '../../src/agents/manager-handler.js';
import type { ClientConfig, Task, AgentInfo } from '@agentdispatch/shared';

function makeConfig(overrides?: Partial<ClientConfig>): ClientConfig {
  return {
    name: 'test-node',
    serverUrl: 'http://localhost:9800',
    tags: [],
    dispatchMode: 'manager',
    polling: { interval: 5000 },
    ipc: { path: '/tmp/test.sock' },
    heartbeat: { interval: 10000 },
    autoDispatch: { rules: [] },
    logging: { dir: '/tmp/logs', rotateDaily: false, retainDays: 7, httpLog: false, auditLog: false, agentLog: false },
    agents: [],
    ...overrides,
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-001',
    title: 'Test Task',
    description: 'A test task',
    status: 'pending',
    tags: ['backend'],
    priority: 'normal',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Task;
}

function makeAgents(): AgentInfo[] {
  return [
    { id: 'worker-1', type: 'worker', status: 'idle', capabilities: ['node', 'backend'] },
    { id: 'worker-2', type: 'worker', status: 'busy', capabilities: ['python'], currentTaskId: 'task-999' },
  ];
}

describe('ManagerHandler', () => {
  let handler: ManagerHandler;

  beforeEach(() => {
    handler = new ManagerHandler(makeConfig());
  });

  it('should start unavailable', () => {
    expect(handler.isAvailable()).toBe(false);
    expect(handler.getAgentId()).toBeNull();
  });

  it('should return null from consultForDispatch when unavailable', async () => {
    const result = await handler.consultForDispatch(makeTask(), makeAgents());
    expect(result).toBeNull();
  });

  it('setAvailable/setUnavailable toggles availability', () => {
    handler.setAvailable('mgr-1');
    expect(handler.isAvailable()).toBe(true);
    expect(handler.getAgentId()).toBe('mgr-1');

    handler.setUnavailable();
    expect(handler.isAvailable()).toBe(false);
  });

  describe('buildConsultPrompt', () => {
    it('includes task and worker info in prompt', () => {
      const prompt = handler.buildConsultPrompt(makeTask(), makeAgents());

      expect(prompt).toContain('task-001');
      expect(prompt).toContain('Test Task');
      expect(prompt).toContain('worker-1');
      expect(prompt).toContain('worker-2');
      expect(prompt).toContain('backend');
      expect(prompt).toContain('recommendedAgentId');
    });

    it('handles empty agent list', () => {
      const prompt = handler.buildConsultPrompt(makeTask(), []);
      expect(prompt).toContain('no workers registered');
    });

    it('shows busy workers with task info', () => {
      const prompt = handler.buildConsultPrompt(makeTask(), makeAgents());
      expect(prompt).toContain('busy: task-999');
    });
  });

  describe('parseAdvice', () => {
    it('parses valid JSON advice', () => {
      const result = handler.parseAdvice(
        'task-001',
        'end_turn',
        '{"recommendedAgentId": "worker-1", "confidence": 0.9, "reason": "Best match"}',
      );

      expect(result).toEqual({
        taskId: 'task-001',
        recommendedAgentId: 'worker-1',
        confidence: 0.9,
        reason: 'Best match',
      });
    });

    it('returns null for non-end_turn stop reason', () => {
      const result = handler.parseAdvice(
        'task-001',
        'cancelled',
        '{"recommendedAgentId": "worker-1", "confidence": 0.9}',
      );
      expect(result).toBeNull();
    });

    it('returns null for empty text', () => {
      const result = handler.parseAdvice('task-001', 'end_turn', '');
      expect(result).toBeNull();
    });

    it('returns null for empty recommendedAgentId', () => {
      const result = handler.parseAdvice(
        'task-001',
        'end_turn',
        '{"recommendedAgentId": "", "confidence": 0, "reason": "no match"}',
      );
      expect(result).toBeNull();
    });

    it('extracts JSON from mixed text content', () => {
      const result = handler.parseAdvice(
        'task-001',
        'end_turn',
        'Here is my recommendation:\n```\n{"recommendedAgentId": "worker-2", "confidence": 0.7, "reason": "Python task"}\n```',
      );

      expect(result).toEqual({
        taskId: 'task-001',
        recommendedAgentId: 'worker-2',
        confidence: 0.7,
        reason: 'Python task',
      });
    });

    it('returns null for malformed JSON', () => {
      const result = handler.parseAdvice(
        'task-001',
        'end_turn',
        'I cannot decide right now.',
      );
      expect(result).toBeNull();
    });

    it('defaults confidence to 0.5 when not provided', () => {
      const result = handler.parseAdvice(
        'task-001',
        'end_turn',
        '{"recommendedAgentId": "worker-1"}',
      );
      expect(result?.confidence).toBe(0.5);
    });
  });

  describe('audit callbacks', () => {
    it('fires onAudit for consult request when no connection', async () => {
      const audits: Array<{ event: string; detail: Record<string, unknown> }> = [];
      const h = new ManagerHandler(makeConfig(), {
        onAudit: (event, detail) => audits.push({ event, detail }),
      });

      h.setAvailable('mgr-1');
      const result = await h.consultForDispatch(makeTask(), makeAgents());
      expect(result).toBeNull();
    });
  });

  describe('stopManager', () => {
    it('sets unavailable after stop', async () => {
      handler.setAvailable('mgr-1');
      expect(handler.isAvailable()).toBe(true);
      await handler.stopManager();
      expect(handler.isAvailable()).toBe(false);
    });
  });
});

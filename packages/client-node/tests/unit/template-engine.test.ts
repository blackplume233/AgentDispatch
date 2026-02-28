import { describe, it, expect } from 'vitest';
import {
  buildTemplateVars,
  renderTemplate,
} from '../../src/templates/template-engine.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { Task, AgentConfig, ClientConfig } from '@agentdispatch/shared';

describe('TemplateEngine', () => {
  const mockTask: Task = {
    id: 'task-123',
    title: 'Test Task',
    description: 'Do something',
    status: 'claimed',
    tags: ['backend', 'api'],
    priority: 'high',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockAgent: AgentConfig = {
    id: 'worker-1',
    type: 'worker',
    command: 'echo hello',
    workDir: '/tmp/work',
    capabilities: ['node', 'python'],
  };

  const mockConfig: ClientConfig = {
    name: 'test-node',
    serverUrl: 'http://localhost:9800',
    tags: [],
    dispatchMode: 'tag-auto',
    polling: { interval: 10000 },
    ipc: { path: '/tmp/test.sock' },
    heartbeat: { interval: 30000 },
    autoDispatch: { rules: [] },
    logging: {
      dir: '/tmp/logs',
      rotateDaily: true,
      retainDays: 30,
      httpLog: true,
      auditLog: true,
      agentLog: true,
    },
    agents: [],
  };

  it('should build template variables', () => {
    const vars = buildTemplateVars(mockTask, mockAgent, mockConfig);
    expect(vars['task.id']).toBe('task-123');
    expect(vars['task.title']).toBe('Test Task');
    expect(vars['agent.id']).toBe('worker-1');
    expect(vars['node.name']).toBe('test-node');
    expect(vars['artifacts.instructions']).toContain('artifact.zip');
    expect(vars['cli.reference']).toContain('dispatch worker');
  });

  it('should render template with variable substitution', async () => {
    const tmpFile = path.join(os.tmpdir(), `template-test-${Date.now()}.md`);
    await fs.promises.writeFile(tmpFile, 'Task: {{task.id}} - {{task.title}}');

    try {
      const result = await renderTemplate(tmpFile, {
        'task.id': 'abc',
        'task.title': 'My Task',
      });
      expect(result).toBe('Task: abc - My Task');
    } finally {
      await fs.promises.unlink(tmpFile);
    }
  });

  it('should warn about unresolved variables', async () => {
    const tmpFile = path.join(os.tmpdir(), `template-warn-${Date.now()}.md`);
    await fs.promises.writeFile(tmpFile, '{{known}} and {{unknown.var}}');

    try {
      const result = await renderTemplate(tmpFile, { known: 'resolved' });
      expect(result).toBe('resolved and {{unknown.var}}');
    } finally {
      await fs.promises.unlink(tmpFile);
    }
  });
});

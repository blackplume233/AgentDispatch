import { describe, it, expect } from 'vitest';
import { InitialTaskPass } from '../../src/workflow/passes/initial-task-pass.js';
import type { WorkflowContext } from '../../src/workflow/task-workflow.js';

function createContext(presetPrompt?: string): WorkflowContext {
  return {
    connection: {} as WorkflowContext['connection'],
    sessionId: 'session-1',
    task: {
      id: 'task-1',
      title: 'Implement feature',
      status: 'pending',
      tags: ['backend'],
      priority: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      description: 'Write implementation and tests',
    },
    agentConfig: {
      id: 'worker-1',
      type: 'worker',
      command: 'node',
      workDir: '/tmp/worker',
      ...(presetPrompt ? { presetPrompt } : {}),
    } as WorkflowContext['agentConfig'] & { presetPrompt?: string },
    outputDir: '/tmp/output',
    inputDir: undefined,
    acpClient: {} as WorkflowContext['acpClient'],
    scanOutputDir: async () => [],
    reportProgress: () => {},
    log: () => {},
  };
}

describe('InitialTaskPass', () => {
  it('prepends presetPrompt before rendered task prompt', () => {
    const pass = new InitialTaskPass();
    const blocks = pass.buildPrompt(createContext('You are a strict reviewer.'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('text');
    if (blocks[0]?.type !== 'text') {
      throw new Error('Expected text block');
    }
    expect(blocks[0].text.startsWith('You are a strict reviewer.\n\nTask:')).toBe(true);
  });

  it('does not prepend when presetPrompt is empty', () => {
    const pass = new InitialTaskPass();
    const blocks = pass.buildPrompt(createContext('   '));
    if (blocks[0]?.type !== 'text') {
      throw new Error('Expected text block');
    }
    expect(blocks[0].text.startsWith('Task:')).toBe(true);
  });
});

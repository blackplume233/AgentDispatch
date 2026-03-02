import { describe, it, expect } from 'vitest';
import { buildRuntimeAgents } from '../../src/agents/runtime-agent-config.js';
import type { AgentConfig } from '@agentdispatch/shared';

describe('runtime-agent-config', () => {
  const baseWorker: AgentConfig = {
    id: 'worker-review',
    type: 'worker',
    command: 'node',
    workDir: '/tmp/worker',
    capabilities: ['review'],
  };

  it('expands maxConcurrency workers into virtual slots', () => {
    const agents = buildRuntimeAgents([
      {
        ...baseWorker,
        maxConcurrency: 3,
      } as AgentConfig & { maxConcurrency?: number },
    ]);

    expect(agents).toHaveLength(3);
    expect(agents[0]?.id).toBe('worker-review:0');
    expect(agents[1]?.id).toBe('worker-review:1');
    expect(agents[2]?.id).toBe('worker-review:2');
    expect(agents.every((agent) => agent.type === 'worker')).toBe(true);
  });

  it('uses allowMultiProcess fallback when maxConcurrency is missing', () => {
    const agents = buildRuntimeAgents([
      {
        ...baseWorker,
        allowMultiProcess: true,
      } as AgentConfig & { allowMultiProcess?: boolean },
    ]);

    expect(agents).toHaveLength(2);
    expect(agents[0]?.id).toBe('worker-review:0');
    expect(agents[1]?.id).toBe('worker-review:1');
  });

  it('keeps manager configs unchanged', () => {
    const agents = buildRuntimeAgents([
      {
        id: 'manager-core',
        type: 'manager',
        command: 'node',
        workDir: '/tmp/manager',
      },
    ]);

    expect(agents).toHaveLength(1);
    expect(agents[0]?.id).toBe('manager-core');
    expect(agents[0]?.type).toBe('manager');
  });
});

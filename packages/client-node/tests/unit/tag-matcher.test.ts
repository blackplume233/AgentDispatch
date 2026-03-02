import { describe, it, expect } from 'vitest';
import { TagMatcher } from '../../src/dispatch/tag-matcher.js';
import type { Task, AgentInfo, DispatchRule } from '@agentdispatch/shared';

describe('TagMatcher', () => {
  const makeTask = (tags: string[]): Task => ({
    id: 't1',
    title: 'Test',
    status: 'pending',
    tags,
    priority: 'normal',
    createdAt: '',
    updatedAt: '',
  });

  const makeAgents = (): AgentInfo[] => [
    { id: 'w1', type: 'worker', status: 'idle', capabilities: ['node'] },
    { id: 'w2', type: 'worker', status: 'idle', capabilities: ['python'] },
    { id: 'w3', type: 'worker', status: 'busy', capabilities: ['node'] },
  ];

  it('should match task tags to rule (AND logic)', () => {
    const rules: DispatchRule[] = [{ taskTags: ['backend', 'api'], targetCapabilities: ['node'] }];
    const matcher = new TagMatcher(rules);

    const match = matcher.match(makeTask(['backend', 'api']), makeAgents());
    expect(match).not.toBeNull();
    expect(match!.agentId).toBe('w1');
  });

  it('should not match if task missing required tag', () => {
    const rules: DispatchRule[] = [{ taskTags: ['backend', 'api'] }];
    const matcher = new TagMatcher(rules);

    const match = matcher.match(makeTask(['backend']), makeAgents());
    expect(match).toBeNull();
  });

  it('should sort rules by priority (descending)', () => {
    const rules: DispatchRule[] = [
      { taskTags: ['backend'], targetCapabilities: ['python'], priority: 1 },
      { taskTags: ['backend'], targetCapabilities: ['node'], priority: 10 },
    ];
    const matcher = new TagMatcher(rules);

    const match = matcher.match(makeTask(['backend']), makeAgents());
    expect(match).not.toBeNull();
    expect(match!.agentId).toBe('w1');
  });

  it('should skip busy agents', () => {
    const rules: DispatchRule[] = [{ taskTags: ['test'], targetAgentId: 'w3' }];
    const matcher = new TagMatcher(rules);

    const match = matcher.match(makeTask(['test']), makeAgents());
    expect(match).toBeNull();
  });

  it('should match by specific agent id', () => {
    const rules: DispatchRule[] = [{ taskTags: ['test'], targetAgentId: 'w2' }];
    const matcher = new TagMatcher(rules);

    const match = matcher.match(makeTask(['test']), makeAgents());
    expect(match!.agentId).toBe('w2');
  });

  it('should match worker group id for expanded workers', () => {
    const rules: DispatchRule[] = [{ taskTags: ['test'], targetAgentId: 'worker-review' }];
    const matcher = new TagMatcher(rules);

    const match = matcher.match(makeTask(['test']), [
      {
        id: 'worker-review:0',
        type: 'worker',
        status: 'busy',
        capabilities: ['node'],
        groupId: 'worker-review',
      } as AgentInfo & { groupId?: string },
      {
        id: 'worker-review:1',
        type: 'worker',
        status: 'idle',
        capabilities: ['node'],
        groupId: 'worker-review',
      } as AgentInfo & { groupId?: string },
    ]);

    expect(match).not.toBeNull();
    expect(match!.agentId).toBe('worker-review:1');
  });

  it('should return null when no rules match', () => {
    const rules: DispatchRule[] = [{ taskTags: ['frontend'] }];
    const matcher = new TagMatcher(rules);

    const match = matcher.match(makeTask(['backend']), makeAgents());
    expect(match).toBeNull();
  });
});

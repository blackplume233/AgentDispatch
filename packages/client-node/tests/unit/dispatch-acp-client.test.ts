import { describe, it, expect } from 'vitest';
import { DispatchAcpClient } from '../../src/acp/dispatch-acp-client.js';
import type { AgentConfig } from '@agentdispatch/shared';

describe('DispatchAcpClient', () => {
  const workerConfig: AgentConfig = {
    id: 'w1',
    type: 'worker',
    command: 'echo',
    workDir: '/tmp',
    permissionPolicy: 'auto-allow',
  };

  it('should auto-allow permissions with auto-allow policy', () => {
    const client = new DispatchAcpClient(workerConfig);
    const result = client.handlePermissionRequest({
      sessionId: 's1',
      description: 'Write file',
      options: [
        { kind: 'allow_once', description: 'Allow' },
        { kind: 'reject_once', description: 'Deny' },
      ],
    });
    expect(result.outcome).toBe('allow');
    expect(result.optionIndex).toBe(0);
  });

  it('should auto-deny permissions with auto-deny policy', () => {
    const client = new DispatchAcpClient({
      ...workerConfig,
      permissionPolicy: 'auto-deny',
    });
    const result = client.handlePermissionRequest({
      sessionId: 's1',
      description: 'Write file',
      options: [
        { kind: 'allow_once', description: 'Allow' },
        { kind: 'reject_once', description: 'Deny' },
      ],
    });
    expect(result.outcome).toBe('deny');
    expect(result.optionIndex).toBe(1);
  });

  it('should record session updates', () => {
    const client = new DispatchAcpClient(workerConfig);
    client.handleSessionUpdate({
      sessionId: 's1',
      type: 'agent_message_chunk',
      data: { text: 'hello' },
    });
    expect(client.getSessionUpdates()).toHaveLength(1);
  });
});

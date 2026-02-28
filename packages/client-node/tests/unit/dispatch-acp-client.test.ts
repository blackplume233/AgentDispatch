import { describe, it, expect, vi } from 'vitest';
import { DispatchAcpClient } from '../../src/acp/dispatch-acp-client.js';
import type { AgentConfig, InteractionLogEntry } from '@agentdispatch/shared';

describe('DispatchAcpClient', () => {
  const workerConfig: AgentConfig = {
    id: 'w1',
    type: 'worker',
    command: 'echo',
    workDir: '/tmp',
    permissionPolicy: 'auto-allow',
  };

  function collectLogs(client: DispatchAcpClient): InteractionLogEntry[] {
    const entries: InteractionLogEntry[] = [];
    client.flushLogs();
    return entries;
  }

  it('should auto-allow permissions with auto-allow policy', async () => {
    const logBatch = vi.fn();
    const client = new DispatchAcpClient(workerConfig, logBatch);
    const result = await client.requestPermission({
      sessionId: 's1',
      toolCall: { toolCallId: 'tc1', title: 'Write file' },
      options: [
        { optionId: 'opt-allow', kind: 'allow_once', name: 'Allow' },
        { optionId: 'opt-deny', kind: 'reject_once', name: 'Deny' },
      ],
    });
    expect(result.outcome).toEqual({ outcome: 'selected', optionId: 'opt-allow' });
    client.destroy();
  });

  it('should auto-deny permissions with auto-deny policy', async () => {
    const logBatch = vi.fn();
    const client = new DispatchAcpClient({
      ...workerConfig,
      permissionPolicy: 'auto-deny',
    }, logBatch);
    const result = await client.requestPermission({
      sessionId: 's1',
      toolCall: { toolCallId: 'tc1', title: 'Write file' },
      options: [
        { optionId: 'opt-allow', kind: 'allow_once', name: 'Allow' },
        { optionId: 'opt-deny', kind: 'reject_once', name: 'Deny' },
      ],
    });
    expect(result.outcome).toEqual({ outcome: 'selected', optionId: 'opt-deny' });
    client.destroy();
  });

  it('should record session updates as log entries', async () => {
    const logBatch = vi.fn();
    const client = new DispatchAcpClient(workerConfig, logBatch);
    await client.sessionUpdate({
      sessionId: 's1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'hello' },
      } as any,
    });
    client.flushLogs();
    expect(logBatch).toHaveBeenCalledTimes(1);
    const entries = logBatch.mock.calls[0][0] as InteractionLogEntry[];
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('text');
    expect(entries[0].content).toBe('hello');
    client.destroy();
  });
});

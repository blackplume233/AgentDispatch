import { describe, it, expect } from 'vitest';
import {
  AgentProcess,
  AcpPassRunner,
  createAcpConnection,
  PROTOCOL_VERSION,
} from '../../src/index.js';

describe('@agentdispatch/acp exports', () => {
  it('should export AgentProcess class', () => {
    expect(AgentProcess).toBeDefined();
    expect(typeof AgentProcess).toBe('function');
  });

  it('should export AcpPassRunner class', () => {
    expect(AcpPassRunner).toBeDefined();
    expect(typeof AcpPassRunner).toBe('function');
  });

  it('should export createAcpConnection function', () => {
    expect(createAcpConnection).toBeDefined();
    expect(typeof createAcpConnection).toBe('function');
  });

  it('should export PROTOCOL_VERSION from SDK', () => {
    expect(PROTOCOL_VERSION).toBeDefined();
    expect(typeof PROTOCOL_VERSION).toBe('number');
  });
});

describe('AcpPassRunner', () => {
  it('should return cancelled when no passes run', async () => {
    const runner = new AcpPassRunner([]);
    const ctx = {
      connection: {} as never,
      sessionId: 'test-session',
      log: () => {},
    };
    const result = await runner.run(ctx);
    expect(result.finalStopReason).toBe('cancelled');
    expect(result.passesExecuted).toEqual([]);
  });

  it('should skip passes where shouldRun returns false', async () => {
    const pass = {
      name: 'skipped-pass',
      shouldRun: () => false,
      buildPrompt: () => [],
    };
    const runner = new AcpPassRunner([pass]);
    const ctx = {
      connection: {} as never,
      sessionId: 'test-session',
      log: () => {},
    };
    const result = await runner.run(ctx);
    expect(result.passesExecuted).toEqual([]);
    expect(result.finalStopReason).toBe('cancelled');
  });
});

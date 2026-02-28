import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { ErrorCode } from '@agentdispatch/shared';
import { ClientService } from '../../src/services/client-service.js';
import { ClientStore } from '../../src/store/client-store.js';
import { OperationQueue } from '../../src/queue/operation-queue.js';
import { Logger } from '../../src/utils/logger.js';

describe('ClientService', () => {
  let tmpDir: string;
  let service: ClientService;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `client-svc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const store = new ClientStore(tmpDir);
    await store.init();
    const queue = new OperationQueue();
    const logger = new Logger(path.join(tmpDir, 'logs'));
    await logger.init();
    service = new ClientService(store, queue, logger);
  });

  afterEach(async () => {
    service.stopHeartbeatCheck();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('should register a client', async () => {
    const client = await service.register({
      name: 'test-node',
      host: 'localhost',
      dispatchMode: 'tag-auto',
      agents: [
        {
          id: 'worker-1',
          type: 'worker',
          command: 'echo hello',
          workDir: '/tmp/work',
          capabilities: ['node'],
        },
      ],
    });

    expect(client.id).toBeDefined();
    expect(client.name).toBe('test-node');
    expect(client.status).toBe('online');
    expect(client.agents).toHaveLength(1);
    expect(client.dispatchMode).toBe('tag-auto');
  });

  it('should reject duplicate client names', async () => {
    await service.register({
      name: 'dup',
      host: 'localhost',
      dispatchMode: 'tag-auto',
      agents: [],
    });

    await expect(
      service.register({
        name: 'dup',
        host: 'localhost',
        dispatchMode: 'tag-auto',
        agents: [],
      }),
    ).rejects.toThrow();
  });

  it('should get a client by id', async () => {
    const registered = await service.register({
      name: 'get-test',
      host: 'localhost',
      dispatchMode: 'tag-auto',
      agents: [],
    });

    const client = await service.getClient(registered.id);
    expect(client.name).toBe('get-test');
  });

  it('should throw CLIENT_NOT_FOUND for missing client', async () => {
    try {
      await service.getClient('nonexistent');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe(ErrorCode.CLIENT_NOT_FOUND);
    }
  });

  it('should list all clients', async () => {
    await service.register({
      name: 'a',
      host: 'localhost',
      dispatchMode: 'tag-auto',
      agents: [],
    });
    await service.register({
      name: 'b',
      host: 'localhost',
      dispatchMode: 'manager',
      agents: [],
    });

    const clients = await service.listClients();
    expect(clients).toHaveLength(2);
  });

  it('should update heartbeat', async () => {
    const client = await service.register({
      name: 'heartbeat-test',
      host: 'localhost',
      dispatchMode: 'tag-auto',
      agents: [],
    });

    await service.heartbeat(client.id, {});
    const updated = await service.getClient(client.id);
    expect(updated.status).toBe('online');
  });

  it('should unregister a client', async () => {
    const client = await service.register({
      name: 'unreg',
      host: 'localhost',
      dispatchMode: 'tag-auto',
      agents: [],
    });

    await service.unregister(client.id);
    await expect(service.getClient(client.id)).rejects.toThrow();
  });

  it('should update agents list', async () => {
    const client = await service.register({
      name: 'agents-test',
      host: 'localhost',
      dispatchMode: 'tag-auto',
      agents: [],
    });

    const updated = await service.updateAgents(client.id, [
      { id: 'w1', type: 'worker', status: 'idle', capabilities: ['py'] },
    ]);

    expect(updated.agents).toHaveLength(1);
    expect(updated.agents[0]!.id).toBe('w1');
  });
});

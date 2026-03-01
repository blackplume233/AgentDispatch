import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, type ServerHarness } from './helpers/server-harness.js';

describe('E2E: Crash recovery', () => {
  let server: ServerHarness;

  beforeAll(async () => {
    server = await startServer({
      heartbeat: { timeout: 2000, checkInterval: 1000 },
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('task release: claimed task can be released back to pending', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Release test', tags: ['test'], priority: 'normal' },
    });
    const task = createRes.json() as { id: string };

    const regRes = await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: `crash-node-${Date.now()}`,
        host: 'localhost',
        tags: [],
        dispatchMode: 'tag-auto',
        agents: [{ id: 'w1', type: 'worker', command: 'echo', workDir: '/tmp' }],
      },
    });
    const client = regRes.json() as { id: string };

    await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: client.id, agentId: 'w1' },
    });

    const releaseRes = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/release`,
      payload: { clientId: client.id, reason: 'Worker crashed' },
    });
    expect(releaseRes.statusCode).toBe(200);
    const released = releaseRes.json() as { status: string };
    expect(released.status).toBe('pending');

    // Another client can now claim it
    const regRes2 = await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: `crash-node-2-${Date.now()}`,
        host: 'localhost',
        tags: [],
        dispatchMode: 'tag-auto',
        agents: [{ id: 'w2', type: 'worker', command: 'echo', workDir: '/tmp' }],
      },
    });
    const client2 = regRes2.json() as { id: string };

    const reclaimRes = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: client2.id, agentId: 'w2' },
    });
    expect(reclaimRes.statusCode).toBe(200);
  });

  it('heartbeat timeout: client goes offline after missing heartbeats', async () => {
    const regRes = await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: `timeout-node-${Date.now()}`,
        host: 'localhost',
        tags: [],
        dispatchMode: 'tag-auto',
        agents: [],
      },
    });
    expect(regRes.statusCode).toBe(201);
    const client = regRes.json() as { id: string; status: string };
    expect(client.status).toBe('online');

    server.context.clientService.startHeartbeatCheck();

    // Wait for heartbeat timeout (2s timeout + 1s check interval + buffer)
    await new Promise((r) => setTimeout(r, 4000));

    const getRes = await server.inject({
      method: 'GET',
      url: `/api/v1/clients/${client.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    const updated = getRes.json() as { status: string };
    expect(updated.status).toBe('offline');

    server.context.clientService.stopHeartbeatCheck();
  });

  it('task cancel: running task can be cancelled', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Cancel test', tags: ['cancel'], priority: 'normal' },
    });
    const task = createRes.json() as { id: string };

    const regRes = await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: `cancel-node-${Date.now()}`,
        host: 'localhost',
        tags: [],
        dispatchMode: 'tag-auto',
        agents: [{ id: 'w3', type: 'worker', command: 'echo', workDir: '/tmp' }],
      },
    });
    const client = regRes.json() as { id: string };

    await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: client.id, agentId: 'w3' },
    });

    const cancelRes = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/cancel`,
      payload: { clientId: client.id, reason: 'User cancelled' },
    });
    expect(cancelRes.statusCode).toBe(200);
    const cancelled = cancelRes.json() as { status: string };
    expect(cancelled.status).toBe('cancelled');
  });

  it('server data survives restart (file persistence)', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Persist test', tags: ['persist'], priority: 'high' },
    });
    const task = createRes.json() as { id: string };

    // Close and restart with same data dir
    const dataDir = server.config.dataDir;
    server.context.archiveScheduler.stop();
    await server.app.close();

    server = await startServer({ dataDir });

    const getRes = await server.inject({
      method: 'GET',
      url: `/api/v1/tasks/${task.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    const persisted = getRes.json() as { title: string; status: string };
    expect(persisted.title).toBe('Persist test');
    expect(persisted.status).toBe('pending');
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, type ServerHarness } from './helpers/server-harness.js';

describe('E2E: Attachments and callbacks', () => {
  let server: ServerHarness;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('create task with callback URL records it', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: {
        title: 'Callback test',
        tags: ['callback'],
        priority: 'normal',
        callbackUrl: 'http://localhost:9999/webhook',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const task = createRes.json() as { id: string; callbackUrl?: string };
    expect(task.callbackUrl).toBe('http://localhost:9999/webhook');
  });

  it('create task with metadata preserves it', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: {
        title: 'Metadata test',
        tags: ['meta'],
        priority: 'high',
        metadata: { source: 'e2e', version: 2 },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const task = createRes.json() as { id: string; metadata?: Record<string, unknown> };
    expect(task.metadata).toEqual({ source: 'e2e', version: 2 });
  });

  it('task status transitions: pending → claimed → progress → release → reclaim', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Status flow', tags: ['flow'], priority: 'normal' },
    });
    expect(createRes.statusCode).toBe(201);
    const task = createRes.json() as { id: string; status: string };
    expect(task.status).toBe('pending');

    const regRes = await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: `flow-node-${Date.now()}`,
        host: 'localhost',
        tags: [],
        dispatchMode: 'tag-auto',
        agents: [{ id: 'w1', type: 'worker', command: 'echo', workDir: '/tmp' }],
      },
    });
    const client = regRes.json() as { id: string };

    // Claim
    const claimRes = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: client.id, agentId: 'w1' },
    });
    expect((claimRes.json() as { status: string }).status).toBe('claimed');

    // Progress
    const progressRes = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/progress`,
      payload: { clientId: client.id, agentId: 'w1', progress: 75, message: 'Almost done' },
    });
    expect(progressRes.statusCode).toBe(200);

    // Release
    const releaseRes = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/release`,
      payload: { clientId: client.id, reason: 'Testing release' },
    });
    expect(releaseRes.statusCode).toBe(200);
    expect((releaseRes.json() as { status: string }).status).toBe('pending');

    // Reclaim
    const reclaimRes = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: client.id, agentId: 'w1' },
    });
    expect(reclaimRes.statusCode).toBe(200);
    expect((reclaimRes.json() as { status: string }).status).toBe('claimed');
  });

  it('client heartbeat updates last heartbeat time', async () => {
    const regRes = await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: `hb-node-${Date.now()}`,
        host: 'localhost',
        tags: [],
        dispatchMode: 'tag-auto',
        agents: [],
      },
    });
    expect(regRes.statusCode).toBe(201);
    const client = regRes.json() as { id: string; lastHeartbeat: string };
    const firstBeat = client.lastHeartbeat;

    await new Promise((r) => setTimeout(r, 50));

    const hbRes = await server.inject({
      method: 'POST',
      url: `/api/v1/clients/${client.id}/heartbeat`,
      payload: { agents: [] },
    });
    expect(hbRes.statusCode).toBe(204);

    const getRes = await server.inject({
      method: 'GET',
      url: `/api/v1/clients/${client.id}`,
    });
    const updated = getRes.json() as { lastHeartbeat: string };
    expect(new Date(updated.lastHeartbeat).getTime()).toBeGreaterThanOrEqual(new Date(firstBeat).getTime());
  });

  it('client list returns registered clients', async () => {
    const uniqueName = `list-client-${Date.now()}`;
    await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: uniqueName,
        host: 'localhost',
        tags: ['testing'],
        dispatchMode: 'tag-auto',
        agents: [],
      },
    });

    const listRes = await server.inject({
      method: 'GET',
      url: '/api/v1/clients',
    });
    expect(listRes.statusCode).toBe(200);
    const clients = listRes.json() as Array<{ name: string }>;
    expect(clients.some((c) => c.name === uniqueName)).toBe(true);
  });

  it('unregister client removes it', async () => {
    const regRes = await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: `unreg-${Date.now()}`,
        host: 'localhost',
        tags: [],
        dispatchMode: 'tag-auto',
        agents: [],
      },
    });
    const client = regRes.json() as { id: string };

    const unregRes = await server.app.inject({
      method: 'DELETE',
      url: `/api/v1/clients/${client.id}`,
    });
    expect(unregRes.statusCode).toBe(204);

    const getRes = await server.inject({
      method: 'GET',
      url: `/api/v1/clients/${client.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

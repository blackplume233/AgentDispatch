import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import type { ServerConfig, Client } from '@agentdispatch/shared';
import { createApp } from '../../src/app.js';

describe('Client API', () => {
  let app: Awaited<ReturnType<typeof createApp>>['app'];
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = path.join(os.tmpdir(), `api-client-test-${Date.now()}`);
    const config: ServerConfig = {
      host: '0.0.0.0',
      port: 0,
      dataDir: tmpDir,
      logLevel: 'error',
      queue: { maxSize: 100, processInterval: 10 },
      heartbeat: { timeout: 60000, checkInterval: 60000 },
      callbacks: { retryCount: 0, retryDelay: 1000 },
      attachments: {
        dir: path.join(tmpDir, 'attachments'),
        maxFileSizeBytes: 50 * 1024 * 1024,
        maxTotalSizeBytes: 200 * 1024 * 1024,
        maxFileCount: 20,
      },
      artifacts: {
        dir: path.join(tmpDir, 'artifacts'),
        maxZipSizeBytes: 500 * 1024 * 1024,
        validateOnUpload: true,
        retainAfterDays: 90,
      },
      logging: {
        dir: path.join(tmpDir, 'logs'),
        rotateDaily: true,
        retainDays: 30,
        httpLog: false,
        auditLog: true,
      },
    };
    const result = await createApp(config);
    app = result.app;
  });

  afterAll(async () => {
    await app.close();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('POST /api/v1/clients/register should register a client', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: 'test-node',
        host: 'localhost',
        dispatchMode: 'tag-auto',
        agents: [
          { id: 'w1', type: 'worker', command: 'echo', workDir: '/tmp' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const client = JSON.parse(res.payload) as Client;
    expect(client.name).toBe('test-node');
    expect(client.status).toBe('online');
  });

  it('should reject duplicate client name', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: { name: 'dup-node', host: 'localhost', dispatchMode: 'tag-auto', agents: [] },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: { name: 'dup-node', host: 'localhost', dispatchMode: 'tag-auto', agents: [] },
    });
    expect(res.statusCode).toBe(409);
  });

  it('GET /api/v1/clients should list clients', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/clients' });
    expect(res.statusCode).toBe(200);
    const clients = JSON.parse(res.payload) as Client[];
    expect(clients.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/clients/:id should get client', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: { name: 'get-node', host: 'localhost', dispatchMode: 'manager', agents: [] },
    });
    const client = JSON.parse(createRes.payload) as Client;

    const res = await app.inject({ method: 'GET', url: `/api/v1/clients/${client.id}` });
    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.payload) as Client).id).toBe(client.id);
  });

  it('GET /api/v1/clients/:id should return 404 for missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/clients/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/v1/clients/:id/heartbeat should update heartbeat', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: { name: 'heartbeat-node', host: 'localhost', dispatchMode: 'tag-auto', agents: [] },
    });
    const client = JSON.parse(createRes.payload) as Client;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/clients/${client.id}/heartbeat`,
      payload: {},
    });
    expect(res.statusCode).toBe(204);
  });

  it('PATCH /api/v1/clients/:id/agents should update agents', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: { name: 'agents-node', host: 'localhost', dispatchMode: 'tag-auto', agents: [] },
    });
    const client = JSON.parse(createRes.payload) as Client;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/clients/${client.id}/agents`,
      payload: [
        { id: 'w1', type: 'worker', status: 'idle', capabilities: ['node'] },
      ],
    });
    expect(res.statusCode).toBe(200);
    const updated = JSON.parse(res.payload) as Client;
    expect(updated.agents).toHaveLength(1);
  });

  it('DELETE /api/v1/clients/:id should unregister client', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: { name: 'unreg-node', host: 'localhost', dispatchMode: 'tag-auto', agents: [] },
    });
    const client = JSON.parse(createRes.payload) as Client;

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/clients/${client.id}` });
    expect(res.statusCode).toBe(204);

    const getRes = await app.inject({ method: 'GET', url: `/api/v1/clients/${client.id}` });
    expect(getRes.statusCode).toBe(404);
  });
});

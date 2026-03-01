import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, type ServerHarness } from './helpers/server-harness.js';

describe('E2E: Auth flow', () => {
  let server: ServerHarness;
  const adminToken = 'e2e-admin-token';
  const clientToken = 'e2e-client-token';
  const operatorToken = 'e2e-operator-token';

  beforeAll(async () => {
    server = await startServer({
      auth: {
        enabled: true,
        users: [{ username: 'admin', password: 'admin123' }],
        tokens: [
          { token: adminToken, role: 'admin' },
          { token: clientToken, role: 'client' },
          { token: operatorToken, role: 'operator' },
        ],
        sessionTtl: 3600000,
      },
    });
  });

  afterAll(async () => {
    await server.close();
  });

  function authHeader(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  it('unauthenticated requests are rejected', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/tasks',
    });
    expect(res.statusCode).toBe(401);
  });

  it('health endpoint is public', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { authEnabled: boolean };
    expect(body.authEnabled).toBe(true);
  });

  it('admin token can create tasks', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Admin task', tags: ['test'], priority: 'normal' },
      headers: authHeader(adminToken),
    });
    expect(res.statusCode).toBe(201);
  });

  it('client token can create and claim tasks', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Client task', tags: ['test'], priority: 'normal' },
      headers: authHeader(clientToken),
    });
    expect(createRes.statusCode).toBe(201);
    const task = createRes.json() as { id: string };

    const regRes = await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: `auth-client-${Date.now()}`,
        host: 'localhost',
        tags: [],
        dispatchMode: 'tag-auto',
        agents: [{ id: 'w1', type: 'worker', command: 'echo', workDir: '/tmp' }],
      },
      headers: authHeader(clientToken),
    });
    expect(regRes.statusCode).toBe(201);
    const client = regRes.json() as { id: string };

    const claimRes = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: client.id, agentId: 'w1' },
      headers: authHeader(clientToken),
    });
    expect(claimRes.statusCode).toBe(200);
  });

  it('operator token can list and view tasks', async () => {
    const listRes = await server.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      headers: authHeader(operatorToken),
    });
    expect(listRes.statusCode).toBe(200);
  });

  it('operator token cannot claim tasks', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Op task', tags: ['test'], priority: 'normal' },
      headers: authHeader(adminToken),
    });
    const task = createRes.json() as { id: string };

    const regRes = await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: `auth-op-${Date.now()}`,
        host: 'localhost',
        tags: [],
        dispatchMode: 'tag-auto',
        agents: [{ id: 'w2', type: 'worker', command: 'echo', workDir: '/tmp' }],
      },
      headers: authHeader(adminToken),
    });
    const client = regRes.json() as { id: string };

    const claimRes = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: client.id, agentId: 'w2' },
      headers: authHeader(operatorToken),
    });
    expect(claimRes.statusCode).toBe(403);
  });

  it('invalid token is rejected', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      headers: authHeader('invalid-token'),
    });
    expect(res.statusCode).toBe(401);
  });

  it('login with valid credentials returns session token', async () => {
    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'admin123' },
    });
    expect(loginRes.statusCode).toBe(200);
    const body = loginRes.json() as { token: string; expiresAt: number };
    expect(body.token).toBeDefined();
    expect(body.expiresAt).toBeGreaterThan(Date.now());

    // Use session token for subsequent request
    const tasksRes = await server.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      headers: authHeader(body.token),
    });
    expect(tasksRes.statusCode).toBe(200);
  });

  it('login with invalid credentials is rejected', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });
});

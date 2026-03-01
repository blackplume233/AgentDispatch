import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import type { ServerConfig, Task } from '@agentdispatch/shared';
import { createApp } from '../../src/app.js';

describe('Task API', () => {
  let app: Awaited<ReturnType<typeof createApp>>['app'];
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = path.join(os.tmpdir(), `api-task-test-${Date.now()}`);
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

  it('POST /api/v1/tasks should create a task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Test task', tags: ['test'], priority: 'high' },
    });
    expect(res.statusCode).toBe(201);
    const task = JSON.parse(res.payload) as Task;
    expect(task.status).toBe('pending');
    expect(task.title).toBe('Test task');
    expect(task.priority).toBe('high');
  });

  it('GET /api/v1/tasks should list tasks', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks' });
    expect(res.statusCode).toBe(200);
    const tasks = JSON.parse(res.payload) as Task[];
    expect(tasks.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/tasks/:id should get a task', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Get by ID', tags: [] },
    });
    const created = JSON.parse(createRes.payload) as Task;

    const res = await app.inject({ method: 'GET', url: `/api/v1/tasks/${created.id}` });
    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.payload) as Task).id).toBe(created.id);
  });

  it('GET /api/v1/tasks/:id should return 404 for missing task', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks/nonexistent' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload) as { error: { code: string } };
    expect(body.error.code).toBe('TASK_NOT_FOUND');
  });

  it('POST /api/v1/tasks/:id/claim should claim a task', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Claim test', tags: [] },
    });
    const task = JSON.parse(createRes.payload) as Task;

    const claimRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: 'c1', agentId: 'a1' },
    });
    expect(claimRes.statusCode).toBe(200);
    const claimed = JSON.parse(claimRes.payload) as Task;
    expect(claimed.status).toBe('claimed');
  });

  it('POST /api/v1/tasks/:id/claim should return 409 for already claimed', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Double claim', tags: [] },
    });
    const task = JSON.parse(createRes.payload) as Task;

    await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: 'c1', agentId: 'a1' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: 'c2', agentId: 'a2' },
    });
    expect(res.statusCode).toBe(409);
    expect((JSON.parse(res.payload) as { error: { code: string } }).error.code).toBe('TASK_ALREADY_CLAIMED');
  });

  it('POST /api/v1/tasks/:id/progress should report progress', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Progress test', tags: [] },
    });
    const task = JSON.parse(createRes.payload) as Task;

    await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: 'c1', agentId: 'a1' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/progress`,
      payload: { clientId: 'c1', agentId: 'a1', progress: 50, message: 'halfway' },
    });
    expect(res.statusCode).toBe(200);
    const updated = JSON.parse(res.payload) as Task;
    expect(updated.status).toBe('in_progress');
    expect(updated.progress).toBe(50);
  });

  it('POST /api/v1/tasks/:id/release should release a claimed task', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Release test', tags: [] },
    });
    const task = JSON.parse(createRes.payload) as Task;

    await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: 'c1', agentId: 'a1' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/release`,
      payload: { clientId: 'c1', reason: 'testing' },
    });
    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.payload) as Task).status).toBe('pending');
  });

  it('POST /api/v1/tasks/:id/cancel should cancel a task', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Cancel test', tags: [] },
    });
    const task = JSON.parse(createRes.payload) as Task;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/cancel`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.payload) as Task).status).toBe('cancelled');
  });

  it('DELETE /api/v1/tasks/:id should delete a task', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Delete test', tags: [] },
    });
    const task = JSON.parse(createRes.payload) as Task;

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/tasks/${task.id}` });
    expect(res.statusCode).toBe(204);

    const getRes = await app.inject({ method: 'GET', url: `/api/v1/tasks/${task.id}` });
    expect(getRes.statusCode).toBe(404);
  });

  it('should verify task data persists to disk', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Persist test', tags: ['persist'] },
    });
    const task = JSON.parse(createRes.payload) as Task;

    const jsonPath = path.join(tmpDir, 'tasks', `${task.id}.json`);
    const mdPath = path.join(tmpDir, 'tasks', `${task.id}.md`);

    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);

    const persisted = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Task;
    expect(persisted.title).toBe('Persist test');
  });

  it('GET /health should return ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});

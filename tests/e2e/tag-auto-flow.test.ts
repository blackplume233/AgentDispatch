import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, type ServerHarness } from './helpers/server-harness.js';

describe('E2E: tag-auto main flow', () => {
  let server: ServerHarness;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('full lifecycle: create → register → claim → progress → complete → verify', async () => {
    // 1. Create a task
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: {
        title: 'E2E Test Task',
        description: 'Integration test task for tag-auto flow',
        tags: ['backend', 'test'],
        priority: 'normal',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const task = createRes.json() as { id: string; status: string };
    expect(task.status).toBe('pending');
    const taskId = task.id;

    // 2. Register a client
    const registerRes = await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: 'e2e-node-1',
        host: 'localhost',
        tags: ['backend'],
        dispatchMode: 'tag-auto',
        agents: [
          { id: 'worker-1', type: 'worker', command: 'echo', workDir: '/tmp', capabilities: ['backend'] },
        ],
      },
    });
    expect(registerRes.statusCode).toBe(201);
    const client = registerRes.json() as { id: string };
    const clientId = client.id;

    // 3. Claim the task
    const claimRes = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskId}/claim`,
      payload: { clientId, agentId: 'worker-1' },
    });
    expect(claimRes.statusCode).toBe(200);
    const claimed = claimRes.json() as { status: string };
    expect(claimed.status).toBe('claimed');

    // 4. Report progress
    const progressRes = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskId}/progress`,
      payload: { clientId, agentId: 'worker-1', progress: 50, message: 'Working...' },
    });
    expect(progressRes.statusCode).toBe(200);

    // 5. Complete with artifact upload via multipart
    const { default: AdmZip } = await import('adm-zip');
    const resultJson = {
      taskId,
      success: true,
      summary: 'E2E test completed',
      outputs: [{ name: 'report.txt', type: 'file', path: 'report.txt', description: 'Test report' }],
    };

    const zip = new AdmZip();
    zip.addFile('report.txt', Buffer.from('E2E test report content'));
    zip.addFile('result.json', Buffer.from(JSON.stringify(resultJson)));
    const zipBuf = zip.toBuffer();

    const boundary = '----E2EBoundary' + Date.now();
    const parts: Buffer[] = [];
    // result.json part
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="result"; filename="result.json"\r\nContent-Type: application/json\r\n\r\n`));
    parts.push(Buffer.from(JSON.stringify(resultJson)));
    parts.push(Buffer.from('\r\n'));
    // artifact.zip part
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="artifact"; filename="artifact.zip"\r\nContent-Type: application/zip\r\n\r\n`));
    parts.push(zipBuf);
    parts.push(Buffer.from('\r\n'));
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const completeRes = await server.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskId}/complete`,
      payload: body,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
    });
    expect(completeRes.statusCode).toBe(200);
    const completed = JSON.parse(completeRes.body) as { status: string };
    expect(completed.status).toBe('completed');

    // 6. Verify
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/v1/tasks/${taskId}`,
    });
    expect(getRes.statusCode).toBe(200);
    const finalTask = getRes.json() as { status: string };
    expect(finalTask.status).toBe('completed');

    // 7. Verify artifacts exist on disk
    const artifactDir = path.join(server.tmpDir, 'artifacts', taskId);
    const exists = fs.existsSync(artifactDir);
    expect(exists).toBe(true);
  });

  it('list tasks returns created tasks', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'List test', tags: ['list-test'], priority: 'low' },
    });
    expect(createRes.statusCode).toBe(201);

    const listRes = await server.inject({
      method: 'GET',
      url: '/api/v1/tasks',
    });
    expect(listRes.statusCode).toBe(200);
    const tasks = listRes.json() as Array<{ title: string }>;
    expect(tasks.some((t) => t.title === 'List test')).toBe(true);
  });

  it('claim already claimed task returns conflict', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: 'Double claim', tags: ['test'], priority: 'normal' },
    });
    const task = createRes.json() as { id: string };

    const regRes = await server.inject({
      method: 'POST',
      url: '/api/v1/clients/register',
      payload: {
        name: `double-claim-node-${Date.now()}`,
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

    const secondClaim = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/claim`,
      payload: { clientId: client.id, agentId: 'w1' },
    });
    expect(secondClaim.statusCode).toBe(409);
  });

  it('get nonexistent task returns 404', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/tasks/nonexistent-id',
    });
    expect(res.statusCode).toBe(404);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { ArtifactService } from '../../src/services/artifact-service.js';

describe('ArtifactService', () => {
  let tmpDir: string;
  let service: ArtifactService;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `artifact-test-${Date.now()}`);
    service = new ArtifactService(tmpDir, 10 * 1024 * 1024);
    await service.init();
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('should validate and store valid artifacts', async () => {
    const zip = Buffer.from('fake-zip-content');
    const result = Buffer.from(JSON.stringify({
      taskId: 'task-1',
      success: true,
      summary: 'Done',
      outputs: [{ name: 'code', type: 'file', path: 'src/' }],
    }));

    const { artifacts } = await service.validateAndStore('task-1', zip, result);
    expect(artifacts.zipHash).toBeDefined();
    expect(artifacts.zipSizeBytes).toBe(zip.length);
    expect(artifacts.resultJson.taskId).toBe('task-1');
  });

  it('should reject missing zip', async () => {
    const result = Buffer.from('{}');
    await expect(
      service.validateAndStore('task-1', Buffer.alloc(0), result),
    ).rejects.toThrow('missing');
  });

  it('should reject invalid JSON', async () => {
    const zip = Buffer.from('zip');
    const result = Buffer.from('not json');
    await expect(
      service.validateAndStore('task-1', zip, result),
    ).rejects.toThrow('parse');
  });

  it('should reject mismatched taskId', async () => {
    const zip = Buffer.from('zip');
    const result = Buffer.from(JSON.stringify({
      taskId: 'wrong-id',
      success: true,
      summary: 'Done',
      outputs: [{ name: 'x', type: 'file', path: 'x' }],
    }));
    await expect(
      service.validateAndStore('task-1', zip, result),
    ).rejects.toThrow('does not match');
  });

  it('should reject oversized zip', async () => {
    const bigService = new ArtifactService(tmpDir, 10);
    const zip = Buffer.alloc(100);
    const result = Buffer.from(JSON.stringify({
      taskId: 'task-1',
      success: true,
      summary: 'Done',
      outputs: [{ name: 'x', type: 'file', path: 'x' }],
    }));
    await expect(
      bigService.validateAndStore('task-1', zip, result),
    ).rejects.toThrow('exceeds');
  });
});

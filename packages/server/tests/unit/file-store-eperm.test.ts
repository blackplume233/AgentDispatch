import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../../src/store/file-store.js';

describe('FileStore atomicWrite EPERM retry', () => {
  let tmpDir: string;
  let store: FileStore;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `filestore-eperm-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    store = new FileStore(tmpDir);
    await store.init();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('should retry rename on EPERM and succeed', async () => {
    const filePath = path.join(tmpDir, 'retry.json');
    const eperm = Object.assign(new Error('EPERM'), { code: 'EPERM' });

    const renameSpy = vi.spyOn(fs.promises, 'rename');
    renameSpy.mockImplementationOnce(() => Promise.reject(eperm));

    await store.atomicWrite(filePath, '{"retry":"ok"}');

    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content).toBe('{"retry":"ok"}');
    expect(renameSpy).toHaveBeenCalledTimes(2);
  });

  it('should throw after max EPERM retries', async () => {
    const filePath = path.join(tmpDir, 'max-retry.json');
    const eperm = Object.assign(new Error('EPERM'), { code: 'EPERM' });

    const renameSpy = vi.spyOn(fs.promises, 'rename');
    renameSpy.mockRejectedValue(eperm);

    await expect(store.atomicWrite(filePath, '{}')).rejects.toMatchObject({ code: 'EPERM' });
    expect(renameSpy).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-EPERM errors', async () => {
    const filePath = path.join(tmpDir, 'eacces.json');
    const eacces = Object.assign(new Error('EACCES'), { code: 'EACCES' });

    const renameSpy = vi.spyOn(fs.promises, 'rename');
    renameSpy.mockRejectedValue(eacces);

    await expect(store.atomicWrite(filePath, '{}')).rejects.toMatchObject({ code: 'EACCES' });
    expect(renameSpy).toHaveBeenCalledTimes(1);
  });
});

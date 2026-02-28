import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../../src/store/file-store.js';

describe('FileStore', () => {
  let tmpDir: string;
  let store: FileStore;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `filestore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    store = new FileStore(tmpDir);
    await store.init();
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create base directory on init', async () => {
    const stat = await fs.promises.stat(tmpDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('should atomically write files', async () => {
    const filePath = path.join(tmpDir, 'test.json');
    await store.atomicWrite(filePath, '{"hello":"world"}');

    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content).toBe('{"hello":"world"}');

    const tmpExists = await store.exists(filePath + '.tmp');
    expect(tmpExists).toBe(false);
  });

  it('should read files', async () => {
    const filePath = path.join(tmpDir, 'read.txt');
    await fs.promises.writeFile(filePath, 'content');

    const result = await store.readFile(filePath);
    expect(result).toBe('content');
  });

  it('should return null for missing files', async () => {
    const result = await store.readFile(path.join(tmpDir, 'missing.txt'));
    expect(result).toBeNull();
  });

  it('should read/write JSON', async () => {
    const filePath = path.join(tmpDir, 'data.json');
    await store.writeJson(filePath, { key: 'value' });

    const data = await store.readJson<{ key: string }>(filePath);
    expect(data).toEqual({ key: 'value' });
  });

  it('should delete files', async () => {
    const filePath = path.join(tmpDir, 'delete.txt');
    await fs.promises.writeFile(filePath, 'data');

    const deleted = await store.deleteFile(filePath);
    expect(deleted).toBe(true);
    expect(await store.exists(filePath)).toBe(false);
  });

  it('should return false when deleting non-existent file', async () => {
    const deleted = await store.deleteFile(path.join(tmpDir, 'nope.txt'));
    expect(deleted).toBe(false);
  });

  it('should list files with extension filter', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'a.json'), '{}');
    await fs.promises.writeFile(path.join(tmpDir, 'b.json'), '{}');
    await fs.promises.writeFile(path.join(tmpDir, 'c.txt'), 'text');

    const jsonFiles = await store.listFiles(tmpDir, '.json');
    expect(jsonFiles.sort()).toEqual(['a.json', 'b.json']);
  });

  it('should clean .tmp files recursively', async () => {
    const subDir = path.join(tmpDir, 'sub');
    await fs.promises.mkdir(subDir, { recursive: true });
    await fs.promises.writeFile(path.join(tmpDir, 'a.tmp'), 'temp');
    await fs.promises.writeFile(path.join(subDir, 'b.tmp'), 'temp');
    await fs.promises.writeFile(path.join(tmpDir, 'keep.json'), '{}');

    const cleaned = await store.cleanTmpFiles();
    expect(cleaned).toBe(2);
    expect(await store.exists(path.join(tmpDir, 'keep.json'))).toBe(true);
    expect(await store.exists(path.join(tmpDir, 'a.tmp'))).toBe(false);
  });
});

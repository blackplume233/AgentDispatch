import fs from 'node:fs';
import path from 'node:path';

export class FileStore {
  protected baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async init(): Promise<void> {
    await fs.promises.mkdir(this.baseDir, { recursive: true });
  }

  async atomicWrite(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    const tmpPath = filePath + '.tmp';
    const fd = await fs.promises.open(tmpPath, 'w');
    try {
      await fd.writeFile(content, 'utf-8');
      await fd.sync();
    } finally {
      await fd.close();
    }
    await fs.promises.rename(tmpPath, filePath);
  }

  async readFile(filePath: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async readJson<T>(filePath: string): Promise<T | null> {
    const content = await this.readFile(filePath);
    if (content === null) return null;
    return JSON.parse(content) as T;
  }

  async writeJson(filePath: string, data: unknown): Promise<void> {
    await this.atomicWrite(filePath, JSON.stringify(data, null, 2));
  }

  async deleteFile(filePath: string): Promise<boolean> {
    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }

  async listFiles(dir: string, extension?: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(dir);
      if (extension) {
        return entries.filter((e) => e.endsWith(extension));
      }
      return entries;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async cleanTmpFiles(dir?: string): Promise<number> {
    const targetDir = dir ?? this.baseDir;
    let cleaned = 0;
    try {
      const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
          cleaned += await this.cleanTmpFiles(fullPath);
        } else if (entry.name.endsWith('.tmp')) {
          await fs.promises.unlink(fullPath);
          cleaned++;
        }
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    return cleaned;
  }
}

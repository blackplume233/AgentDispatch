import fs from 'node:fs';
import path from 'node:path';
import type { Task } from '@agentdispatch/shared';
import { FileStore } from './file-store.js';

export class TaskStore extends FileStore {
  private archiveDir: string;

  constructor(dataDir: string) {
    super(path.join(dataDir, 'tasks'));
    this.archiveDir = path.join(dataDir, 'tasks-archive');
  }

  async init(): Promise<void> {
    await super.init();
    await fs.promises.mkdir(this.archiveDir, { recursive: true });
  }

  getArchiveDir(): string {
    return this.archiveDir;
  }

  private jsonPath(taskId: string): string {
    return path.join(this.baseDir, `${taskId}.json`);
  }

  private mdPath(taskId: string): string {
    return path.join(this.baseDir, `${taskId}.md`);
  }

  private archiveJsonPath(taskId: string): string {
    return path.join(this.archiveDir, `${taskId}.json`);
  }

  private archiveMdPath(taskId: string): string {
    return path.join(this.archiveDir, `${taskId}.md`);
  }

  async save(task: Task): Promise<void> {
    const md = this.taskToMarkdown(task);
    await this.writeJson(this.jsonPath(task.id), task);
    await this.atomicWrite(this.mdPath(task.id), md);
  }

  async get(taskId: string): Promise<Task | null> {
    const active = await this.readJson<Task>(this.jsonPath(taskId));
    if (active) return active;
    return this.readJson<Task>(this.archiveJsonPath(taskId));
  }

  async getArchived(taskId: string): Promise<Task | null> {
    return this.readJson<Task>(this.archiveJsonPath(taskId));
  }

  async delete(taskId: string): Promise<boolean> {
    const jsonDeleted = await this.deleteFile(this.jsonPath(taskId));
    await this.deleteFile(this.mdPath(taskId));
    if (jsonDeleted) return true;
    const archiveDeleted = await this.deleteFile(this.archiveJsonPath(taskId));
    await this.deleteFile(this.archiveMdPath(taskId));
    return archiveDeleted;
  }

  /** Lists only active (non-archived) tasks. */
  async list(): Promise<Task[]> {
    const files = await this.listFiles(this.baseDir, '.json');
    const tasks: Task[] = [];
    for (const file of files) {
      const task = await this.readJson<Task>(path.join(this.baseDir, file));
      if (task) tasks.push(task);
    }
    return tasks;
  }

  async moveToArchive(taskId: string): Promise<boolean> {
    const srcJson = this.jsonPath(taskId);
    const srcMd = this.mdPath(taskId);
    const dstJson = this.archiveJsonPath(taskId);
    const dstMd = this.archiveMdPath(taskId);

    try {
      await fs.promises.rename(srcJson, dstJson);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }

    try {
      await fs.promises.rename(srcMd, dstMd);
    } catch {
      // md file is optional — ignore if missing
    }

    return true;
  }

  private taskToMarkdown(task: Task): string {
    const frontmatter = [
      '---',
      `id: "${task.id}"`,
      `title: "${task.title}"`,
      `status: "${task.status}"`,
      `tags: [${(task.tags ?? []).map((t) => `"${t}"`).join(', ')}]`,
      `priority: "${task.priority}"`,
    ];
    if (task.claimedBy) {
      frontmatter.push(`claimedBy:`);
      frontmatter.push(`  clientId: "${task.claimedBy.clientId}"`);
      frontmatter.push(`  agentId: "${task.claimedBy.agentId}"`);
    }
    frontmatter.push(`createdAt: "${task.createdAt}"`);
    frontmatter.push(`updatedAt: "${task.updatedAt}"`);
    frontmatter.push('---');
    frontmatter.push('');
    frontmatter.push(`# ${task.title}`);
    frontmatter.push('');
    if (task.description) {
      frontmatter.push('## Description');
      frontmatter.push('');
      frontmatter.push(task.description);
      frontmatter.push('');
    }
    if (task.progress !== undefined) {
      frontmatter.push('## Progress');
      frontmatter.push('');
      frontmatter.push(`${task.progress}%${task.progressMessage ? ' — ' + task.progressMessage : ''}`);
      frontmatter.push('');
    }
    return frontmatter.join('\n');
  }
}

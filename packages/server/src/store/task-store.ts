import path from 'node:path';
import type { Task } from '@agentdispatch/shared';
import { FileStore } from './file-store.js';

export class TaskStore extends FileStore {
  constructor(dataDir: string) {
    super(path.join(dataDir, 'tasks'));
  }

  private jsonPath(taskId: string): string {
    return path.join(this.baseDir, `${taskId}.json`);
  }

  private mdPath(taskId: string): string {
    return path.join(this.baseDir, `${taskId}.md`);
  }

  async save(task: Task): Promise<void> {
    await this.writeJson(this.jsonPath(task.id), task);
    await this.atomicWrite(this.mdPath(task.id), this.taskToMarkdown(task));
  }

  async get(taskId: string): Promise<Task | null> {
    return this.readJson<Task>(this.jsonPath(taskId));
  }

  async delete(taskId: string): Promise<boolean> {
    const jsonDeleted = await this.deleteFile(this.jsonPath(taskId));
    await this.deleteFile(this.mdPath(taskId));
    return jsonDeleted;
  }

  async list(): Promise<Task[]> {
    const files = await this.listFiles(this.baseDir, '.json');
    const tasks: Task[] = [];
    for (const file of files) {
      const task = await this.readJson<Task>(path.join(this.baseDir, file));
      if (task) tasks.push(task);
    }
    return tasks;
  }

  private taskToMarkdown(task: Task): string {
    const frontmatter = [
      '---',
      `id: "${task.id}"`,
      `title: "${task.title}"`,
      `status: "${task.status}"`,
      `tags: [${task.tags.map((t) => `"${t}"`).join(', ')}]`,
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

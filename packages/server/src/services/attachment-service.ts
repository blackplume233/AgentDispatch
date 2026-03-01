import fs from 'node:fs';
import path from 'node:path';
import type { TaskAttachment } from '@agentdispatch/shared';
import { ValidationError, ErrorCode } from '@agentdispatch/shared';

export class AttachmentService {
  private attachmentsDir: string;
  private maxFileSizeBytes: number;
  private maxTotalSizeBytes: number;
  private maxFileCount: number;

  constructor(
    attachmentsDir: string,
    maxFileSizeBytes: number = 50 * 1024 * 1024,
    maxTotalSizeBytes: number = 200 * 1024 * 1024,
    maxFileCount: number = 20,
  ) {
    this.attachmentsDir = attachmentsDir;
    this.maxFileSizeBytes = maxFileSizeBytes;
    this.maxTotalSizeBytes = maxTotalSizeBytes;
    this.maxFileCount = maxFileCount;
  }

  async init(): Promise<void> {
    await fs.promises.mkdir(this.attachmentsDir, { recursive: true });
  }

  sanitizeFilename(original: string): string {
    const basename = path.basename(original);
    return basename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
  }

  async store(
    taskId: string,
    files: Array<{ originalName: string; buffer: Buffer; mimeType: string }>,
  ): Promise<TaskAttachment[]> {
    if (files.length === 0) return [];

    if (files.length > this.maxFileCount) {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        `Too many files: ${files.length} exceeds maximum ${this.maxFileCount}`,
      );
    }

    let totalSize = 0;
    for (const file of files) {
      if (file.buffer.length > this.maxFileSizeBytes) {
        throw new ValidationError(
          ErrorCode.VALIDATION_ERROR,
          `File "${file.originalName}" (${file.buffer.length} bytes) exceeds maximum ${this.maxFileSizeBytes} bytes`,
        );
      }
      totalSize += file.buffer.length;
    }
    if (totalSize > this.maxTotalSizeBytes) {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        `Total attachment size ${totalSize} bytes exceeds maximum ${this.maxTotalSizeBytes} bytes`,
      );
    }

    const taskDir = path.join(this.attachmentsDir, taskId);
    await fs.promises.mkdir(taskDir, { recursive: true });

    const now = new Date().toISOString();
    const attachments: TaskAttachment[] = [];
    const usedNames = new Set<string>();

    for (const file of files) {
      let filename = this.sanitizeFilename(file.originalName);
      // Deduplicate names within the same upload batch
      if (usedNames.has(filename)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        let counter = 1;
        while (usedNames.has(`${base}_${counter}${ext}`)) counter++;
        filename = `${base}_${counter}${ext}`;
      }
      usedNames.add(filename);

      await fs.promises.writeFile(path.join(taskDir, filename), file.buffer);

      attachments.push({
        filename,
        originalName: file.originalName,
        sizeBytes: file.buffer.length,
        mimeType: file.mimeType,
        uploadedAt: now,
      });
    }

    return attachments;
  }

  async listFiles(taskId: string): Promise<TaskAttachment[]> {
    const taskDir = path.join(this.attachmentsDir, taskId);
    try {
      await fs.promises.access(taskDir);
    } catch {
      return [];
    }

    const entries = await fs.promises.readdir(taskDir, { withFileTypes: true });
    const attachments: TaskAttachment[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stat = await fs.promises.stat(path.join(taskDir, entry.name));
      attachments.push({
        filename: entry.name,
        originalName: entry.name,
        sizeBytes: stat.size,
        mimeType: 'application/octet-stream',
        uploadedAt: stat.mtime.toISOString(),
      });
    }

    return attachments;
  }

  getFilePath(taskId: string, filename: string): string {
    const safe = path.basename(filename);
    return path.join(this.attachmentsDir, taskId, safe);
  }

  async getFile(taskId: string, filename: string): Promise<{ filePath: string; exists: boolean }> {
    const filePath = this.getFilePath(taskId, filename);
    try {
      await fs.promises.access(filePath);
      return { filePath, exists: true };
    } catch {
      return { filePath, exists: false };
    }
  }

  async deleteAll(taskId: string): Promise<void> {
    const taskDir = path.join(this.attachmentsDir, taskId);
    try {
      await fs.promises.rm(taskDir, { recursive: true, force: true });
    } catch {
      // ignore if directory doesn't exist
    }
  }
}

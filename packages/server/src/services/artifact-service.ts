import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import type { TaskArtifacts, TaskResultJson, ArtifactFileEntry } from '@agentdispatch/shared';
import { ValidationError, ErrorCode, NotFoundError } from '@agentdispatch/shared';

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.html',
  '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.sh', '.bash',
  '.py', '.rb', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.csv', '.sql', '.log', '.env', '.gitignore', '.dockerfile',
  '.svg', '.graphql', '.prisma', '.vue', '.svelte',
]);

export interface ArtifactValidationResult {
  artifacts: TaskArtifacts;
  zipPath: string;
  resultPath: string;
}

export class ArtifactService {
  private artifactsDir: string;
  private maxZipSize: number;

  constructor(artifactsDir: string, maxZipSize: number = 500 * 1024 * 1024) {
    this.artifactsDir = artifactsDir;
    this.maxZipSize = maxZipSize;
  }

  async init(): Promise<void> {
    await fs.promises.mkdir(this.artifactsDir, { recursive: true });
  }

  async validateAndStore(
    taskId: string,
    zipBuffer: Buffer,
    resultBuffer: Buffer,
  ): Promise<ArtifactValidationResult> {
    // Step 1: Check zip exists (buffer provided)
    if (!zipBuffer || zipBuffer.length === 0) {
      throw new ValidationError(ErrorCode.ARTIFACT_MISSING_ZIP, 'Artifact zip is missing or empty');
    }

    // Step 2: Check result.json exists
    if (!resultBuffer || resultBuffer.length === 0) {
      throw new ValidationError(ErrorCode.ARTIFACT_MISSING_RESULT, 'Result JSON is missing or empty');
    }

    // Step 3: Parse result.json
    let resultJson: TaskResultJson;
    try {
      resultJson = JSON.parse(resultBuffer.toString('utf-8')) as TaskResultJson;
    } catch {
      throw new ValidationError(ErrorCode.ARTIFACT_INVALID_JSON, 'Failed to parse result.json');
    }

    // Step 4: Validate required fields
    if (!resultJson.taskId || typeof resultJson.success !== 'boolean' || !resultJson.summary || !Array.isArray(resultJson.outputs)) {
      throw new ValidationError(
        ErrorCode.ARTIFACT_INVALID_JSON,
        'result.json missing required fields (taskId, success, summary, outputs)',
      );
    }

    if (resultJson.outputs.length === 0) {
      throw new ValidationError(ErrorCode.ARTIFACT_INVALID_JSON, 'result.json outputs must have at least 1 entry');
    }

    // Step 5: Validate taskId matches
    if (resultJson.taskId !== taskId) {
      throw new ValidationError(
        ErrorCode.ARTIFACT_INVALID_JSON,
        `result.json taskId "${resultJson.taskId}" does not match task "${taskId}"`,
      );
    }

    // Step 6: Compute SHA-256 hash
    const zipHash = crypto.createHash('sha256').update(zipBuffer).digest('hex');

    // Step 7: Check zip size
    if (zipBuffer.length > this.maxZipSize) {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        `Zip size ${zipBuffer.length} exceeds maximum ${this.maxZipSize}`,
      );
    }

    // Step 8: Store files
    const taskDir = path.join(this.artifactsDir, taskId);
    await fs.promises.mkdir(taskDir, { recursive: true });
    const zipPath = path.join(taskDir, 'artifact.zip');
    const resultPath = path.join(taskDir, 'result.json');

    await fs.promises.writeFile(zipPath, zipBuffer);
    await fs.promises.writeFile(resultPath, resultBuffer);

    const artifacts: TaskArtifacts = {
      zipFile: path.join('artifacts', taskId, 'artifact.zip'),
      zipSizeBytes: zipBuffer.length,
      zipHash,
      resultJson,
      uploadedAt: new Date().toISOString(),
    };

    return { artifacts, zipPath, resultPath };
  }

  getZipPath(taskId: string): string {
    return path.join(this.artifactsDir, taskId, 'artifact.zip');
  }

  async listFiles(taskId: string): Promise<ArtifactFileEntry[]> {
    const zipPath = this.getZipPath(taskId);
    try {
      await fs.promises.access(zipPath);
    } catch {
      throw new NotFoundError('Task', taskId);
    }

    const zip = new AdmZip(zipPath);
    return zip.getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => ({
        path: entry.entryName,
        size: entry.header.size,
        isText: TEXT_EXTENSIONS.has(path.extname(entry.entryName).toLowerCase()),
      }));
  }

  async getFile(taskId: string, filePath: string): Promise<{ buffer: Buffer; isText: boolean }> {
    const zipPath = this.getZipPath(taskId);
    try {
      await fs.promises.access(zipPath);
    } catch {
      throw new NotFoundError('Task', taskId);
    }

    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry(filePath);
    if (!entry) {
      throw new NotFoundError('File', filePath);
    }

    const buffer = entry.getData();
    const isText = TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
    return { buffer, isText };
  }
}

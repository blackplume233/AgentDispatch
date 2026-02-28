import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { TaskArtifacts, TaskResultJson } from '@agentdispatch/shared';
import { ValidationError, ErrorCode } from '@agentdispatch/shared';

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
}

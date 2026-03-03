import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { TaskService } from '../services/task-service.js';
import type { ArtifactService } from '../services/artifact-service.js';
import type { AttachmentService } from '../services/attachment-service.js';
import type { LogStore } from '../store/log-store.js';
import type {
  TaskStatus,
  Task,
  CreateTaskDTO,
  UpdateTaskDTO,
  ClaimTaskDTO,
  ReleaseTaskDTO,
  ProgressDTO,
  CancelTaskDTO,
  FailTaskDTO,
  AppendTaskLogsDTO,
} from '@agentdispatch/shared';
import { ValidationError, ErrorCode, TERMINAL_TASK_STATUSES } from '@agentdispatch/shared';
import { requireRole } from '../middleware/auth.js';

export function registerTaskRoutes(
  app: FastifyInstance,
  taskService: TaskService,
  artifactService: ArtifactService,
  attachmentService: AttachmentService,
  logStore: LogStore,
): void {
  app.post('/api/v1/tasks', async (request, reply) => {
    const contentType = request.headers['content-type'] ?? '';

    if (contentType.includes('multipart/form-data')) {
      const parts = request.parts();
      let dto: CreateTaskDTO | null = null;
      const fileBuffers: Array<{ originalName: string; buffer: Buffer; mimeType: string }> = [];

      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'data') {
          try {
            dto = JSON.parse(part.value as string) as CreateTaskDTO;
          } catch {
            throw new ValidationError(ErrorCode.VALIDATION_ERROR, 'Invalid JSON in "data" field');
          }
        } else if (part.type === 'file' && part.fieldname === 'files') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileBuffers.push({
            originalName: part.filename ?? 'unnamed',
            buffer: Buffer.concat(chunks),
            mimeType: part.mimetype ?? 'application/octet-stream',
          });
        }
      }

      if (!dto) {
        throw new ValidationError(ErrorCode.VALIDATION_ERROR, 'Missing "data" field in multipart request');
      }

      const task = await taskService.createTask(dto);

      if (fileBuffers.length > 0) {
        const attachments = await attachmentService.store(task.id, fileBuffers);
        const updated = await taskService.setAttachments(task.id, attachments);
        return reply.code(201).send(updated);
      }

      return reply.code(201).send(task);
    }

    // Fallback: plain JSON body
    const task = await taskService.createTask(request.body as CreateTaskDTO);
    return reply.code(201).send(task);
  });

  app.get<{ Querystring: { status?: TaskStatus; tag?: string; page?: string; limit?: string } }>(
    '/api/v1/tasks',
    async (request) => {
      const { status, tag, page, limit } = request.query;
      return taskService.listTasks({
        status,
        tag,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
    },
  );

  app.get<{ Querystring: { tag?: string; search?: string; page?: string; limit?: string } }>(
    '/api/v1/tasks/archived',
    async (request) => {
      const { tag, search, page, limit } = request.query;
      return taskService.listArchivedTasks({
        tag,
        search,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
    },
  );

  app.get<{ Params: { id: string } }>('/api/v1/tasks/:id', async (request) => {
    return taskService.getTask(request.params.id);
  });

  const workerOnly = requireRole('admin', 'client');

  app.patch<{ Params: { id: string }; Body: UpdateTaskDTO }>(
    '/api/v1/tasks/:id',
    { preHandler: [workerOnly] },
    async (request) => {
      return taskService.updateTask(request.params.id, request.body);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/v1/tasks/:id', async (request, reply) => {
    await taskService.deleteTask(request.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: ClaimTaskDTO }>(
    '/api/v1/tasks/:id/claim',
    { preHandler: [workerOnly] },
    async (request) => {
      return taskService.claimTask(request.params.id, request.body);
    },
  );

  app.post<{ Params: { id: string }; Body: ReleaseTaskDTO }>(
    '/api/v1/tasks/:id/release',
    { preHandler: [workerOnly] },
    async (request) => {
      return taskService.releaseTask(request.params.id, request.body);
    },
  );

  const adminOnly = requireRole('admin');

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/api/v1/tasks/:id/force-release',
    { preHandler: [adminOnly] },
    async (request) => {
      return taskService.forceReleaseTask(
        request.params.id,
        (request.body as { reason?: string })?.reason ?? 'Admin force release',
      );
    },
  );

  app.post<{ Params: { id: string }; Body: ProgressDTO }>(
    '/api/v1/tasks/:id/progress',
    { preHandler: [workerOnly] },
    async (request) => {
      return taskService.reportProgress(request.params.id, request.body);
    },
  );

  app.post<{ Params: { id: string }; Body: CancelTaskDTO }>(
    '/api/v1/tasks/:id/cancel',
    { preHandler: [workerOnly] },
    async (request) => {
      return taskService.cancelTask(request.params.id, request.body);
    },
  );

  app.post<{ Params: { id: string }; Body: FailTaskDTO }>(
    '/api/v1/tasks/:id/fail',
    { preHandler: [workerOnly] },
    async (request) => {
      const { reason } = request.body;
      return taskService.failTask(request.params.id, reason);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/tasks/:id/complete',
    { preHandler: [workerOnly] },
    async (request, reply) => {
      const preCheckTask = await taskService.getTask(request.params.id);
      if (TERMINAL_TASK_STATUSES.includes(preCheckTask.status) || preCheckTask.status === 'pending') {
        throw new ValidationError(
          ErrorCode.TASK_INVALID_TRANSITION,
          `Cannot complete task in ${preCheckTask.status} status`,
        );
      }

      const contentType = request.headers['content-type'] ?? '';
      if (!contentType.includes('multipart/form-data')) {
        const task = await taskService.completeTask(request.params.id, undefined);
        return reply.send(task);
      }

      const parts = request.parts();
      let zipBuffer: Buffer | null = null;
      let resultBuffer: Buffer | null = null;

      for await (const part of parts) {
        if (part.type === 'file') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          if (part.fieldname === 'zip' || part.filename?.endsWith('.zip')) {
            zipBuffer = buffer;
          } else if (part.fieldname === 'result' || part.filename?.endsWith('.json')) {
            resultBuffer = buffer;
          }
        }
      }

      if (!zipBuffer) {
        throw new ValidationError(ErrorCode.ARTIFACT_MISSING_ZIP, 'Missing artifact zip file');
      }
      if (!resultBuffer) {
        throw new ValidationError(ErrorCode.ARTIFACT_MISSING_RESULT, 'Missing result.json file');
      }

      const { artifacts } = await artifactService.validateAndStore(
        request.params.id,
        zipBuffer,
        resultBuffer,
      );
      const task = await taskService.completeTask(request.params.id, artifacts);
      return reply.send(task);
    },
  );

  // --- Task interaction logs ---

  app.post<{ Params: { id: string }; Body: AppendTaskLogsDTO }>(
    '/api/v1/tasks/:id/logs',
    { preHandler: [workerOnly] },
    async (request, reply) => {
      await taskService.getTask(request.params.id);
      await logStore.appendTaskLogs(request.params.id, request.body.entries);
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    '/api/v1/tasks/:id/logs',
    async (request) => {
      await taskService.getTask(request.params.id);
      return logStore.getTaskLogs(request.params.id, request.query.after);
    },
  );

  // --- Artifact endpoints ---

  app.get<{ Params: { id: string } }>(
    '/api/v1/tasks/:id/artifacts/download',
    async (request, reply) => {
      const task = await taskService.getTask(request.params.id);
      if (!task.artifacts) {
        throw new ValidationError(ErrorCode.VALIDATION_ERROR, 'Task has no artifacts');
      }
      const zipPath = artifactService.getZipPath(request.params.id);
      const stream = fs.createReadStream(zipPath);
      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${request.params.id}.zip"`)
        .send(stream);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/tasks/:id/artifacts/files',
    async (request) => {
      const task = await taskService.getTask(request.params.id);
      if (!task.artifacts) {
        throw new ValidationError(ErrorCode.VALIDATION_ERROR, 'Task has no artifacts');
      }
      return artifactService.listFiles(request.params.id);
    },
  );

  app.get<{ Params: { id: string; '*': string } }>(
    '/api/v1/tasks/:id/artifacts/files/*',
    async (request, reply) => {
      const task = await taskService.getTask(request.params.id);
      if (!task.artifacts) {
        throw new ValidationError(ErrorCode.VALIDATION_ERROR, 'Task has no artifacts');
      }
      const filePath = request.params['*'];
      const { buffer, isText } = await artifactService.getFile(request.params.id, filePath);
      const ext = path.extname(filePath).toLowerCase();

      const mimeMap: Record<string, string> = {
        '.json': 'application/json',
        '.js': 'text/javascript',
        '.ts': 'text/typescript',
        '.html': 'text/html',
        '.css': 'text/css',
        '.md': 'text/markdown',
        '.svg': 'image/svg+xml',
        '.xml': 'application/xml',
        '.yaml': 'text/yaml',
        '.yml': 'text/yaml',
      };
      const contentType = isText ? (mimeMap[ext] ?? 'text/plain') : 'application/octet-stream';

      return reply
        .header('Content-Type', contentType)
        .header('Content-Disposition', `inline; filename="${path.basename(filePath)}"`)
        .send(buffer);
    },
  );

  // --- Attachment endpoints ---

  app.get<{ Params: { id: string } }>(
    '/api/v1/tasks/:id/attachments',
    async (request) => {
      const task = await taskService.getTask(request.params.id);
      return task.attachments ?? [];
    },
  );

  app.get<{ Params: { id: string; filename: string } }>(
    '/api/v1/tasks/:id/attachments/:filename',
    async (request, reply) => {
      await taskService.getTask(request.params.id);
      const { filePath, exists } = await attachmentService.getFile(
        request.params.id,
        request.params.filename,
      );
      if (!exists) {
        throw new ValidationError(ErrorCode.VALIDATION_ERROR, `Attachment "${request.params.filename}" not found`);
      }
      const stream = fs.createReadStream(filePath);
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`)
        .send(stream);
    },
  );

  // --- SSE: Task status stream ---

  app.get<{
    Params: { id: string };
    Querystring: { interval?: string; logs?: string };
  }>('/api/v1/tasks/:id/stream', async (request, reply) => {
    const taskId = request.params.id;
    const pollInterval = Math.max(500, Math.min(30000, Number(request.query.interval) || 2000));
    const includeLogs = request.query.logs !== 'false';

    // Verify task exists (throws TASK_NOT_FOUND if missing)
    await taskService.getTask(taskId);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: string, data: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let lastUpdatedAt = '';
    let lastLogId: string | undefined;
    let closed = false;

    const cleanup = (): void => {
      closed = true;
      clearInterval(timer);
    };

    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);

    const poll = async (): Promise<void> => {
      if (closed) return;
      try {
        const task: Task = await taskService.getTask(taskId);

        if (task.updatedAt !== lastUpdatedAt) {
          lastUpdatedAt = task.updatedAt;
          sendEvent('task', {
            id: task.id,
            status: task.status,
            progress: task.progress,
            progressMessage: task.progressMessage,
            claimedBy: task.claimedBy,
            updatedAt: task.updatedAt,
            completedAt: task.completedAt,
          });
        }

        if (includeLogs) {
          const logs = await logStore.getTaskLogs(taskId, lastLogId);
          if (logs.length > 0) {
            const lastLog = logs[logs.length - 1];
            if (lastLog) lastLogId = lastLog.id;
            sendEvent('logs', logs);
          }
        }

        if (TERMINAL_TASK_STATUSES.includes(task.status)) {
          sendEvent('done', { taskId: task.id, finalStatus: task.status });
          reply.raw.end();
          cleanup();
        }
      } catch {
        if (!closed) {
          sendEvent('error', { message: 'Failed to poll task state' });
        }
      }
    };

    // Initial push
    await poll();

    const timer = setInterval(() => void poll(), pollInterval);
  });
}

import type { FastifyInstance } from 'fastify';
import type { TaskService } from '../services/task-service.js';
import type { ArtifactService } from '../services/artifact-service.js';
import type {
  TaskStatus,
  CreateTaskDTO,
  UpdateTaskDTO,
  ClaimTaskDTO,
  ReleaseTaskDTO,
  ProgressDTO,
  CancelTaskDTO,
} from '@agentdispatch/shared';
import { ValidationError, ErrorCode } from '@agentdispatch/shared';

export function registerTaskRoutes(app: FastifyInstance, taskService: TaskService, artifactService: ArtifactService): void {
  app.post<{ Body: CreateTaskDTO }>('/api/v1/tasks', async (request, reply) => {
    const task = await taskService.createTask(request.body);
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

  app.get<{ Params: { id: string } }>('/api/v1/tasks/:id', async (request) => {
    return taskService.getTask(request.params.id);
  });

  app.patch<{ Params: { id: string }; Body: UpdateTaskDTO }>('/api/v1/tasks/:id', async (request) => {
    return taskService.updateTask(request.params.id, request.body);
  });

  app.delete<{ Params: { id: string } }>('/api/v1/tasks/:id', async (request, reply) => {
    await taskService.deleteTask(request.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: ClaimTaskDTO }>('/api/v1/tasks/:id/claim', async (request) => {
    return taskService.claimTask(request.params.id, request.body);
  });

  app.post<{ Params: { id: string }; Body: ReleaseTaskDTO }>('/api/v1/tasks/:id/release', async (request) => {
    return taskService.releaseTask(request.params.id, request.body);
  });

  app.post<{ Params: { id: string }; Body: ProgressDTO }>('/api/v1/tasks/:id/progress', async (request) => {
    return taskService.reportProgress(request.params.id, request.body);
  });

  app.post<{ Params: { id: string }; Body: CancelTaskDTO }>('/api/v1/tasks/:id/cancel', async (request) => {
    return taskService.cancelTask(request.params.id, request.body);
  });

  app.post<{ Params: { id: string } }>(
    '/api/v1/tasks/:id/complete',
    async (request, reply) => {
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
}

import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import type { ServerConfig } from '@agentdispatch/shared';
import { AppError } from '@agentdispatch/shared';
import { OperationQueue } from './queue/operation-queue.js';
import { TaskStore } from './store/task-store.js';
import { ClientStore } from './store/client-store.js';
import { LogStore } from './store/log-store.js';
import { ArchiveIndex } from './store/archive-index.js';
import { ArchiveCache } from './store/archive-cache.js';
import { TaskService } from './services/task-service.js';
import { ClientService } from './services/client-service.js';
import { ArtifactService } from './services/artifact-service.js';
import { AttachmentService } from './services/attachment-service.js';
import { ArchiveScheduler } from './services/archive-scheduler.js';
import { Logger } from './utils/logger.js';
import { AuthManager, registerAuthHook } from './middleware/auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerClientRoutes } from './routes/clients.js';

export interface AppContext {
  taskService: TaskService;
  clientService: ClientService;
  artifactService: ArtifactService;
  attachmentService: AttachmentService;
  archiveScheduler: ArchiveScheduler;
  archiveCache: ArchiveCache;
  logStore: LogStore;
  logger: Logger;
  queue: OperationQueue;
  authManager: AuthManager | null;
}

export async function createApp(
  config: ServerConfig,
): Promise<{ app: ReturnType<typeof Fastify>; context: AppContext }> {
  const app = Fastify({ logger: false });

  // Initialize stores
  const taskStore = new TaskStore(config.dataDir);
  const clientStore = new ClientStore(config.dataDir);
  await taskStore.init();
  await clientStore.init();

  // Clean .tmp files on startup
  await taskStore.cleanTmpFiles();

  // Initialize logger
  const logger = new Logger(config.logging.dir, config.logLevel);
  await logger.init();

  // Initialize queue and services
  const queue = new OperationQueue(config.queue.maxSize);
  const artifactService = new ArtifactService(config.artifacts.dir, config.artifacts.maxZipSizeBytes);
  await artifactService.init();
  const attachmentService = new AttachmentService(
    config.attachments.dir,
    config.attachments.maxFileSizeBytes,
    config.attachments.maxTotalSizeBytes,
    config.attachments.maxFileCount,
  );
  await attachmentService.init();
  const logStore = new LogStore(config.logging.dir);
  await logStore.init();

  // Archive subsystem
  const archiveIndex = new ArchiveIndex(taskStore.getArchiveDir());
  await archiveIndex.init();
  const archiveCache = new ArchiveCache(config.archive.cacheMaxAge);
  archiveCache.start();

  const taskService = new TaskService(taskStore, queue, logger);
  taskService.setArchive(archiveIndex, archiveCache);

  const archiveScheduler = new ArchiveScheduler(
    taskStore, archiveIndex, queue, logger,
    config.archive.checkInterval, config.archive.archiveAfterDays,
  );

  const clientService = new ClientService(
    clientStore,
    queue,
    logger,
    config.heartbeat.timeout,
    config.heartbeat.checkInterval,
  );
  clientService.setTaskService(taskService);

  // HTTP request/response logging middleware
  if (config.logging.httpLog) {
    app.addHook('onRequest', async (request) => {
      (request as unknown as Record<string, unknown>)['_startTime'] = Date.now();
    });

    app.addHook('onResponse', async (request, reply) => {
      const startTime = (request as unknown as Record<string, number>)['_startTime'] ?? Date.now();
      logger.write('http', {
        timestamp: new Date().toISOString(),
        level: 'info',
        source: 'server',
        category: 'http',
        event: 'http.request',
        message: `${request.method} ${request.url} ${reply.statusCode}`,
        context: {
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          ip: request.ip,
        },
        duration: Date.now() - startTime,
      });
    });
  }

  // Global error handler
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const errObj = error as Record<string, unknown>;
    if (typeof errObj['statusCode'] === 'number' && errObj['statusCode'] < 500) {
      return reply.code(errObj['statusCode']).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Bad request',
        },
        timestamp: new Date().toISOString(),
      });
    }

    logger.error('Unhandled error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Auth middleware (must be registered before routes)
  let authManager: AuthManager | null = null;
  if (config.auth?.enabled) {
    authManager = new AuthManager(config.auth);
    authManager.start();
    registerAuthHook(app, authManager);
  }

  // Tolerate empty-body requests: JSON DELETE with no body, POST with no Content-Type (e.g. logout)
  app.addHook('preParsing', async (request, _reply, payload) => {
    const ct = request.headers['content-type'];
    const cl = request.headers['content-length'];
    if (ct?.includes('application/json') && cl === '0') {
      request.headers['content-type'] = undefined as unknown as string;
    }
    return payload;
  });

  // Accept unknown/missing content types for requests with no meaningful body (prevents 415)
  app.addContentTypeParser('*', (_request, payload, done) => {
    let data = '';
    payload.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    payload.on('end', () => { done(null, data || undefined); });
  });

  // Multipart support for artifact uploads and attachments
  await app.register(multipart, {
    limits: { fileSize: config.attachments.maxFileSizeBytes },
  });

  // Register routes
  registerAuthRoutes(app, authManager);
  registerTaskRoutes(app, taskService, artifactService, attachmentService, logStore);
  registerClientRoutes(app, clientService, logStore);

  // Health check
  app.get('/health', async () => ({ status: 'ok', version: '0.0.1', authEnabled: config.auth?.enabled ?? false }));

  const context: AppContext = {
    taskService, clientService, artifactService, attachmentService,
    archiveScheduler, archiveCache, logStore, logger, queue, authManager,
  };

  return { app, context };
}

export const VERSION = '0.0.1';

export { Logger } from './utils/logger.js';
export type { LogLevel } from './utils/logger.js';

export { OperationQueue } from './queue/operation-queue.js';
export type { Operation } from './queue/operation-queue.js';

export { FileStore } from './store/file-store.js';
export { TaskStore } from './store/task-store.js';
export { ClientStore } from './store/client-store.js';

export { TaskService } from './services/task-service.js';
export { ClientService } from './services/client-service.js';
export { ArtifactService } from './services/artifact-service.js';

export { createApp } from './app.js';
export type { AppContext } from './app.js';
export { loadConfig } from './config.js';

// Server entry point
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const isDirectRun =
  process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');

if (isDirectRun) {
  const config = loadConfig();
  const { app, context } = await createApp(config);

  context.clientService.startHeartbeatCheck();
  context.archiveScheduler.start();

  app.listen({ host: config.host, port: config.port }, (err: Error | null, address: string) => {
    if (err) {
      context.logger.error('Failed to start server', { error: String(err) });
      process.exit(1);
    }
    context.logger.info(`Server started at ${address}`);
  });

  const shutdown = async (): Promise<void> => {
    context.clientService.stopHeartbeatCheck();
    context.archiveScheduler.stop();
    context.archiveCache.destroy();
    context.authManager?.destroy();
    await context.queue.drain();
    await context.logger.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

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

  const isExposed = config.host === '0.0.0.0' || config.host === '::' || config.host === '';
  if (isExposed && !config.auth?.enabled) {
    const msg =
      'Server is listening on all interfaces but auth is disabled. ' +
      'Any device on the network can access the API without authentication. ' +
      'Set auth.enabled=true and configure auth.users in server.config.json.';
    console.warn(`\n⚠  WARNING: ${msg}\n`);
  }
  if (isExposed && config.auth?.enabled && config.auth.users.length === 0) {
    const msg =
      'Auth is enabled but no users are configured in auth.users. ' +
      'Dashboard login will be unavailable. Add at least one user to auth.users in server.config.json.';
    console.warn(`\n⚠  WARNING: ${msg}\n`);
  }

  const { app, context } = await createApp(config);

  context.clientService.startHeartbeatCheck();
  context.archiveScheduler.start();
  if (context.serverManager) {
    void context.serverManager.start();
  }

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
    if (context.serverManager) {
      await context.serverManager.stop();
    }
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

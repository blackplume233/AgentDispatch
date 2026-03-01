import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import type { ServerConfig } from '@agentdispatch/shared';
import { createApp } from '../../../packages/server/src/app.js';
import type { AppContext } from '../../../packages/server/src/app.js';

export interface ServerHarness {
  app: Awaited<ReturnType<typeof createApp>>['app'];
  context: AppContext;
  config: ServerConfig;
  tmpDir: string;
  inject: (opts: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) => Promise<{ statusCode: number; json: () => unknown }>;
  close: () => Promise<void>;
}

export async function startServer(configOverrides?: Partial<ServerConfig>): Promise<ServerHarness> {
  const tmpDir = path.join(os.tmpdir(), `e2e-server-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

  const config: ServerConfig = {
    host: '0.0.0.0',
    port: 0,
    dataDir: tmpDir,
    logLevel: 'error',
    queue: { maxSize: 100, processInterval: 10 },
    heartbeat: { timeout: 5000, checkInterval: 2000 },
    callbacks: { retryCount: 1, retryDelay: 200 },
    attachments: {
      dir: path.join(tmpDir, 'attachments'),
      maxFileSizeBytes: 50 * 1024 * 1024,
      maxTotalSizeBytes: 200 * 1024 * 1024,
      maxFileCount: 20,
    },
    artifacts: {
      dir: path.join(tmpDir, 'artifacts'),
      maxZipSizeBytes: 500 * 1024 * 1024,
      validateOnUpload: true,
      retainAfterDays: 90,
    },
    logging: {
      dir: path.join(tmpDir, 'logs'),
      rotateDaily: false,
      retainDays: 7,
      httpLog: false,
      auditLog: true,
    },
    archive: {
      checkInterval: 3_600_000,
      archiveAfterDays: 1,
      cacheMaxAge: 3_600_000,
    },
    ...configOverrides,
  };

  const result = await createApp(config);
  result.context.archiveScheduler.stop();

  const inject: ServerHarness['inject'] = async (opts) => {
    const res = await result.app.inject({
      method: opts.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      url: opts.url,
      payload: opts.payload,
      headers: {
        'content-type': 'application/json',
        ...opts.headers,
      },
    });
    return {
      statusCode: res.statusCode,
      json: () => JSON.parse(res.body),
    };
  };

  const close = async () => {
    result.context.archiveScheduler.stop();
    result.context.archiveCache.destroy();
    if (result.context.authManager) {
      result.context.authManager.destroy();
    }
    result.context.clientService.stopHeartbeatCheck();
    await result.app.close();
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  };

  return { app: result.app, context: result.context, config, tmpDir, inject, close };
}

import fs from 'node:fs';
import path from 'node:path';
import type { ServerConfig } from '@agentdispatch/shared';

const DEFAULT_CONFIG: ServerConfig = {
  host: '0.0.0.0',
  port: 9800,
  dataDir: './data',
  logLevel: 'info',
  queue: { maxSize: 1000, processInterval: 100 },
  heartbeat: { timeout: 60000, checkInterval: 15000 },
  callbacks: { retryCount: 3, retryDelay: 5000 },
  attachments: {
    dir: '',
    maxFileSizeBytes: 50 * 1024 * 1024,
    maxTotalSizeBytes: 200 * 1024 * 1024,
    maxFileCount: 20,
  },
  artifacts: {
    dir: '',
    maxZipSizeBytes: 500 * 1024 * 1024,
    validateOnUpload: true,
    retainAfterDays: 90,
  },
  logging: {
    dir: '',
    rotateDaily: true,
    retainDays: 30,
    httpLog: true,
    auditLog: true,
  },
  archive: {
    checkInterval: 3600000,
    archiveAfterDays: 1,
    cacheMaxAge: 3600000,
  },
};

export function loadConfig(configPath?: string): ServerConfig {
  let fileConfig: Record<string, unknown> = {};

  const resolvedPath =
    configPath ?? (process.env['DISPATCH_CONFIG_PATH'] as string | undefined) ?? 'server.config.json';
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    fileConfig = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Config file not found - use defaults
  }

  const fc = fileConfig as Partial<ServerConfig>;
  const dataDir = (process.env['DISPATCH_DATA_DIR'] ?? fc.dataDir ?? DEFAULT_CONFIG.dataDir) as string;

  return {
    host: (process.env['DISPATCH_SERVER_HOST'] ?? fc.host ?? DEFAULT_CONFIG.host) as string,
    port: Number(process.env['DISPATCH_SERVER_PORT'] ?? fc.port ?? DEFAULT_CONFIG.port),
    dataDir,
    logLevel: (process.env['DISPATCH_LOG_LEVEL'] ?? fc.logLevel ?? DEFAULT_CONFIG.logLevel) as ServerConfig['logLevel'],
    queue: {
      maxSize: Number(process.env['DISPATCH_QUEUE_MAX_SIZE'] ?? fc.queue?.maxSize ?? DEFAULT_CONFIG.queue.maxSize),
      processInterval: fc.queue?.processInterval ?? DEFAULT_CONFIG.queue.processInterval,
    },
    heartbeat: {
      timeout: Number(
        process.env['DISPATCH_HEARTBEAT_TIMEOUT'] ?? fc.heartbeat?.timeout ?? DEFAULT_CONFIG.heartbeat.timeout,
      ),
      checkInterval: fc.heartbeat?.checkInterval ?? DEFAULT_CONFIG.heartbeat.checkInterval,
    },
    callbacks: {
      retryCount: fc.callbacks?.retryCount ?? DEFAULT_CONFIG.callbacks.retryCount,
      retryDelay: fc.callbacks?.retryDelay ?? DEFAULT_CONFIG.callbacks.retryDelay,
    },
    attachments: {
      dir: fc.attachments?.dir || path.join(dataDir, 'attachments'),
      maxFileSizeBytes: fc.attachments?.maxFileSizeBytes ?? DEFAULT_CONFIG.attachments.maxFileSizeBytes,
      maxTotalSizeBytes: fc.attachments?.maxTotalSizeBytes ?? DEFAULT_CONFIG.attachments.maxTotalSizeBytes,
      maxFileCount: fc.attachments?.maxFileCount ?? DEFAULT_CONFIG.attachments.maxFileCount,
    },
    artifacts: {
      dir: fc.artifacts?.dir || path.join(dataDir, 'artifacts'),
      maxZipSizeBytes: fc.artifacts?.maxZipSizeBytes ?? DEFAULT_CONFIG.artifacts.maxZipSizeBytes,
      validateOnUpload: fc.artifacts?.validateOnUpload ?? DEFAULT_CONFIG.artifacts.validateOnUpload,
      retainAfterDays: fc.artifacts?.retainAfterDays ?? DEFAULT_CONFIG.artifacts.retainAfterDays,
    },
    logging: {
      dir: fc.logging?.dir || path.join(dataDir, 'logs'),
      rotateDaily: fc.logging?.rotateDaily ?? DEFAULT_CONFIG.logging.rotateDaily,
      retainDays: fc.logging?.retainDays ?? DEFAULT_CONFIG.logging.retainDays,
      httpLog: fc.logging?.httpLog ?? DEFAULT_CONFIG.logging.httpLog,
      auditLog: fc.logging?.auditLog ?? DEFAULT_CONFIG.logging.auditLog,
    },
    archive: {
      checkInterval: Number(
        process.env['DISPATCH_ARCHIVE_CHECK_INTERVAL'] ??
          fc.archive?.checkInterval ??
          DEFAULT_CONFIG.archive.checkInterval,
      ),
      archiveAfterDays: Number(
        process.env['DISPATCH_ARCHIVE_AFTER_DAYS'] ??
          fc.archive?.archiveAfterDays ??
          DEFAULT_CONFIG.archive.archiveAfterDays,
      ),
      cacheMaxAge: Number(
        process.env['DISPATCH_ARCHIVE_CACHE_MAX_AGE'] ??
          fc.archive?.cacheMaxAge ??
          DEFAULT_CONFIG.archive.cacheMaxAge,
      ),
    },
  };
}

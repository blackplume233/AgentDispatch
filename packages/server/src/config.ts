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
  };
}

import fs from 'node:fs';
import path from 'node:path';
import type { ServerConfig, AuthTokenRole } from '@agentdispatch/shared';

type TokenEntry = string | { token: string; role?: AuthTokenRole };

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
  auth: {
    enabled: false,
    users: [],
    tokens: [],
    sessionTtl: 86400000,
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
    auth: {
      enabled:
        (process.env['DISPATCH_AUTH_ENABLED'] ?? String(fc.auth?.enabled ?? DEFAULT_CONFIG.auth.enabled)) === 'true',
      users: fc.auth?.users ?? DEFAULT_CONFIG.auth.users,
      tokens: mergeTokens(fc.auth?.tokens, process.env['DISPATCH_AUTH_TOKENS']),
      sessionTtl: fc.auth?.sessionTtl ?? DEFAULT_CONFIG.auth.sessionTtl,
    },
  };
}

/**
 * Parse `DISPATCH_AUTH_TOKENS` env var and merge with config-file tokens.
 *
 * Format: comma-separated, optional `:role` suffix per entry.
 *   e.g. "tok_abc123,tok_xyz:operator,tok_admin:admin"
 *
 * Env-var tokens are appended after config-file tokens.
 * Duplicates (same token string) are kept — AuthManager.Map deduplicates
 * and later entries win, so env vars can override roles from the config file.
 */
function mergeTokens(
  fileTokens: TokenEntry[] | undefined,
  envTokens: string | undefined,
): TokenEntry[] {
  const base: TokenEntry[] = fileTokens ?? DEFAULT_CONFIG.auth.tokens;
  if (!envTokens) return base;

  const VALID_ROLES = new Set<AuthTokenRole>(['admin', 'client', 'operator']);

  const parsed: TokenEntry[] = envTokens
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment) => {
      const colonIdx = segment.lastIndexOf(':');
      if (colonIdx > 0) {
        const maybeRole = segment.slice(colonIdx + 1) as AuthTokenRole;
        if (VALID_ROLES.has(maybeRole)) {
          return { token: segment.slice(0, colonIdx), role: maybeRole };
        }
      }
      return segment;
    });

  return [...base, ...parsed];
}

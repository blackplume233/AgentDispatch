import type { DispatchMode } from './client.js';

export interface ServerConfig {
  host: string;
  port: number;
  dataDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  queue: {
    maxSize: number;
    processInterval: number;
  };
  heartbeat: {
    timeout: number;
    checkInterval: number;
  };
  callbacks: {
    retryCount: number;
    retryDelay: number;
  };
  attachments: {
    dir: string;
    maxFileSizeBytes: number;
    maxTotalSizeBytes: number;
    maxFileCount: number;
  };
  artifacts: {
    dir: string;
    maxZipSizeBytes: number;
    validateOnUpload: boolean;
    retainAfterDays: number;
  };
  logging: {
    dir: string;
    rotateDaily: boolean;
    retainDays: number;
    httpLog: boolean;
    auditLog: boolean;
  };
  archive: {
    checkInterval: number;
    archiveAfterDays: number;
    cacheMaxAge: number;
  };
  auth: {
    enabled: boolean;
    users: Array<{ username: string; password: string }>;
    tokens: Array<string | { token: string; role?: AuthTokenRole }>;
    sessionTtl: number;
  };
  serverManager?: {
    enabled: boolean;
    agentConfig: ManagerConfig;
    heartbeatInterval: number;
    restartOnFailure: boolean;
    maxRestartAttempts: number;
    restartDelay: number;
  };
}

export type AuthTokenRole = 'admin' | 'client' | 'operator';

export interface DispatchRule {
  taskTags: string[];
  targetAgentId?: string;
  targetCapabilities?: string[];
  priority?: number;
}

export interface BaseAgentConfig {
  id: string;
  type: 'manager' | 'worker';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  workDir: string;
  prompt?: string;
  workflow?: string;
  agentBackend?: string;
  passes?: string[];
  capabilities?: string[];
  acpCapabilities?: {
    fs?: {
      readTextFile?: boolean;
      writeTextFile?: boolean;
    };
    terminal?: boolean;
  };
  permissionPolicy?: 'auto-allow' | 'auto-deny' | 'prompt';
}

export interface WorkerConfig extends BaseAgentConfig {
  type: 'worker';
  autoClaimTags?: string[];
  maxConcurrency?: number;
  allowMultiProcess?: boolean;
  promptTemplate?: string;
  presetPrompt?: string;
}

export interface ManagerConfig extends BaseAgentConfig {
  type: 'manager';
}

export type AgentConfig = WorkerConfig | ManagerConfig;

export interface ClientConfig {
  name: string;
  serverUrl: string;
  token?: string;
  tags: string[];
  dispatchMode: DispatchMode;
  polling: {
    interval: number;
  };
  ipc: {
    path: string;
  };
  heartbeat: {
    interval: number;
  };
  autoDispatch: {
    rules: DispatchRule[];
    fallbackAction?: 'skip' | 'queue-local';
  };
  logging: {
    dir: string;
    rotateDaily: boolean;
    retainDays: number;
    httpLog: boolean;
    auditLog: boolean;
    agentLog: boolean;
  };
  agents: AgentConfig[];
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

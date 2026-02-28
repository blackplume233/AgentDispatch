export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export type LogSource = 'server' | 'client' | 'agent';

export type LogCategory = 'http' | 'task' | 'client' | 'agent' | 'ai' | 'ipc' | 'queue' | 'poll';

export interface AuditLogEntry {
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  category: LogCategory;
  event: string;
  message: string;
  context: {
    requestId?: string;
    taskId?: string;
    clientId?: string;
    agentId?: string;
    [key: string]: unknown;
  };
  duration?: number;
}

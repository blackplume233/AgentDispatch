export const VERSION = '0.0.1';

// Types
export type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskArtifacts,
  TaskResultJson,
  TaskOutput,
  InteractionStepType,
  InteractionLogEntry,
  ArtifactFileEntry,
} from './types/task.js';
export { VALID_TASK_TRANSITIONS, isValidTransition } from './types/task.js';

export type { Client, ClientStatus, DispatchMode } from './types/client.js';

export type { AgentInfo, AgentType, AgentStatus, AgentRegistration } from './types/agent.js';

export type {
  CreateTaskDTO,
  UpdateTaskDTO,
  ClaimTaskDTO,
  ReleaseTaskDTO,
  CompleteTaskDTO,
  CancelTaskDTO,
  ProgressDTO,
  RegisterClientDTO,
  HeartbeatDTO,
  AppendTaskLogsDTO,
  AppendClientLogsDTO,
} from './types/dto.js';

export type { IPCMessage, IPCError } from './types/ipc.js';

export type { AuditLogEntry, LogLevel, LogSource, LogCategory, ClientLogEntry } from './types/log.js';

export type {
  ServerConfig,
  ClientConfig,
  AgentConfig,
  DispatchRule,
  ErrorResponse,
} from './types/config.js';

// Errors
export { ErrorCode, AppError, NotFoundError, ConflictError, ValidationError } from './errors/index.js';
export type { ErrorCodeType } from './errors/index.js';

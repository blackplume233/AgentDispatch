export const VERSION = '0.0.1';

// Types
export type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskAttachment,
  TaskArtifacts,
  TaskResultJson,
  TaskOutput,
  TaskSummary,
  InteractionStepType,
  InteractionLogEntry,
  ArtifactFileEntry,
} from './types/task.js';
export {
  VALID_TASK_TRANSITIONS,
  TERMINAL_TASK_STATUSES,
  isValidTransition,
  toTaskSummary,
} from './types/task.js';

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

export type {
  AuditLogEntry,
  LogLevel,
  LogSource,
  LogCategory,
  ClientLogEntry,
} from './types/log.js';

export type {
  ServerConfig,
  ClientConfig,
  BaseAgentConfig,
  AgentConfig,
  WorkerConfig,
  ManagerConfig,
  DispatchRule,
  ErrorResponse,
  AuthTokenRole,
} from './types/config.js';

// Errors
export {
  ErrorCode,
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from './errors/index.js';
export type { ErrorCodeType } from './errors/index.js';

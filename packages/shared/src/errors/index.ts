export const ErrorCode = {
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TASK_ALREADY_CLAIMED: 'TASK_ALREADY_CLAIMED',
  TASK_INVALID_TRANSITION: 'TASK_INVALID_TRANSITION',
  CLIENT_NOT_FOUND: 'CLIENT_NOT_FOUND',
  CLIENT_ALREADY_REGISTERED: 'CLIENT_ALREADY_REGISTERED',
  CLIENT_OFFLINE: 'CLIENT_OFFLINE',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_BUSY: 'AGENT_BUSY',
  AGENT_START_FAILED: 'AGENT_START_FAILED',
  IPC_CONNECTION_FAILED: 'IPC_CONNECTION_FAILED',
  IPC_TIMEOUT: 'IPC_TIMEOUT',
  ARTIFACT_MISSING_ZIP: 'ARTIFACT_MISSING_ZIP',
  ARTIFACT_MISSING_RESULT: 'ARTIFACT_MISSING_RESULT',
  ARTIFACT_INVALID_JSON: 'ARTIFACT_INVALID_JSON',
  ARTIFACT_HASH_MISMATCH: 'ARTIFACT_HASH_MISMATCH',
  QUEUE_FULL: 'QUEUE_FULL',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

const ERROR_STATUS_MAP: Record<string, number> = {
  TASK_NOT_FOUND: 404,
  CLIENT_NOT_FOUND: 404,
  AGENT_NOT_FOUND: 404,
  TASK_ALREADY_CLAIMED: 409,
  CLIENT_ALREADY_REGISTERED: 409,
  AGENT_BUSY: 409,
  TASK_INVALID_TRANSITION: 400,
  ARTIFACT_MISSING_ZIP: 400,
  ARTIFACT_MISSING_RESULT: 400,
  ARTIFACT_INVALID_JSON: 400,
  ARTIFACT_HASH_MISMATCH: 400,
  VALIDATION_ERROR: 400,
  CLIENT_OFFLINE: 400,
  IPC_CONNECTION_FAILED: 503,
  IPC_TIMEOUT: 504,
  AGENT_START_FAILED: 500,
  QUEUE_FULL: 503,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode?: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode ?? ERROR_STATUS_MAP[code] ?? 500;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 404, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 409, details);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 400, details);
    this.name = 'ValidationError';
  }
}

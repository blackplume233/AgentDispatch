// Agent process management
export { AgentProcess } from './agent-process.js';
export type { AgentProcessEvents, AgentProcessEnv } from './agent-process.js';

// ACP connection factory
export { createAcpConnection } from './connection-factory.js';
export type { AcpConnectionHandle, CreateAcpConnectionOptions } from './connection-factory.js';

// Generic pass runner
export { AcpPassRunner } from './pass-runner.js';
export type { AcpSessionContext, AcpPass, PassDecision, AcpRunResult } from './pass-runner.js';

// ACP types (local definitions)
export type {
  AcpStream,
  AcpInitializeParams,
  AcpInitializeResult,
  AcpNewSessionParams,
  AcpNewSessionResult,
  AcpPromptParams,
  AcpPromptResult,
  AcpConnection,
  AcpSessionUpdate,
  PermissionRequest,
} from './types.js';

// Re-exports from @agentclientprotocol/sdk
export type {
  ClientSideConnection,
  StopReason,
  PromptResponse,
  ContentBlock,
  AcpClient,
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  KillTerminalCommandRequest,
  KillTerminalCommandResponse,
} from './types.js';

export { ndJsonStream, PROTOCOL_VERSION } from './types.js';

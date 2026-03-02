export type {
  ClientSideConnection,
  StopReason,
  PromptResponse,
  ContentBlock,
  Client as AcpClient,
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
} from '@agentclientprotocol/sdk';

export {
  ClientSideConnection as ClientSideConnectionImpl,
  ndJsonStream,
  PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk';

export interface AcpStream {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

export interface AcpInitializeParams {
  protocolVersion: number;
  clientCapabilities: {
    fs?: { readTextFile?: boolean; writeTextFile?: boolean };
    terminal?: boolean;
  };
  clientInfo: { name: string; title?: string; version: string };
}

export interface AcpInitializeResult {
  protocolVersion: number;
  agentCapabilities: Record<string, unknown>;
  agentInfo: { name: string; version: string };
}

export interface AcpNewSessionParams {
  cwd: string;
  mcpServers?: unknown[];
}

export interface AcpNewSessionResult {
  sessionId: string;
}

export interface AcpPromptParams {
  sessionId: string;
  prompt: Array<{ type: 'text'; text: string }>;
}

export interface AcpPromptResult {
  stopReason: string;
}

export interface AcpConnection {
  initialize(params: AcpInitializeParams): Promise<AcpInitializeResult>;
  newSession(params: AcpNewSessionParams): Promise<AcpNewSessionResult>;
  prompt(params: AcpPromptParams): Promise<AcpPromptResult>;
  cancel(sessionId: string): Promise<void>;
}

export interface AcpSessionUpdate {
  sessionId: string;
  type: string;
  data: unknown;
}

export interface PermissionRequest {
  sessionId: string;
  description: string;
  options: Array<{ kind: string; description: string }>;
}

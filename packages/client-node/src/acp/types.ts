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
  clientInfo: { name: string; title: string; version: string };
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

export type StopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'max_model_requests'
  | 'refused'
  | 'cancelled';

export interface AcpPromptResult {
  stopReason: StopReason;
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

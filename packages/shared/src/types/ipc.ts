export interface IPCMessage {
  id: string;
  type: 'request' | 'response' | 'event';
  command: string;
  payload?: unknown;
  error?: IPCError;
  token?: string;
}

export interface IPCError {
  code: string;
  message: string;
  details?: unknown;
}

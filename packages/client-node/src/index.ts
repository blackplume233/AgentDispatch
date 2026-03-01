export const VERSION = '0.0.1';

export { ClientNode } from './node.js';
export { ServerHttpClient } from './http/server-client.js';
export type { CompleteTaskOptions } from './http/server-client.js';
export { IPCServer } from './ipc/ipc-server.js';
export type { IPCHandler } from './ipc/ipc-server.js';
export { TaskPoller } from './polling/task-poller.js';
export type { PollCallback } from './polling/task-poller.js';
export { loadClientConfig, getDefaultIpcPath } from './config.js';

export { AcpController } from './acp/acp-controller.js';
export { AgentProcess } from './acp/agent-process.js';
export { DispatchAcpClient } from './acp/dispatch-acp-client.js';
export {
  buildWorkerPrompt,
  renderTemplate,
  buildTemplateVars,
} from './templates/template-engine.js';

export { Dispatcher } from './dispatch/dispatcher.js';
export type { DispatchDecision } from './dispatch/dispatcher.js';
export { TagMatcher } from './dispatch/tag-matcher.js';
export type { MatchResult } from './dispatch/tag-matcher.js';
export { WorkerManager } from './agents/worker-manager.js';
export type { WorkerState } from './agents/worker-manager.js';
export { ManagerHandler } from './agents/manager-handler.js';
export type { DispatchAdvice, ManagerHandlerOptions } from './agents/manager-handler.js';

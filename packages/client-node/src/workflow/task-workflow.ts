import type { ClientSideConnection, PromptResponse, ContentBlock, StopReason } from '@agentclientprotocol/sdk';
import type { Task, AgentConfig } from '@agentdispatch/shared';
import type { DispatchAcpClient } from '../acp/dispatch-acp-client.js';

export interface WorkflowContext {
  connection: ClientSideConnection;
  sessionId: string;
  task: Task;
  agentConfig: AgentConfig;
  outputDir: string;
  inputDir?: string;
  acpClient: DispatchAcpClient;
  scanOutputDir: () => Promise<string[]>;
  log: (msg: string) => void;
  reportProgress: (message: string) => void;
}

export type PassDecision = 'continue' | 'done';

export interface WorkflowPass {
  readonly name: string;
  shouldRun(ctx: WorkflowContext, previousResult?: PromptResponse): boolean;
  buildPrompt(ctx: WorkflowContext): ContentBlock[];
  afterPrompt?(ctx: WorkflowContext, result: PromptResponse): Promise<PassDecision>;
}

export interface WorkflowResult {
  finalStopReason: StopReason;
  passesExecuted: string[];
  hasArtifacts: boolean;
}

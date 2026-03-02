import type { Task, AgentConfig } from '@agentdispatch/shared';
import type { AcpSessionContext, AcpPass, AcpRunResult, PassDecision } from '@agentdispatch/acp';
import type { DispatchAcpClient } from '../acp/dispatch-acp-client.js';

export interface WorkflowContext extends AcpSessionContext {
  task: Task;
  agentConfig: AgentConfig;
  outputDir: string;
  inputDir?: string;
  acpClient: DispatchAcpClient;
  scanOutputDir: () => Promise<string[]>;
  reportProgress: (message: string) => void;
}

export type WorkflowPass = AcpPass<WorkflowContext>;

export interface WorkflowResult extends AcpRunResult {
  hasArtifacts: boolean;
}

export type { PassDecision };

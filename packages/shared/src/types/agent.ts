export type AgentType = 'manager' | 'worker';

export type AgentStatus = 'idle' | 'busy' | 'offline' | 'error';

export interface AgentInfo {
  id: string;
  groupId?: string;
  type: AgentType;
  status: AgentStatus;
  currentTaskId?: string;
  capabilities: string[];
}

export interface AgentRegistration {
  id: string;
  groupId?: string;
  type: AgentType;
  command: string;
  workDir: string;
  capabilities?: string[];
  autoClaimTags?: string[];
  maxConcurrency?: number;
  presetPrompt?: string;
  allowMultiProcess?: boolean;
}

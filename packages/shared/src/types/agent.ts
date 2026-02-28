export type AgentType = 'manager' | 'worker';

export type AgentStatus = 'idle' | 'busy' | 'offline' | 'error';

export interface AgentInfo {
  id: string;
  type: AgentType;
  status: AgentStatus;
  currentTaskId?: string;
  capabilities: string[];
}

export interface AgentRegistration {
  id: string;
  type: AgentType;
  command: string;
  workDir: string;
  capabilities?: string[];
  autoClaimTags?: string[];
  allowMultiProcess?: boolean;
}

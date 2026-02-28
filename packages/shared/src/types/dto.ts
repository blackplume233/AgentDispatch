import type { TaskPriority } from './task.js';
import type { AgentRegistration } from './agent.js';
import type { AgentInfo } from './agent.js';
import type { DispatchMode } from './client.js';

export interface CreateTaskDTO {
  title: string;
  description?: string;
  tags: string[];
  priority?: TaskPriority;
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string;
  tags?: string[];
  priority?: TaskPriority;
  metadata?: Record<string, unknown>;
}

export interface ClaimTaskDTO {
  clientId: string;
  agentId: string;
}

export interface ReleaseTaskDTO {
  clientId: string;
  reason?: string;
}

export interface CompleteTaskDTO {
  clientId: string;
  agentId: string;
  summary?: string;
}

export interface CancelTaskDTO {
  reason?: string;
}

export interface ProgressDTO {
  clientId: string;
  agentId: string;
  progress: number;
  message?: string;
  logs?: string[];
}

export interface RegisterClientDTO {
  name: string;
  host: string;
  tags?: string[];
  dispatchMode: DispatchMode;
  agents: AgentRegistration[];
}

export interface HeartbeatDTO {
  agents?: AgentInfo[];
}

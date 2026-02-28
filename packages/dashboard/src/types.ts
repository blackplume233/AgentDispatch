export type TaskStatus = 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ClientStatus = 'online' | 'offline' | 'busy';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  tags: string[];
  priority: TaskPriority;
  progress?: number;
  progressMessage?: string;
  claimedBy?: { clientId: string; agentId: string };
  artifacts?: {
    zipFile: string;
    zipSizeBytes: number;
    zipHash: string;
    resultJson: {
      taskId: string;
      success: boolean;
      summary: string;
      outputs: Array<{ name: string; type: string; path: string; description?: string }>;
    };
    uploadedAt: string;
  };
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  completedAt?: string;
}

export interface AgentInfo {
  id: string;
  type: 'manager' | 'worker';
  status: 'idle' | 'busy' | 'offline' | 'error';
  currentTaskId?: string;
  capabilities: string[];
}

export interface Client {
  id: string;
  name: string;
  host: string;
  status: ClientStatus;
  tags: string[];
  dispatchMode: 'manager' | 'tag-auto' | 'hybrid';
  agents: AgentInfo[];
  lastHeartbeat: string;
  registeredAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  tags: string[];
  priority?: TaskPriority;
}

export type TaskStatus = 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TaskOutput {
  name: string;
  type: string;
  path: string;
  description?: string;
}

export interface TaskResultJson {
  taskId: string;
  success: boolean;
  summary: string;
  outputs: TaskOutput[];
  errors?: string[];
  metrics?: Record<string, number>;
}

export interface TaskArtifacts {
  zipFile: string;
  zipSizeBytes: number;
  zipHash: string;
  resultJson: TaskResultJson;
  uploadedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  tags: string[];
  priority: TaskPriority;
  progress?: number;
  progressMessage?: string;
  claimedBy?: {
    clientId: string;
    agentId: string;
  };
  artifacts?: TaskArtifacts;
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  completedAt?: string;
}

export const VALID_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['claimed', 'cancelled'],
  claimed: ['in_progress', 'pending', 'cancelled'],
  in_progress: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: ['pending'],
  cancelled: [],
};

export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TASK_TRANSITIONS[from].includes(to);
}

export type TaskStatus =
  | 'pending'
  | 'claimed'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ClientStatus = 'online' | 'offline' | 'busy';

export interface TaskAttachment {
  filename: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
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
  claimedBy?: { clientId: string; agentId: string };
  attachments?: TaskAttachment[];
  artifacts?: {
    zipFile: string;
    zipSizeBytes: number;
    zipHash: string;
    resultJson: {
      taskId: string;
      success: boolean;
      summary: string;
      outputs: Array<{ name: string; type: string; path: string; description?: string }>;
      errors?: string[];
      metrics?: Record<string, number>;
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
  groupId?: string;
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

export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  tags: string[];
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archived: true;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  tags: string[];
  priority?: TaskPriority;
}

// --- Interaction Logs ---

export type InteractionStepType =
  | 'prompt'
  | 'thinking'
  | 'text'
  | 'tool_call'
  | 'tool_call_update'
  | 'permission'
  | 'fs_read'
  | 'fs_write'
  | 'terminal'
  | 'plan'
  | 'error'
  | 'system';

export interface InteractionLogEntry {
  id: string;
  timestamp: string;
  type: InteractionStepType;
  content: string;
  raw?: Record<string, unknown>;
  metadata?: {
    toolCallId?: string;
    toolName?: string;
    toolKind?: string;
    status?: string;
    filePath?: string;
    sessionId?: string;
    stopReason?: string;
  };
}

// --- Client Logs ---

export interface ClientLogEntry {
  id: string;
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  event: string;
  message: string;
  context?: {
    taskId?: string;
    agentId?: string;
    [key: string]: unknown;
  };
}

// --- Artifact Files ---

export interface ArtifactFileEntry {
  path: string;
  size: number;
  isText: boolean;
}

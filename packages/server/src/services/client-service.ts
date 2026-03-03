import { v4 as uuidv4 } from 'uuid';
import type { Client, AgentInfo, RegisterClientDTO, HeartbeatDTO, HeartbeatResponse } from '@agentdispatch/shared';
import { ErrorCode, NotFoundError, ConflictError, ValidationError } from '@agentdispatch/shared';
import type { OperationQueue } from '../queue/operation-queue.js';
import type { ClientStore } from '../store/client-store.js';
import type { TaskService } from './task-service.js';
import type { Logger } from '../utils/logger.js';

export class ClientService {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private taskService: TaskService | null = null;

  constructor(
    private store: ClientStore,
    private queue: OperationQueue,
    private logger: Logger,
    private heartbeatTimeout: number = 60000,
    private checkInterval: number = 15000,
  ) {}

  setTaskService(taskService: TaskService): void {
    this.taskService = taskService;
  }

  startHeartbeatCheck(): void {
    this.heartbeatTimer = setInterval(() => {
      void this.checkHeartbeats();
    }, this.checkInterval);
  }

  stopHeartbeatCheck(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async register(dto: RegisterClientDTO): Promise<Client> {
    if (!dto.name || typeof dto.name !== 'string') {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        'name is required and must be a string',
      );
    }
    if (!dto.host || typeof dto.host !== 'string') {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        'host is required and must be a string',
      );
    }
    if (!Array.isArray(dto.agents)) {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        'agents is required and must be an array',
      );
    }

    const VALID_DISPATCH_MODES = ['manager', 'tag-auto', 'hybrid'] as const;
    if (
      !dto.dispatchMode ||
      !VALID_DISPATCH_MODES.includes(dto.dispatchMode as (typeof VALID_DISPATCH_MODES)[number])
    ) {
      throw new ValidationError(
        ErrorCode.VALIDATION_ERROR,
        `dispatchMode must be one of: ${VALID_DISPATCH_MODES.join(', ')}`,
      );
    }

    const existing = await this.findByName(dto.name);
    if (existing) {
      // Allow a restarted ClientNode to re-register under the same name if its
      // previous record was left in offline state (stale heartbeat timeout).
      // An online client with the same name is a genuine conflict and still rejected.
      if (existing.status === 'offline') {
        await this.queue.enqueue({
          type: 'client.replace_offline',
          execute: async () => {
            await this.store.delete(existing.id);
          },
        });
        this.logger.info('Replaced offline client with same name', {
          category: 'client',
          event: 'client.replaced_offline',
          context: { oldId: existing.id, name: dto.name },
        });
      } else {
        throw new ConflictError(
          ErrorCode.CLIENT_ALREADY_REGISTERED,
          `Client with name "${dto.name}" already registered`,
        );
      }
    }

    const now = new Date().toISOString();
    const client: Client = {
      id: uuidv4(),
      name: dto.name,
      host: dto.host,
      status: 'online',
      tags: dto.tags ?? [],
      dispatchMode: dto.dispatchMode,
      agents: dto.agents.map((a) => ({
        id: a.id,
        groupId: (a as typeof a & { groupId?: string }).groupId,
        type: a.type,
        status: 'idle' as const,
        capabilities: a.capabilities ?? [],
      })),
      lastHeartbeat: now,
      registeredAt: now,
    };

    await this.queue.enqueue({
      type: 'client.register',
      execute: async () => {
        await this.store.save(client);
      },
    });

    this.logger.info('Client registered', {
      category: 'client',
      event: 'client.registered',
      context: { clientId: client.id, name: client.name },
    });
    return client;
  }

  async unregister(clientId: string): Promise<void> {
    const client = await this.store.get(clientId);
    if (!client) {
      throw new NotFoundError(ErrorCode.CLIENT_NOT_FOUND, `Client ${clientId} not found`);
    }

    await this.queue.enqueue({
      type: 'client.unregister',
      execute: async () => {
        await this.store.delete(clientId);
      },
    });

    this.logger.info('Client unregistered', {
      category: 'client',
      event: 'client.unregistered',
      context: { clientId },
    });
  }

  async getClient(clientId: string): Promise<Client> {
    const client = await this.store.get(clientId);
    if (!client) {
      throw new NotFoundError(ErrorCode.CLIENT_NOT_FOUND, `Client ${clientId} not found`);
    }
    return client;
  }

  async listClients(): Promise<Client[]> {
    return this.store.list();
  }

  async heartbeat(clientId: string, dto?: HeartbeatDTO): Promise<HeartbeatResponse> {
    const client = await this.getClient(clientId);
    const updated: Client = {
      ...client,
      status: 'online',
      lastHeartbeat: new Date().toISOString(),
      agents: dto?.agents ?? client.agents,
    };

    await this.queue.enqueue({
      type: 'client.heartbeat',
      execute: async () => {
        await this.store.save(updated);
      },
    });

    // Check if any busy agents are running tasks that have since been cancelled on the server
    const cancelTasks: string[] = [];
    if (this.taskService && dto?.agents) {
      for (const agent of dto.agents) {
        if (agent.status === 'busy' && agent.currentTaskId) {
          try {
            const task = await this.taskService.getTask(agent.currentTaskId);
            if (task.status === 'cancelled') {
              cancelTasks.push(agent.currentTaskId);
              this.logger.warn('Agent is running a cancelled task; instructing client to stop', {
                category: 'task',
                event: 'task.cancel_instructed',
                context: { taskId: agent.currentTaskId, clientId, agentId: agent.id },
              });
            }
          } catch {
            // Task not found — also tell client to stop (task may have been deleted)
            cancelTasks.push(agent.currentTaskId);
          }
        }
      }
    }

    return cancelTasks.length > 0 ? { cancelTasks } : {};
  }

  async updateAgents(clientId: string, agents: AgentInfo[]): Promise<Client> {
    const client = await this.getClient(clientId);
    const updated: Client = {
      ...client,
      agents,
    };

    await this.queue.enqueue({
      type: 'client.updateAgents',
      execute: async () => {
        await this.store.save(updated);
      },
    });

    return updated;
  }

  private async findByName(name: string): Promise<Client | null> {
    const clients = await this.store.list();
    return clients.find((c) => c.name === name) ?? null;
  }

  private async checkHeartbeats(): Promise<void> {
    const clients = await this.store.list();
    const now = Date.now();
    const knownClientIds = new Set(clients.map((c) => c.id));
    const offlineClientIds: string[] = [];
    const onlineClients: Client[] = [];

    for (const client of clients) {
      if (client.status === 'offline') {
        offlineClientIds.push(client.id);
        continue;
      }
      const lastBeat = new Date(client.lastHeartbeat).getTime();
      if (now - lastBeat > this.heartbeatTimeout) {
        const updated: Client = { ...client, status: 'offline' };
        await this.queue.enqueue({
          type: 'client.timeout',
          execute: async () => {
            await this.store.save(updated);
          },
        });
        this.logger.warn('Client heartbeat timeout', {
          category: 'client',
          event: 'client.timeout',
          context: { clientId: client.id, name: client.name },
        });
        offlineClientIds.push(client.id);
      } else {
        onlineClients.push(client);
      }
    }

    if (!this.taskService) return;

    const tasks = await this.taskService.listTasks();
    const activeTasks = tasks.filter(
      (t) => (t.status === 'claimed' || t.status === 'in_progress') && t.claimedBy?.clientId,
    );

    await this.releaseOrphanedTasks(activeTasks, offlineClientIds, knownClientIds);
    await this.crossValidateOnlineClients(activeTasks, onlineClients, now);
  }

  private async releaseOrphanedTasks(
    activeTasks: import('@agentdispatch/shared').Task[],
    offlineClientIds: string[],
    knownClientIds: Set<string>,
  ): Promise<void> {
    if (!this.taskService) return;

    const offlineSet = new Set(offlineClientIds);

    const orphanedTasks = activeTasks.filter((t) => {
      const claimClientId = t.claimedBy?.clientId;
      if (!claimClientId) return false;
      return offlineSet.has(claimClientId) || !knownClientIds.has(claimClientId);
    });

    // Track which agents were successfully released so their in-memory busy
    // status can be reset after the loop — prevents stale busy state persisting
    // on the client record when the client eventually comes back online.
    const releasedByClient = new Map<string, string[]>();

    for (const task of orphanedTasks) {
      const clientId = task.claimedBy?.clientId ?? '';
      const reason = knownClientIds.has(clientId)
        ? 'Worker offline (heartbeat timeout)'
        : 'Claimed by deleted/unknown client';
      try {
        await this.taskService.releaseTask(task.id, { clientId, reason });
        this.logger.info('Released orphaned task', {
          category: 'task',
          event: 'task.released.auto',
          context: { taskId: task.id, clientId, reason },
        });
        const agentId = task.claimedBy?.agentId;
        if (agentId) {
          const list = releasedByClient.get(clientId) ?? [];
          list.push(agentId);
          releasedByClient.set(clientId, list);
        }
      } catch {
        this.logger.warn('Failed to release orphaned task', {
          category: 'task',
          event: 'task.release.failed',
          context: { taskId: task.id, clientId },
        });
      }
    }

    await this.cleanupAgentStateAfterRelease(releasedByClient);
  }

  // Resets agents that were holding orphaned tasks back to idle so the client
  // record reflects reality after releaseOrphanedTasks() completes.
  // Only writes to the store when at least one agent actually needs updating.
  private async cleanupAgentStateAfterRelease(
    releasedByClient: Map<string, string[]>,
  ): Promise<void> {
    for (const [clientId, agentIds] of releasedByClient) {
      try {
        const client = await this.store.get(clientId);
        if (!client) continue;

        const agentIdSet = new Set(agentIds);
        let needsUpdate = false;
        const updatedAgents = client.agents.map((agent) => {
          if (agentIdSet.has(agent.id) && (agent.status === 'busy' || agent.currentTaskId)) {
            needsUpdate = true;
            return { ...agent, status: 'idle' as const, currentTaskId: undefined };
          }
          return agent;
        });

        if (needsUpdate) {
          const updated: Client = { ...client, agents: updatedAgents };
          await this.queue.enqueue({
            type: 'client.cleanup_agents',
            execute: async () => {
              await this.store.save(updated);
            },
          });
          this.logger.info('Cleaned up agent state after orphan task release', {
            category: 'client',
            event: 'agent.state_cleaned',
            context: { clientId, agentIds },
          });
        }
      } catch {
        this.logger.warn('Failed to clean up agent state', {
          category: 'client',
          event: 'agent.cleanup_failed',
          context: { clientId },
        });
      }
    }
  }

  private async crossValidateOnlineClients(
    activeTasks: import('@agentdispatch/shared').Task[],
    onlineClients: Client[],
    now: number,
  ): Promise<void> {
    if (!this.taskService || onlineClients.length === 0) return;

    const gracePeriod = this.heartbeatTimeout * 2;

    const clientAgentMap = new Map<string, Map<string, string | undefined>>();
    for (const client of onlineClients) {
      const agentMap = new Map<string, string | undefined>();
      for (const agent of client.agents) {
        agentMap.set(agent.id, agent.currentTaskId);
      }
      clientAgentMap.set(client.id, agentMap);
    }

    // Validate claimed/in_progress tasks against what agents are actually reporting
    if (activeTasks.length > 0) {
      for (const task of activeTasks) {
        const clientId = task.claimedBy?.clientId;
        const agentId = task.claimedBy?.agentId;
        if (!clientId || !agentId) continue;

        const agentMap = clientAgentMap.get(clientId);
        if (!agentMap) continue;

        const claimedTime = task.claimedAt ? new Date(task.claimedAt).getTime() : 0;
        if (now - claimedTime < gracePeriod) continue;

        const reportedTaskId = agentMap.get(agentId);
        if (reportedTaskId === task.id) continue;

        try {
          const reason = `Heartbeat cross-validation: agent ${agentId} reports ${reportedTaskId ? `task ${reportedTaskId.slice(0, 8)}` : 'idle'}, expected task ${task.id.slice(0, 8)}`;
          await this.taskService.releaseTask(task.id, { clientId, reason });
          this.logger.warn('Released stale task via cross-validation', {
            category: 'task',
            event: 'task.released.cross_validation',
            context: {
              taskId: task.id,
              clientId,
              agentId,
              reportedTaskId: reportedTaskId ?? null,
            },
          });
        } catch {
          this.logger.warn('Failed to release stale task via cross-validation', {
            category: 'task',
            event: 'task.release.cross_validation_failed',
            context: { taskId: task.id, clientId, agentId },
          });
        }
      }
    }

    // Detect agents still reporting a cancelled task (cancel instruction delivered via heartbeat response,
    // but log here so operators can observe stuck clients)
    for (const client of onlineClients) {
      for (const agent of client.agents) {
        if (agent.status !== 'busy' || !agent.currentTaskId) continue;
        try {
          const task = await this.taskService.getTask(agent.currentTaskId);
          if (task.status === 'cancelled') {
            this.logger.warn('Agent still reporting cancelled task after cancel instruction', {
              category: 'task',
              event: 'task.cancel_stale_agent',
              context: { taskId: agent.currentTaskId, clientId: client.id, agentId: agent.id },
            });
          }
        } catch {
          // Task not found is expected once cleaned up; ignore
        }
      }
    }
  }
}

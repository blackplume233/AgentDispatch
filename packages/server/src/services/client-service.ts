import { v4 as uuidv4 } from 'uuid';
import type { Client, AgentInfo, RegisterClientDTO, HeartbeatDTO } from '@agentdispatch/shared';
import { ErrorCode, NotFoundError, ConflictError } from '@agentdispatch/shared';
import type { OperationQueue } from '../queue/operation-queue.js';
import type { ClientStore } from '../store/client-store.js';
import type { Logger } from '../utils/logger.js';

export class ClientService {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: ClientStore,
    private queue: OperationQueue,
    private logger: Logger,
    private heartbeatTimeout: number = 60000,
    private checkInterval: number = 15000,
  ) {}

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
    const existing = await this.findByName(dto.name);
    if (existing) {
      throw new ConflictError(
        ErrorCode.CLIENT_ALREADY_REGISTERED,
        `Client with name "${dto.name}" already registered`,
      );
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

  async heartbeat(clientId: string, dto: HeartbeatDTO): Promise<void> {
    const client = await this.getClient(clientId);
    const updated: Client = {
      ...client,
      status: 'online',
      lastHeartbeat: new Date().toISOString(),
      agents: dto.agents ?? client.agents,
    };

    await this.queue.enqueue({
      type: 'client.heartbeat',
      execute: async () => {
        await this.store.save(updated);
      },
    });
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

    for (const client of clients) {
      if (client.status === 'offline') continue;
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
      }
    }
  }
}

import type { FastifyInstance } from 'fastify';
import type { ClientService } from '../services/client-service.js';
import type { LogStore } from '../store/log-store.js';
import type { RegisterClientDTO, HeartbeatDTO, AgentInfo, AppendClientLogsDTO } from '@agentdispatch/shared';

export function registerClientRoutes(app: FastifyInstance, clientService: ClientService, logStore: LogStore): void {
  app.post<{ Body: RegisterClientDTO }>('/api/v1/clients/register', async (request, reply) => {
    const client = await clientService.register(request.body);
    return reply.code(201).send(client);
  });

  app.get('/api/v1/clients', async () => {
    return clientService.listClients();
  });

  app.get<{ Params: { id: string } }>('/api/v1/clients/:id', async (request) => {
    return clientService.getClient(request.params.id);
  });

  app.delete<{ Params: { id: string } }>('/api/v1/clients/:id', async (request, reply) => {
    await clientService.unregister(request.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: HeartbeatDTO }>(
    '/api/v1/clients/:id/heartbeat',
    async (request, reply) => {
      await clientService.heartbeat(request.params.id, request.body);
      return reply.code(204).send();
    },
  );

  app.patch<{ Params: { id: string }; Body: AgentInfo[] }>('/api/v1/clients/:id/agents', async (request) => {
    return clientService.updateAgents(request.params.id, request.body);
  });

  // --- Client operational logs ---

  app.post<{ Params: { id: string }; Body: AppendClientLogsDTO }>(
    '/api/v1/clients/:id/logs',
    async (request, reply) => {
      await clientService.getClient(request.params.id);
      await logStore.appendClientLogs(request.params.id, request.body.entries);
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    '/api/v1/clients/:id/logs',
    async (request) => {
      await clientService.getClient(request.params.id);
      return logStore.getClientLogs(request.params.id, request.query.after);
    },
  );
}

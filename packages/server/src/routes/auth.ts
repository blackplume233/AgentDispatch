import type { FastifyInstance } from 'fastify';
import type { AuthManager } from '../middleware/auth.js';

export function registerAuthRoutes(app: FastifyInstance, authManager: AuthManager | null): void {
  app.post<{ Body: { username: string; password: string } }>(
    '/api/v1/auth/login',
    async (request, reply) => {
      if (!authManager) {
        return reply.code(404).send({
          error: { code: 'AUTH_DISABLED', message: 'Authentication is not enabled' },
          timestamp: new Date().toISOString(),
        });
      }

      const { username, password } = request.body ?? {};
      if (!username || !password) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'username and password are required' },
          timestamp: new Date().toISOString(),
        });
      }

      const result = authManager.login(username, password);
      if (!result) {
        return reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid username or password' },
          timestamp: new Date().toISOString(),
        });
      }

      return reply.code(200).send(result);
    },
  );

  app.post('/api/v1/auth/logout', async (request, reply) => {
    if (authManager) {
      const header = request.headers.authorization;
      if (header?.startsWith('Bearer ')) {
        authManager.logout(header.slice(7));
      }
    }
    return reply.code(204).send();
  });

  app.get('/api/v1/auth/me', async (request, reply) => {
    if (!authManager) {
      return reply.code(200).send({ source: 'none', authEnabled: false });
    }

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        timestamp: new Date().toISOString(),
      });
    }

    const token = header.slice(7);
    const validation = authManager.validateToken(token);
    if (!validation.valid) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
        timestamp: new Date().toISOString(),
      });
    }

    if (validation.source === 'session') {
      const info = authManager.getSessionInfo(token);
      return reply.code(200).send({
        source: 'session', role: validation.role, username: info?.username, expiresAt: info?.expiresAt,
      });
    }

    return reply.code(200).send({ source: 'static', role: validation.role });
  });
}

import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ServerConfig, AuthTokenRole } from '@agentdispatch/shared';

interface Session {
  token: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

export type { AuthTokenRole };

export interface TokenValidation {
  valid: true;
  source: 'session' | 'static';
  role: AuthTokenRole;
  username?: string;
}

const AUTH_ROLE_KEY = '_authRole';

const PUBLIC_ROUTES: Array<{ method?: string; path: string }> = [
  { path: '/health' },
  { method: 'POST', path: '/api/v1/auth/login' },
];

function isPublicRoute(method: string, url: string): boolean {
  return PUBLIC_ROUTES.some(
    (r) => url.startsWith(r.path) && (!r.method || r.method === method),
  );
}

export function getAuthRole(request: FastifyRequest): AuthTokenRole | null {
  return (request as unknown as Record<string, unknown>)[AUTH_ROLE_KEY] as AuthTokenRole | null;
}

export class AuthManager {
  private sessions = new Map<string, Session>();
  private staticTokens: Map<string, AuthTokenRole>;
  private users: Map<string, string>;
  private sessionTtl: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: ServerConfig['auth']) {
    this.staticTokens = new Map<string, AuthTokenRole>();
    for (const entry of config.tokens) {
      if (typeof entry === 'string') {
        this.staticTokens.set(entry, 'client');
      } else {
        this.staticTokens.set(entry.token, entry.role ?? 'client');
      }
    }
    this.users = new Map(config.users.map((u) => [u.username, u.password]));
    this.sessionTtl = config.sessionTtl;
  }

  start(): void {
    this.cleanupTimer = setInterval(() => this.purgeExpired(), 5 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }

  login(username: string, password: string): { token: string; expiresAt: number } | null {
    const stored = this.users.get(username);
    if (stored === undefined || stored !== password) return null;
    const token = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + this.sessionTtl;
    this.sessions.set(token, { token, username, createdAt: now, expiresAt });
    return { token, expiresAt };
  }

  logout(token: string): boolean {
    return this.sessions.delete(token);
  }

  validateToken(token: string): TokenValidation | { valid: false } {
    const session = this.sessions.get(token);
    if (session) {
      if (Date.now() > session.expiresAt) {
        this.sessions.delete(token);
        return { valid: false };
      }
      return { valid: true, source: 'session', role: 'admin', username: session.username };
    }
    const staticRole = this.staticTokens.get(token);
    if (staticRole !== undefined) {
      return { valid: true, source: 'static', role: staticRole };
    }
    return { valid: false };
  }

  getSessionInfo(token: string): { username: string; expiresAt: number } | null {
    const session = this.sessions.get(token);
    if (!session || Date.now() > session.expiresAt) return null;
    return { username: session.username, expiresAt: session.expiresAt };
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, s] of this.sessions) {
      if (now > s.expiresAt) this.sessions.delete(key);
    }
  }
}

export function registerAuthHook(app: FastifyInstance, authManager: AuthManager): void {
  app.addHook('onRequest', async (request, reply) => {
    if (isPublicRoute(request.method, request.url)) return;

    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
        timestamp: new Date().toISOString(),
      });
    }

    const token = header.slice(7);
    const result = authManager.validateToken(token);
    if (!result.valid) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
        timestamp: new Date().toISOString(),
      });
    }

    (request as unknown as Record<string, unknown>)[AUTH_ROLE_KEY] = result.role;
  });
}

export function requireRole(...allowed: AuthTokenRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = getAuthRole(request);
    if (role && !allowed.includes(role)) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: `Role '${role}' is not allowed for this operation` },
        timestamp: new Date().toISOString(),
      });
    }
  };
}

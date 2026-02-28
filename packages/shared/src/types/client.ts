import type { AgentInfo } from './agent.js';

export type ClientStatus = 'online' | 'offline' | 'busy';

export type DispatchMode = 'manager' | 'tag-auto' | 'hybrid';

export interface Client {
  id: string;
  name: string;
  host: string;
  status: ClientStatus;
  tags: string[];
  dispatchMode: DispatchMode;
  agents: AgentInfo[];
  lastHeartbeat: string;
  registeredAt: string;
}

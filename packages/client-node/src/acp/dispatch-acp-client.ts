import type { AcpSessionUpdate, PermissionRequest } from './types.js';
import type { AgentConfig } from '@agentdispatch/shared';

export type PermissionPolicy = 'auto-allow' | 'auto-deny' | 'prompt';

export class DispatchAcpClient {
  private agentConfig: AgentConfig;
  private policy: PermissionPolicy;
  private sessionUpdates: AcpSessionUpdate[] = [];

  constructor(agentConfig: AgentConfig) {
    this.agentConfig = agentConfig;
    this.policy = agentConfig.permissionPolicy ?? 'auto-allow';
  }

  handleSessionUpdate(update: AcpSessionUpdate): void {
    this.sessionUpdates.push(update);
  }

  handlePermissionRequest(request: PermissionRequest): {
    outcome: string;
    optionIndex: number;
  } {
    switch (this.policy) {
      case 'auto-allow': {
        const idx = request.options.findIndex((o) => o.kind === 'allow_once');
        return { outcome: 'allow', optionIndex: idx >= 0 ? idx : 0 };
      }
      case 'auto-deny': {
        const idx = request.options.findIndex((o) => o.kind === 'reject_once');
        return { outcome: 'deny', optionIndex: idx >= 0 ? idx : 0 };
      }
      case 'prompt':
      default: {
        const idx = request.options.findIndex((o) => o.kind === 'allow_once');
        return { outcome: 'allow', optionIndex: idx >= 0 ? idx : 0 };
      }
    }
  }

  getWorkDir(): string {
    return this.agentConfig.workDir;
  }

  getSessionUpdates(): AcpSessionUpdate[] {
    return this.sessionUpdates;
  }
}

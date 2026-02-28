import type { Task, AgentInfo, ClientConfig } from '@agentdispatch/shared';
import { TagMatcher } from './tag-matcher.js';

export type DispatchDecision =
  | { action: 'dispatch'; taskId: string; agentId: string; rule?: unknown }
  | { action: 'skip'; taskId: string; reason: string }
  | { action: 'queue-local'; taskId: string }
  | { action: 'consult-manager'; taskId: string };

export class Dispatcher {
  private mode: ClientConfig['dispatchMode'];
  private tagMatcher: TagMatcher;
  private fallbackAction: 'skip' | 'queue-local';
  private managerAvailable: boolean;

  constructor(config: ClientConfig) {
    this.mode = config.dispatchMode;
    this.tagMatcher = new TagMatcher(config.autoDispatch.rules);
    this.fallbackAction = config.autoDispatch.fallbackAction ?? 'skip';
    this.managerAvailable = false;
  }

  setManagerAvailable(available: boolean): void {
    this.managerAvailable = available;
  }

  decide(task: Task, agents: AgentInfo[]): DispatchDecision {
    switch (this.mode) {
      case 'tag-auto':
        return this.tagAutoDecision(task, agents);
      case 'manager':
        return this.managerDecision(task);
      case 'hybrid':
        return this.hybridDecision(task, agents);
      default:
        return { action: 'skip', taskId: task.id, reason: `Unknown dispatch mode: ${this.mode}` };
    }
  }

  private tagAutoDecision(task: Task, agents: AgentInfo[]): DispatchDecision {
    const match = this.tagMatcher.match(task, agents);
    if (match) {
      return { action: 'dispatch', taskId: task.id, agentId: match.agentId, rule: match.rule };
    }

    return this.fallbackAction === 'queue-local'
      ? { action: 'queue-local', taskId: task.id }
      : { action: 'skip', taskId: task.id, reason: 'No matching rule' };
  }

  private managerDecision(task: Task): DispatchDecision {
    if (this.managerAvailable) {
      return { action: 'consult-manager', taskId: task.id };
    }
    return { action: 'skip', taskId: task.id, reason: 'Manager not available' };
  }

  private hybridDecision(task: Task, agents: AgentInfo[]): DispatchDecision {
    if (this.managerAvailable) {
      return { action: 'consult-manager', taskId: task.id };
    }
    return this.tagAutoDecision(task, agents);
  }

  getTagMatcher(): TagMatcher {
    return this.tagMatcher;
  }
}

import type { Task, AgentInfo, DispatchRule } from '@agentdispatch/shared';

export interface MatchResult {
  rule: DispatchRule;
  agentId: string;
}

export class TagMatcher {
  private rules: DispatchRule[];

  constructor(rules: DispatchRule[]) {
    this.rules = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  match(task: Task, agents: AgentInfo[]): MatchResult | null {
    for (const rule of this.rules) {
      if (!this.taskMatchesRule(task, rule)) continue;

      const agent = this.findMatchingAgent(rule, agents);
      if (agent) {
        return { rule, agentId: agent.id };
      }
    }
    return null;
  }

  private taskMatchesRule(task: Task, rule: DispatchRule): boolean {
    return rule.taskTags.every((tag) => task.tags.includes(tag));
  }

  private findMatchingAgent(rule: DispatchRule, agents: AgentInfo[]): AgentInfo | null {
    const idle = agents.filter((a) => a.type === 'worker' && a.status === 'idle');

    if (rule.targetAgentId) {
      return (
        idle.find((a) => {
          if (a.id === rule.targetAgentId) return true;
          const groupId = (a as AgentInfo & { groupId?: string }).groupId;
          return groupId === rule.targetAgentId;
        }) ?? null
      );
    }

    if (rule.targetCapabilities && rule.targetCapabilities.length > 0) {
      const caps = rule.targetCapabilities;
      return idle.find((a) => caps.every((cap) => a.capabilities.includes(cap))) ?? null;
    }

    return idle[0] ?? null;
  }

  getRules(): DispatchRule[] {
    return this.rules;
  }
}

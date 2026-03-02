import type { AgentConfig, ManagerConfig, WorkerConfig } from '@agentdispatch/shared';

const DEFAULT_WORKER_CONCURRENCY = 1;
const LEGACY_MULTI_PROCESS_CONCURRENCY = 2;
const MAX_WORKER_CONCURRENCY = 16;

export interface ManagerRuntimeConfig extends ManagerConfig {
  type: 'manager';
  baseId: string;
}

export interface WorkerRuntimeConfig extends WorkerConfig {
  type: 'worker';
  baseId: string;
  groupId: string;
  slotIndex: number;
  maxConcurrency?: number;
  allowMultiProcess?: boolean;
  presetPrompt?: string;
}

export type RuntimeAgentConfig = ManagerRuntimeConfig | WorkerRuntimeConfig;

export function isWorkerRuntimeConfig(config: RuntimeAgentConfig): config is WorkerRuntimeConfig {
  return config.type === 'worker';
}

export function buildRuntimeAgents(agents: AgentConfig[]): RuntimeAgentConfig[] {
  const runtime: RuntimeAgentConfig[] = [];
  for (const agent of agents) {
    if (agent.type === 'worker') {
      runtime.push(...expandWorkerConfig(agent));
      continue;
    }
    runtime.push({
      ...agent,
      baseId: agent.id,
      type: 'manager',
    });
  }
  return runtime;
}

function expandWorkerConfig(worker: WorkerConfig): WorkerRuntimeConfig[] {
  const expandedCount = normalizeConcurrency(worker.maxConcurrency, worker.allowMultiProcess);
  if (expandedCount <= DEFAULT_WORKER_CONCURRENCY) {
    return [
      {
        ...worker,
        type: 'worker',
        baseId: worker.id,
        groupId: worker.id,
        slotIndex: 0,
        maxConcurrency: DEFAULT_WORKER_CONCURRENCY,
      },
    ];
  }

  return Array.from({ length: expandedCount }, (_unused, slotIndex) => ({
    ...worker,
    type: 'worker',
    id: `${worker.id}:${slotIndex}`,
    baseId: worker.id,
    groupId: worker.id,
    slotIndex,
    maxConcurrency: DEFAULT_WORKER_CONCURRENCY,
  }));
}

function normalizeConcurrency(maxConcurrency?: number, allowMultiProcess?: boolean): number {
  const candidate =
    maxConcurrency ??
    (allowMultiProcess ? LEGACY_MULTI_PROCESS_CONCURRENCY : DEFAULT_WORKER_CONCURRENCY);
  if (!Number.isFinite(candidate)) return DEFAULT_WORKER_CONCURRENCY;
  const parsed = Math.trunc(candidate);
  if (parsed < DEFAULT_WORKER_CONCURRENCY) return DEFAULT_WORKER_CONCURRENCY;
  return Math.min(parsed, MAX_WORKER_CONCURRENCY);
}

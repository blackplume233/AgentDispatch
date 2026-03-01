import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ClientConfig } from '@agentdispatch/shared';

function getDefaultIpcPath(name: string): string {
  if (os.platform() === 'win32') {
    return `\\\\.\\pipe\\dispatch-${name}`;
  }
  const runtimeDir =
    process.env['XDG_RUNTIME_DIR'] ??
    path.join(os.tmpdir(), `dispatch-${process.getuid?.() ?? 'default'}`);
  return path.join(runtimeDir, `dispatch-${name}.sock`);
}

const DEFAULT_CONFIG: ClientConfig = {
  name: 'default-node',
  serverUrl: 'http://localhost:9800',
  tags: [],
  dispatchMode: 'tag-auto',
  polling: { interval: 10000 },
  ipc: { path: '' },
  heartbeat: { interval: 30000 },
  autoDispatch: { rules: [], fallbackAction: 'skip' },
  logging: {
    dir: '',
    rotateDaily: true,
    retainDays: 30,
    httpLog: true,
    auditLog: true,
    agentLog: true,
  },
  agents: [],
};

export function loadClientConfig(configPath?: string): ClientConfig {
  let fileConfig: Partial<ClientConfig> = {};
  const resolvedPath = configPath ?? 'client.config.json';
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    fileConfig = JSON.parse(raw) as Partial<ClientConfig>;
  } catch {
    /* use defaults */
  }

  const name = fileConfig.name ?? DEFAULT_CONFIG.name;

  return {
    name,
    serverUrl: fileConfig.serverUrl ?? DEFAULT_CONFIG.serverUrl,
    token: fileConfig.token,
    tags: fileConfig.tags ?? DEFAULT_CONFIG.tags,
    dispatchMode: fileConfig.dispatchMode ?? DEFAULT_CONFIG.dispatchMode,
    polling: { interval: fileConfig.polling?.interval ?? DEFAULT_CONFIG.polling.interval },
    ipc: { path: fileConfig.ipc?.path || getDefaultIpcPath(name) },
    heartbeat: { interval: fileConfig.heartbeat?.interval ?? DEFAULT_CONFIG.heartbeat.interval },
    autoDispatch: {
      rules: fileConfig.autoDispatch?.rules ?? DEFAULT_CONFIG.autoDispatch.rules,
      fallbackAction:
        fileConfig.autoDispatch?.fallbackAction ?? DEFAULT_CONFIG.autoDispatch.fallbackAction,
    },
    logging: {
      dir: fileConfig.logging?.dir || path.join(process.cwd(), 'logs'),
      rotateDaily: fileConfig.logging?.rotateDaily ?? DEFAULT_CONFIG.logging.rotateDaily,
      retainDays: fileConfig.logging?.retainDays ?? DEFAULT_CONFIG.logging.retainDays,
      httpLog: fileConfig.logging?.httpLog ?? DEFAULT_CONFIG.logging.httpLog,
      auditLog: fileConfig.logging?.auditLog ?? DEFAULT_CONFIG.logging.auditLog,
      agentLog: fileConfig.logging?.agentLog ?? DEFAULT_CONFIG.logging.agentLog,
    },
    agents: fileConfig.agents ?? DEFAULT_CONFIG.agents,
  };
}

export { getDefaultIpcPath };

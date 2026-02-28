/**
 * QA Environment — Real ClientNode Launcher (ACP Mode)
 *
 * Starts a real ClientNode with ACP-based agent communication:
 * - Agents communicate ONLY via ACP protocol (stdin/stdout ndjson)
 * - ClientNode records all interactions and uploads logs to Server
 * - No direct Worker-to-Server communication
 *
 * Agent types:
 * - claude-agent-acp: Claude Agent via ACP adapter (requires ANTHROPIC_API_KEY)
 *   Install: npm install -g @zed-industries/claude-agent-acp
 * - opencode acp: OpenCode with native ACP support (future)
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClientNode } from '../../packages/client-node/dist/index.js';
import type { ClientConfig, AgentConfig } from '../../packages/shared/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SERVER_URL = process.env['SERVER_URL'] ?? 'http://localhost:9800';
const NODE_NAME = process.env['NODE_NAME'] ?? 'qa-real-node';
const POLL_INTERVAL = Number(process.env['POLL_INTERVAL'] ?? '5000');
const HEARTBEAT_INTERVAL = Number(process.env['HEARTBEAT_INTERVAL'] ?? '10000');

const WORK_BASE = path.join(os.tmpdir(), 'agentdispatch-qa');
fs.mkdirSync(WORK_BASE, { recursive: true });

const agents: AgentConfig[] = [
  {
    id: 'worker-claude',
    type: 'worker',
    command: 'claude-agent-acp',
    args: [],
    workDir: (() => { const d = path.join(WORK_BASE, 'claude'); fs.mkdirSync(d, { recursive: true }); return d; })(),
    capabilities: ['code', 'docs', 'analysis'],
    autoClaimTags: ['code'],
    permissionPolicy: 'auto-allow',
    acpCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
  },
  // Uncomment to add OpenCode (native ACP support):
  // {
  //   id: 'worker-opencode',
  //   type: 'worker',
  //   command: 'opencode',
  //   args: ['acp'],
  //   workDir: (() => { const d = path.join(WORK_BASE, 'opencode'); fs.mkdirSync(d, { recursive: true }); return d; })(),
  //   capabilities: ['code', 'docs'],
  //   autoClaimTags: ['docs'],
  //   permissionPolicy: 'auto-allow',
  //   acpCapabilities: {
  //     fs: { readTextFile: true, writeTextFile: true },
  //     terminal: true,
  //   },
  // },
];

const ipcPath = os.platform() === 'win32'
  ? `\\\\.\\pipe\\dispatch-${NODE_NAME}`
  : path.join(os.tmpdir(), `dispatch-qa-${process.getuid?.() ?? 'default'}`, `dispatch-${NODE_NAME}.sock`);

const config: ClientConfig = {
  name: NODE_NAME,
  serverUrl: SERVER_URL,
  tags: agents.flatMap((a) => a.capabilities ?? []),
  dispatchMode: 'tag-auto',
  polling: { interval: POLL_INTERVAL },
  ipc: { path: ipcPath },
  heartbeat: { interval: HEARTBEAT_INTERVAL },
  autoDispatch: {
    rules: [
      ...agents.map((a) => ({
        taskTags: (a.capabilities ?? []).slice(0, 1),
        targetAgentId: a.id,
        targetCapabilities: a.capabilities ?? [],
        priority: 0,
      })),
      { taskTags: [], targetCapabilities: [], priority: -1 },
    ],
    fallbackAction: 'skip' as const,
  },
  logging: {
    dir: path.join(WORK_BASE, 'logs'),
    rotateDaily: true,
    retainDays: 7,
    httpLog: true,
    auditLog: true,
    agentLog: true,
  },
  agents,
};

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

async function main(): Promise<void> {
  log('=== AgentDispatch QA — Real ClientNode ===');
  log(`Server:    ${SERVER_URL}`);
  log(`Node:      ${NODE_NAME}`);
  log(`IPC:       ${ipcPath}`);
  log(`Workers:   ${agents.map((a) => `${a.id}(${(a.capabilities ?? []).join(',')})`).join(', ')}`);
  log(`Poll:      every ${POLL_INTERVAL / 1000}s`);
  log(`Heartbeat: every ${HEARTBEAT_INTERVAL / 1000}s`);
  log(`Work dir:  ${WORK_BASE}`);
  log('');

  const node = new ClientNode(config);

  await node.start();
  log('IPC server started');

  try {
    const client = await node.register();
    log(`Registered! clientId=${client.id}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Registration failed: ${msg}`);
    if (msg.includes('already registered')) {
      log('Continuing anyway — server may already have this node');
    } else {
      process.exit(1);
    }
  }

  log('Ready. Waiting for tasks...\n');

  const shutdown = async (): Promise<void> => {
    log('\nShutting down...');
    try {
      await node.unregister();
    } catch { /* ignore */ }
    await node.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();

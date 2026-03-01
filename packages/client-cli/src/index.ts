import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPCClient } from './ipc/ipc-client.js';
import { registerNodeCommands } from './commands/node.js';
import { registerConfigCommands } from './commands/config.js';
import { registerWorkerCommands } from './commands/worker.js';
import { registerAgentCommands } from './commands/agent.js';
import { registerTaskCommands } from './commands/task.js';

export const VERSION = '0.0.1';

function getDefaultSocketPath(): string {
  if (os.platform() === 'win32') {
    return '\\\\.\\pipe\\dispatch-default-node';
  }
  const runtimeDir =
    process.env['XDG_RUNTIME_DIR'] ??
    path.join(os.tmpdir(), `dispatch-${process.getuid?.() ?? 'default'}`);
  return path.join(runtimeDir, 'dispatch-default-node.sock');
}

const program = new Command();
program
  .name('dispatch')
  .description('AgentDispatch CLI')
  .version(VERSION)
  .option('--ipc <path>', 'IPC socket path', getDefaultSocketPath())
  .option('--token <token>', 'Auth token for IPC commands', process.env['DISPATCH_TOKEN']);

function getClient(): IPCClient {
  const opts = program.opts() as { ipc: string; token?: string };
  return new IPCClient(opts.ipc, 10000, opts.token);
}

registerNodeCommands(program, getClient);
registerConfigCommands(program, getClient);
registerWorkerCommands(program, getClient);
registerAgentCommands(program, getClient);
registerTaskCommands(program, getClient);

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  program.parse();
}

export { IPCClient } from './ipc/ipc-client.js';

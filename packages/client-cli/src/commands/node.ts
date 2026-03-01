import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import type { IPCClient } from '../ipc/ipc-client.js';

function findNodeEntrypoint(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const cliDist = path.dirname(thisFile);
  const packagesDir = path.resolve(cliDist, '..', '..');
  const candidates = [
    path.join(packagesDir, 'client-node', 'dist', 'main.js'),
    path.join(packagesDir, 'client-node', 'dist', 'index.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0] as string;
}

export function registerNodeCommands(program: Command, getClient: () => IPCClient): void {
  program
    .command('start')
    .description('Start a ClientNode process')
    .option('--config <path>', 'Path to client.config.json', 'client.config.json')
    .option('--foreground', 'Run in foreground (default: background)', false)
    .action(async (opts: { config: string; foreground: boolean }) => {
      const configPath = path.resolve(opts.config);
      if (!fs.existsSync(configPath)) {
        console.error(`Config file not found: ${configPath}`);
        process.exit(1);
      }

      const entrypoint = findNodeEntrypoint();
      if (!fs.existsSync(entrypoint)) {
        console.error(`ClientNode not built. Run: pnpm --filter @agentdispatch/client-node build`);
        process.exit(1);
      }

      const env = { ...process.env, DISPATCH_NODE_CONFIG: configPath };

      if (opts.foreground) {
        const child = spawn(process.execPath, [entrypoint], {
          env,
          stdio: 'inherit',
        });
        child.on('exit', (code) => process.exit(code ?? 0));
      } else {
        const child = spawn(process.execPath, [entrypoint], {
          env,
          stdio: 'ignore',
          detached: true,
        });
        child.unref();
        console.log(`ClientNode started (pid: ${child.pid})`);
        console.log(`Config: ${configPath}`);
        console.log('Use "dispatch status" to check node status');
      }
    });

  program
    .command('status')
    .description('Show node status')
    .action(async () => {
      const client = getClient();
      const result = await client.send('node.status');
      console.log(JSON.stringify(result, null, 2));
    });

  program
    .command('register')
    .description('Register node with server')
    .option('--server <url>', 'Server URL')
    .action(async () => {
      const client = getClient();
      const result = await client.send('node.register');
      console.log(JSON.stringify(result, null, 2));
    });

  program
    .command('unregister')
    .description('Unregister node from server')
    .action(async () => {
      const client = getClient();
      await client.send('node.unregister');
      console.log('Unregistered successfully');
    });

  program
    .command('stop')
    .description('Stop the node')
    .action(async () => {
      const client = getClient();
      await client.send('node.stop');
      console.log('Node stopped');
    });
}

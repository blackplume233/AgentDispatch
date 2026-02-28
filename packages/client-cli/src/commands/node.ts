import type { Command } from 'commander';
import type { IPCClient } from '../ipc/ipc-client.js';

export function registerNodeCommands(program: Command, getClient: () => IPCClient): void {
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

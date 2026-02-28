import type { Command } from 'commander';
import type { IPCClient } from '../ipc/ipc-client.js';

export function registerConfigCommands(program: Command, getClient: () => IPCClient): void {
  const configCmd = program.command('config').description('Configuration management');

  configCmd
    .command('show')
    .description('Show current configuration')
    .action(async () => {
      const client = getClient();
      const result = await client.send('config.show');
      console.log(JSON.stringify(result, null, 2));
    });
}

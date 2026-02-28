import type { Command } from 'commander';
import type { IPCClient } from '../ipc/ipc-client.js';

export function registerAgentCommands(program: Command, getClient: () => IPCClient): void {
  const agentCmd = program.command('agent').description('Agent management');

  agentCmd
    .command('add')
    .description('Register a new agent')
    .requiredOption('--type <type>', 'Agent type (manager|worker)')
    .requiredOption('--command <cmd>', 'ACP command')
    .requiredOption('--workdir <dir>', 'Working directory')
    .option('--id <id>', 'Agent ID')
    .option('--tags <tags>', 'Comma-separated tags')
    .action(async (opts: { type: string; command: string; workdir: string; id?: string; tags?: string }) => {
      const client = getClient();
      const result = await client.send('agent.add', {
        id: opts.id,
        type: opts.type,
        command: opts.command,
        workDir: opts.workdir,
        capabilities: opts.tags?.split(',').map((t) => t.trim()),
      });
      console.log(JSON.stringify(result, null, 2));
    });

  agentCmd
    .command('remove <agentId>')
    .description('Remove an agent')
    .action(async (agentId: string) => {
      const client = getClient();
      await client.send('agent.remove', { agentId });
      console.log('Agent removed');
    });

  agentCmd
    .command('list')
    .description('List all agents')
    .action(async () => {
      const client = getClient();
      const result = await client.send('agent.list');
      console.log(JSON.stringify(result, null, 2));
    });

  agentCmd
    .command('status <agentId>')
    .description('Show agent status')
    .action(async (agentId: string) => {
      const client = getClient();
      const result = await client.send('agent.status', { agentId });
      console.log(JSON.stringify(result, null, 2));
    });

  agentCmd
    .command('restart <agentId>')
    .description('Restart an agent')
    .action(async (agentId: string) => {
      const client = getClient();
      await client.send('agent.restart', { agentId });
      console.log('Agent restarted');
    });
}

import type { Command } from 'commander';
import type { IPCClient } from '../ipc/ipc-client.js';

export function registerAgentCommands(program: Command, getClient: () => IPCClient): void {
  const agentCmd = program.command('agent').description('Agent management');

  agentCmd
    .command('add')
    .description('Register a new worker agent at runtime')
    .requiredOption('--type <type>', 'Agent type (manager|worker)')
    .requiredOption('--command <cmd>', 'ACP command to spawn the agent')
    .requiredOption('--workdir <dir>', 'Working directory')
    .option('--id <id>', 'Agent ID (auto-generated if omitted)')
    .option('--tags <tags>', 'Comma-separated capability tags')
    .option('--auto-claim-tags <tags>', 'Comma-separated auto-claim tags')
    .option('--max-concurrency <n>', 'Max concurrent virtual workers', parseInt)
    .action(
      async (opts: {
        type: string;
        command: string;
        workdir: string;
        id?: string;
        tags?: string;
        autoClaimTags?: string;
        maxConcurrency?: number;
      }) => {
        const client = getClient();
        const result = await client.send('agent.add', {
          id: opts.id,
          type: opts.type,
          command: opts.command,
          workDir: opts.workdir,
          capabilities: opts.tags?.split(',').map((t) => t.trim()),
          autoClaimTags: opts.autoClaimTags?.split(',').map((t) => t.trim()),
          maxConcurrency: opts.maxConcurrency,
        });
        console.log(JSON.stringify(result, null, 2));
      },
    );

  agentCmd
    .command('remove <agentId>')
    .description('Remove an agent (and all its virtual workers if grouped)')
    .option('--force', 'Force remove even if busy (cancels running tasks)')
    .action(async (agentId: string, opts: { force?: boolean }) => {
      const client = getClient();
      const result = await client.send('agent.remove', { agentId, force: opts.force ?? false });
      console.log(JSON.stringify(result, null, 2));
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
    .description('Show agent status and config')
    .action(async (agentId: string) => {
      const client = getClient();
      const result = await client.send('agent.status', { agentId });
      console.log(JSON.stringify(result, null, 2));
    });

  agentCmd
    .command('restart <agentId>')
    .description('Restart an agent (stops running process, cancels task if busy)')
    .action(async (agentId: string) => {
      const client = getClient();
      const result = await client.send('agent.restart', { agentId });
      console.log(JSON.stringify(result, null, 2));
    });
}

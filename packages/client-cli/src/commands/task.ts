import type { Command } from 'commander';
import type { IPCClient } from '../ipc/ipc-client.js';

export function registerTaskCommands(program: Command, getClient: () => IPCClient): void {
  const taskCmd = program.command('task').description('Task management');

  taskCmd
    .command('list')
    .description('List local tasks')
    .option('--status <status>', 'Filter by status')
    .action(async () => {
      const client = getClient();
      const result = await client.send('task.list');
      console.log(JSON.stringify(result, null, 2));
    });

  taskCmd
    .command('assign <taskId> <agentId>')
    .description('Manually assign task to agent')
    .action(async (taskId: string, agentId: string) => {
      const client = getClient();
      await client.send('task.assign', { taskId, agentId });
      console.log(`Task ${taskId} assigned to ${agentId}`);
    });

  taskCmd
    .command('release <taskId>')
    .description('Release a task')
    .option('--reason <reason>', 'Release reason')
    .action(async (taskId: string, opts: { reason?: string }) => {
      const client = getClient();
      await client.send('task.release', { taskId, reason: opts.reason });
      console.log(`Task ${taskId} released`);
    });
}

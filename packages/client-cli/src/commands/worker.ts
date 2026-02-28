import type { Command } from 'commander';
import type { IPCClient } from '../ipc/ipc-client.js';

export function registerWorkerCommands(program: Command, getClient: () => IPCClient): void {
  const workerCmd = program.command('worker').description('Worker agent commands');

  workerCmd
    .command('progress <taskId>')
    .description('Report task progress')
    .requiredOption('--percent <number>', 'Progress percentage (0-100)')
    .option('--message <msg>', 'Progress message')
    .action(async (taskId: string, opts: { percent: string; message?: string }) => {
      const client = getClient();
      await client.send('worker.progress', {
        taskId,
        progress: Number(opts.percent),
        message: opts.message,
      });
      console.log(`Progress reported: ${opts.percent}%`);
    });

  workerCmd
    .command('complete <taskId>')
    .description('Complete task with artifacts')
    .requiredOption('--zip <path>', 'Artifact zip path')
    .requiredOption('--result <path>', 'Result JSON path')
    .action(async (taskId: string, opts: { zip: string; result: string }) => {
      const client = getClient();
      await client.send('worker.complete', { taskId, zipPath: opts.zip, resultPath: opts.result });
      console.log('Task completed');
    });

  workerCmd
    .command('fail <taskId>')
    .description('Report task failure')
    .requiredOption('--reason <reason>', 'Failure reason')
    .action(async (taskId: string, opts: { reason: string }) => {
      const client = getClient();
      await client.send('worker.fail', { taskId, reason: opts.reason });
      console.log('Task failure reported');
    });

  workerCmd
    .command('status <taskId>')
    .description('Query task status')
    .action(async (taskId: string) => {
      const client = getClient();
      const result = await client.send('worker.status', { taskId });
      console.log(JSON.stringify(result, null, 2));
    });

  workerCmd
    .command('log <taskId>')
    .description('Append work log')
    .requiredOption('--message <msg>', 'Log message')
    .action(async (taskId: string, opts: { message: string }) => {
      const client = getClient();
      await client.send('worker.log', { taskId, message: opts.message });
      console.log('Log appended');
    });

  workerCmd
    .command('heartbeat <taskId>')
    .description('Send worker heartbeat')
    .action(async (taskId: string) => {
      const client = getClient();
      await client.send('worker.heartbeat', { taskId });
      console.log('Heartbeat sent');
    });
}

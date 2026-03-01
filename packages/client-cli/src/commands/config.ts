import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
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

  configCmd
    .command('set')
    .description('Set a configuration value (dot-notation key)')
    .argument('<key>', 'Configuration key (e.g. polling.interval)')
    .argument('<value>', 'Value to set')
    .option('--config <path>', 'Path to client.config.json', 'client.config.json')
    .action((key: string, value: string, opts: { config: string }) => {
      const configPath = path.resolve(opts.config);
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      } catch {
        console.error(`Cannot read config file: ${configPath}`);
        process.exit(1);
      }

      const parts = key.split('.');
      let target: Record<string, unknown> = config;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i] as string;
        if (typeof target[p] !== 'object' || target[p] === null) {
          target[p] = {};
        }
        target = target[p] as Record<string, unknown>;
      }

      const lastKey = parts[parts.length - 1] as string;
      const parsed = parseValue(value);
      target[lastKey] = parsed;

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      console.log(`Set ${key} = ${JSON.stringify(parsed)}`);
      console.log('Restart the node for changes to take effect.');
    });

  configCmd
    .command('edit')
    .description('Open configuration file in editor')
    .option('--config <path>', 'Path to client.config.json', 'client.config.json')
    .action((opts: { config: string }) => {
      const configPath = path.resolve(opts.config);
      if (!fs.existsSync(configPath)) {
        console.error(`Config file not found: ${configPath}`);
        process.exit(1);
      }

      const editor = process.env['EDITOR'] ?? process.env['VISUAL'] ?? 'vi';
      const child = spawn(editor, [configPath], { stdio: 'inherit' });
      child.on('exit', (code) => {
        if (code === 0) {
          console.log('Config file saved. Restart the node for changes to take effect.');
        }
      });
    });
}

function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

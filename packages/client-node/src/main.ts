import { ClientNode } from './node.js';
import { loadClientConfig } from './config.js';

const configPath = process.env['DISPATCH_NODE_CONFIG'] ?? 'client.config.json';
const config = loadClientConfig(configPath);

const node = new ClientNode(config);

async function main(): Promise<void> {
  await node.start();
  console.log(`[ClientNode] IPC listening at ${config.ipc.path}`);

  await node.register();
  console.log('[ClientNode] Registered with server, polling started');
}

function shutdown(): void {
  console.log('[ClientNode] Shutting down...');
  node.stop().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('[ClientNode] Shutdown error:', err);
    process.exit(1);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[ClientNode] Fatal:', err);
  process.exit(1);
});

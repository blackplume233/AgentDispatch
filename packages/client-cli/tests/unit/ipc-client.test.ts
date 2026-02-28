import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { IPCClient } from '../../src/ipc/ipc-client.js';

function testIpcPath(label: string): string {
  if (os.platform() === 'win32') {
    return `\\\\.\\pipe\\dispatch-test-${label}-${Date.now()}`;
  }
  return path.join(os.tmpdir(), `ipc-${label}-${Date.now()}.sock`);
}

describe('IPCClient', () => {
  let server: net.Server | null = null;
  let socketPath: string;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  it('should send command and receive response', async () => {
    socketPath = testIpcPath('cli');

    await new Promise<void>((resolve) => {
      server = net.createServer((socket) => {
        let buf = '';
        socket.on('data', (data) => {
          buf += data.toString();
          if (buf.includes('\n')) {
            const msg = JSON.parse(buf.split('\n')[0] as string) as { id: string; command: string };
            const response =
              JSON.stringify({
                id: msg.id,
                type: 'response',
                command: msg.command,
                payload: { result: 'ok' },
              }) + '\n';
            socket.write(response);
          }
        });
      });
      (server as net.Server).listen(socketPath, resolve);
    });

    const client = new IPCClient(socketPath);
    const result = await client.send('test.cmd', { data: 'hello' });
    expect(result).toEqual({ result: 'ok' });
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { IPCServer } from '../../src/ipc/ipc-server.js';

describe('IPCServer', () => {
  let server: IPCServer | null = null;
  let socketPath: string;

  afterEach(async () => {
    if (server) await server.stop();
    try {
      fs.unlinkSync(socketPath);
    } catch {
      /* ignore */
    }
  });

  it('should accept connections and handle commands', async () => {
    socketPath = path.join(os.tmpdir(), `ipc-test-${Date.now()}.sock`);
    server = new IPCServer(socketPath, async (command, payload) => {
      if (command === 'test.echo') return { echo: payload };
      throw new Error('unknown');
    });
    await server.start();

    const result = await new Promise<unknown>((resolve, reject) => {
      const client = net.createConnection(socketPath, () => {
        const msg =
          JSON.stringify({
            id: '1',
            type: 'request',
            command: 'test.echo',
            payload: { hello: 'world' },
          }) + '\n';
        client.write(msg);
      });
      let data = '';
      client.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('\n')) {
          client.end();
          resolve(JSON.parse(data.split('\n')[0]!));
        }
      });
      client.on('error', reject);
    });

    expect(result).toEqual({
      id: '1',
      type: 'response',
      command: 'test.echo',
      payload: { echo: { hello: 'world' } },
    });
  });

  it('should return error for failed handlers', async () => {
    socketPath = path.join(os.tmpdir(), `ipc-err-test-${Date.now()}.sock`);
    server = new IPCServer(socketPath, async () => {
      throw new Error('handler failed');
    });
    await server.start();

    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const client = net.createConnection(socketPath, () => {
        const msg =
          JSON.stringify({ id: '2', type: 'request', command: 'fail' }) + '\n';
        client.write(msg);
      });
      let data = '';
      client.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('\n')) {
          client.end();
          resolve(JSON.parse(data.split('\n')[0]!) as Record<string, unknown>);
        }
      });
      client.on('error', reject);
    });

    expect(result['error']).toBeDefined();
  });
});

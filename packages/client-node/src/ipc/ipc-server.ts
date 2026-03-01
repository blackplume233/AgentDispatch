import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { IPCMessage } from '@agentdispatch/shared';

export type IPCHandler = (command: string, payload: unknown, token?: string) => Promise<unknown>;

export class IPCServer {
  private server: net.Server | null = null;
  private socketPath: string;
  private handler: IPCHandler;

  constructor(socketPath: string, handler: IPCHandler) {
    this.socketPath = socketPath;
    this.handler = handler;
  }

  async start(): Promise<void> {
    // Ensure directory exists for Unix sockets
    if (os.platform() !== 'win32') {
      const dir = path.dirname(this.socketPath);
      await fs.promises.mkdir(dir, { recursive: true });
      // Clean up stale socket
      try {
        await fs.promises.unlink(this.socketPath);
      } catch {
        /* ignore */
      }
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let buffer = '';
        socket.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            void this.handleMessage(socket, line);
          }
        });
      });

      this.server.on('error', reject);
      this.server.listen(this.socketPath, () => resolve());
    });
  }

  private async handleMessage(socket: net.Socket, raw: string): Promise<void> {
    let msg: IPCMessage;
    try {
      msg = JSON.parse(raw) as IPCMessage;
    } catch {
      return;
    }

    try {
      const result = await this.handler(msg.command, msg.payload, msg.token);
      const response: IPCMessage = {
        id: msg.id,
        type: 'response',
        command: msg.command,
        payload: result,
      };
      socket.write(JSON.stringify(response) + '\n');
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      const response: IPCMessage = {
        id: msg.id,
        type: 'response',
        command: msg.command,
        error: {
          code: (error as { code?: string }).code ?? 'INTERNAL_ERROR',
          message: error.message,
        },
      };
      socket.write(JSON.stringify(response) + '\n');
    }
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        if (os.platform() !== 'win32') {
          try {
            fs.unlinkSync(this.socketPath);
          } catch {
            /* ignore */
          }
        }
        resolve();
      });
    });
  }

  getPath(): string {
    return this.socketPath;
  }
}

import net from 'node:net';
import type { IPCMessage } from '@agentdispatch/shared';

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class IPCClient {
  private socketPath: string;
  private timeout: number;
  private token?: string;

  constructor(socketPath: string, timeout = 10000, token?: string) {
    this.socketPath = socketPath;
    this.timeout = timeout;
    this.token = token;
  }

  async send(command: string, payload?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const msgId = generateId();
      const socket = net.createConnection(this.socketPath, () => {
        const msg: IPCMessage = { id: msgId, type: 'request', command, payload, token: this.token };
        socket.write(JSON.stringify(msg) + '\n');
      });

      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`IPC timeout after ${this.timeout}ms`));
      }, this.timeout);

      let buffer = '';
      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line) as IPCMessage;
            if (response.id === msgId) {
              clearTimeout(timer);
              socket.end();
              if (response.error) {
                reject(new Error(response.error.message));
              } else {
                resolve(response.payload);
              }
              return;
            }
          } catch {
            /* incomplete JSON, continue buffering */
          }
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`IPC connection failed: ${err.message}`));
      });
    });
  }
}

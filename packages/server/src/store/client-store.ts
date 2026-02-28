import path from 'node:path';
import type { Client } from '@agentdispatch/shared';
import { FileStore } from './file-store.js';

export class ClientStore extends FileStore {
  constructor(dataDir: string) {
    super(path.join(dataDir, 'clients'));
  }

  private filePath(clientId: string): string {
    return path.join(this.baseDir, `${clientId}.json`);
  }

  async save(client: Client): Promise<void> {
    await this.writeJson(this.filePath(client.id), client);
  }

  async get(clientId: string): Promise<Client | null> {
    return this.readJson<Client>(this.filePath(clientId));
  }

  async delete(clientId: string): Promise<boolean> {
    return this.deleteFile(this.filePath(clientId));
  }

  async list(): Promise<Client[]> {
    const files = await this.listFiles(this.baseDir, '.json');
    const clients: Client[] = [];
    for (const file of files) {
      const client = await this.readJson<Client>(path.join(this.baseDir, file));
      if (client) clients.push(client);
    }
    return clients;
  }
}

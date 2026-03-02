import { Readable, Writable } from 'node:stream';
import type { AgentConfig } from '@agentdispatch/shared';
import type { Client as AcpClient, ClientSideConnection } from '@agentclientprotocol/sdk';
import { ClientSideConnection as ClientSideConnectionImpl, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { AgentProcess, type AgentProcessEvents, type AgentProcessEnv } from './agent-process.js';

export interface AcpConnectionHandle {
  connection: ClientSideConnection;
  process: AgentProcess;
  sessionId: string;
}

export interface CreateAcpConnectionOptions {
  agentConfig: AgentConfig;
  acpClient: AcpClient;
  extraEnv?: AgentProcessEnv;
  processEvents: AgentProcessEvents;
  clientInfo?: { name: string; version: string };
}

export async function createAcpConnection(
  opts: CreateAcpConnectionOptions,
): Promise<AcpConnectionHandle> {
  const proc = new AgentProcess(opts.agentConfig, opts.processEvents, opts.extraEnv);
  const { stdin, stdout } = proc.start();

  const output = Writable.toWeb(stdin as import('node:stream').Writable);
  const input = Readable.toWeb(stdout as import('node:stream').Readable);
  const stream = ndJsonStream(
    output as WritableStream<Uint8Array>,
    input as ReadableStream<Uint8Array>,
  );

  const acpClient = opts.acpClient;
  const connection = new ClientSideConnectionImpl(
    (_agent) => acpClient,
    stream,
  );

  const caps = opts.agentConfig.acpCapabilities;
  await connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {
      fs: caps?.fs ? {
        readTextFile: caps.fs.readTextFile,
        writeTextFile: caps.fs.writeTextFile,
      } : undefined,
      terminal: caps?.terminal,
    },
    clientInfo: opts.clientInfo ?? { name: 'AgentDispatch', version: '0.0.1' },
  });

  const session = await connection.newSession({
    cwd: opts.agentConfig.workDir,
    mcpServers: [],
  });

  return { connection, process: proc, sessionId: session.sessionId };
}

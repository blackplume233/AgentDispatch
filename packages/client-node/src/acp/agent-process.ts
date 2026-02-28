import { spawn, type ChildProcess } from 'node:child_process';
import type { AgentConfig } from '@agentdispatch/shared';

export interface AgentProcessEvents {
  onExit: (code: number | null, signal: string | null) => void;
  onStderr: (data: string) => void;
}

export class AgentProcess {
  private process: ChildProcess | null = null;
  private config: AgentConfig;
  private events: AgentProcessEvents;

  constructor(config: AgentConfig, events: AgentProcessEvents) {
    this.config = config;
    this.events = events;
  }

  start(): { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream } {
    const parts = this.config.command.split(' ');
    const cmd = parts[0] ?? '';
    const defaultArgs = parts.slice(1);
    const args = [...defaultArgs, ...(this.config.args ?? [])];

    this.process = spawn(cmd, args, {
      cwd: this.config.workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.events.onStderr(data.toString());
    });

    this.process.on('exit', (code, signal) => {
      this.events.onExit(code ?? null, signal ?? null);
    });

    if (!this.process.stdin || !this.process.stdout) {
      throw new Error('Failed to obtain stdin/stdout from child process');
    }

    return {
      stdin: this.process.stdin,
      stdout: this.process.stdout,
    };
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.process && !this.process.killed) {
      this.process.kill(signal);
    }
  }

  isRunning(): boolean {
    return (
      this.process !== null &&
      !this.process.killed &&
      this.process.exitCode === null
    );
  }

  getPid(): number | undefined {
    return this.process?.pid;
  }

  getConfig(): AgentConfig {
    return this.config;
  }
}

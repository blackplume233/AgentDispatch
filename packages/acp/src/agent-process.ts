import { spawn, type ChildProcess } from 'node:child_process';
import type { AgentConfig } from '@agentdispatch/shared';

export interface AgentProcessEvents {
  onExit: (code: number | null, signal: string | null) => void;
  onStderr: (data: string) => void;
}

export interface AgentProcessEnv {
  [key: string]: string;
}

export class AgentProcess {
  private process: ChildProcess | null = null;
  private config: AgentConfig;
  private events: AgentProcessEvents;
  private extraEnv: AgentProcessEnv;

  constructor(config: AgentConfig, events: AgentProcessEvents, extraEnv?: AgentProcessEnv) {
    this.config = config;
    this.events = events;
    this.extraEnv = extraEnv ?? {};
  }

  start(): { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream } {
    const parts = this.config.command.split(' ');
    const cmd = parts[0] ?? '';
    const defaultArgs = parts.slice(1);
    const args = [...defaultArgs, ...(this.config.args ?? [])];

    this.process = spawn(cmd, args, {
      cwd: this.config.workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        ...this.extraEnv,
      },
      shell: process.platform === 'win32',
    });

    this.process.stderr?.setEncoding('utf8');
    this.process.stderr?.on('data', (data: string) => {
      this.events.onStderr(data);
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

  kill(signal: NodeJS.Signals = 'SIGTERM', forceKillMs = 5000): void {
    if (!this.process || this.process.killed) return;
    this.process.kill(signal);
    if (signal === 'SIGTERM' && forceKillMs > 0) {
      const timer = setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, forceKillMs);
      this.process.once('exit', () => clearTimeout(timer));
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

import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export class Logger {
  private level: LogLevel;
  private logDir: string;
  private streams: Map<string, fs.WriteStream> = new Map();

  constructor(logDir: string, level: LogLevel = 'info') {
    this.logDir = logDir;
    this.level = level;
  }

  async init(): Promise<void> {
    await fs.promises.mkdir(this.logDir, { recursive: true });
  }

  private getDate(): string {
    return new Date().toISOString().split('T')[0] ?? 'unknown';
  }

  private getStream(prefix: string): fs.WriteStream {
    const key = `${prefix}-${this.getDate()}`;
    let stream = this.streams.get(key);
    if (!stream) {
      const filePath = path.join(this.logDir, `${key}.jsonl`);
      stream = fs.createWriteStream(filePath, { flags: 'a' });
      this.streams.set(key, stream);
    }
    return stream;
  }

  write(prefix: string, entry: Record<string, unknown>): void {
    const stream = this.getStream(prefix);
    stream.write(JSON.stringify(entry) + '\n');
  }

  log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] > LOG_LEVELS[this.level]) return;
    this.write('server', {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  async close(): Promise<void> {
    for (const stream of this.streams.values()) {
      stream.end();
    }
    this.streams.clear();
  }
}

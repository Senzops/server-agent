import { io, Socket } from 'socket.io-client';
import * as pty from 'node-pty';
import os from 'os';
import path from 'path';
import { logger } from '../utils/logger';
import { config } from '../config/env';

type ResizePayload = {
  cols: number;
  rows: number;
};

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

const ALLOWED_SHELLS = new Set([
  '/bin/bash',
  '/bin/sh',
  'powershell.exe',
  'cmd.exe'
]);

export class TerminalService {
  private socket: Socket | null = null;
  private ptyProcess: pty.IPty | null = null;
  private readonly enabled: boolean;
  private initialized = false;
  private ptySessionId = 0;
  private spawning = false;

  constructor() {
    this.enabled = config.integrations.terminal.enabled;
  }

  public init(): void {
    if (!this.enabled) {
      logger.info('[Terminal] Service disabled via config.');
      return;
    }

    if (this.initialized) {
      logger.warn('[Terminal] init() called more than once. Ignoring.');
      return;
    }

    this.initialized = true;
    logger.info('[Terminal] Initializing Terminal Service');

    const socketBaseUrl = this.resolveSocketUrl();

    this.socket = io(socketBaseUrl, {
      path: '/api/socket',
      auth: {
        type: 'agent',
        vpsId: config.agent.vpsId,
        apiKey: config.api.key
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000
    });

    this.registerSocketHandlers();
  }

  // ─────────────────────────────────────────────
  // Socket Handlers
  // ─────────────────────────────────────────────

  private registerSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      logger.info('[Terminal] Connected to relay server');
    });

    this.socket.on('connect_error', (err) => {
      if (err?.message !== 'xhr poll error') {
        logger.error('[Terminal] Connection error', err);
      }
    });

    this.socket.on('disconnect', (reason) => {
      logger.warn(`[Terminal] Disconnected: ${reason}`);
      this.killPty(); // SECURITY: kill shell immediately
    });

    this.socket.on('term:spawn', (payload: Partial<ResizePayload>) => {
      const cols = this.sanitizeNumber(payload?.cols, DEFAULT_COLS, 10, 500);
      const rows = this.sanitizeNumber(payload?.rows, DEFAULT_ROWS, 5, 300);
      this.spawnPty(cols, rows);
    });

    this.socket.on('term:input', (data: unknown) => {
      if (typeof data !== 'string' || !this.ptyProcess) return;
      try {
        this.ptyProcess.write(data);
      } catch {
        this.killPty();
      }
    });

    this.socket.on('term:resize', (payload: Partial<ResizePayload>) => {
      if (!this.ptyProcess) return;
      const cols = this.sanitizeNumber(payload?.cols, DEFAULT_COLS, 10, 500);
      const rows = this.sanitizeNumber(payload?.rows, DEFAULT_ROWS, 5, 300);

      try {
        this.ptyProcess.resize(cols, rows);
      } catch {
        this.killPty();
      }
    });
  }

  // ─────────────────────────────────────────────
  // PTY Lifecycle
  // ─────────────────────────────────────────────

  private spawnPty(cols: number, rows: number): void {
    if (this.spawning) {
      logger.warn('[Terminal] Spawn already in progress, ignoring');
      return;
    }

    this.spawning = true;
    this.killPty();

    const sessionId = ++this.ptySessionId;
    const shell = this.resolveShell();

    try {
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: this.resolveCwd(),
        env: this.buildSafeEnv()
      });

      this.ptyProcess = ptyProcess;

      logger.info('[Terminal] PTY spawned', {
        pid: ptyProcess.pid,
        sessionId
      });

      ptyProcess.onData((data) => {
        if (this.ptyProcess === ptyProcess) {
          this.socket?.emit('term:output', data);
        }
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        if (this.ptyProcess !== ptyProcess) {
          // Old PTY — ignore
          return;
        }

        logger.info('[Terminal] PTY exited', { exitCode, signal, sessionId });
        this.socket?.emit(
          'term:output',
          '\r\n\x1b[33m[Session Closed]\x1b[0m\r\n'
        );

        this.ptyProcess = null;
      });

    } catch (err) {
      logger.error('[Terminal] Failed to spawn PTY', err);
    } finally {
      this.spawning = false;
    }
  }


  private killPty(): void {
    if (!this.ptyProcess) return;

    const pid = this.ptyProcess.pid;
    logger.info('[Terminal] Killing PTY session', { pid });

    try {
      this.ptyProcess.kill();
    } catch {
      // ignore
    } finally {
      this.ptyProcess = null;
    }
  }


  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  private resolveSocketUrl(): string {
    try {
      const url = new URL(config.api.endpoint);
      return url.origin;
    } catch {
      logger.warn('[Terminal] Invalid API endpoint, defaulting to localhost');
      return 'http://localhost:5000';
    }
  }

  private resolveShell(): string {
    const platform = os.platform();
    let shell =
      platform === 'win32'
        ? process.env.COMSPEC || 'powershell.exe'
        : process.env.SHELL || '/bin/sh';

    if (!ALLOWED_SHELLS.has(shell)) {
      logger.warn('[Terminal] Shell not allowed, falling back', shell);
      shell = platform === 'win32' ? 'powershell.exe' : '/bin/sh';
    }

    return shell;
  }

  private resolveCwd(): string {
    return (
      process.env.HOME ||
      process.env.USERPROFILE ||
      path.resolve('/')
    );
  }

  private buildSafeEnv(): NodeJS.ProcessEnv {
    const ALLOWED_ENV = [
      'PATH',
      'HOME',
      'USER',
      'LANG',
      'TERM',
      'SHELL'
    ];

    return ALLOWED_ENV.reduce<NodeJS.ProcessEnv>((env, key) => {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
      return env;
    }, {});
  }

  private sanitizeNumber(
    value: unknown,
    fallback: number,
    min: number,
    max: number
  ): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(Math.max(num, min), max);
  }
}

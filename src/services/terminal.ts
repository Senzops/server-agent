import { io, Socket } from 'socket.io-client';
import * as pty from 'node-pty';
import os from 'os';
import fs from 'fs';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/* ───────────────────────────────
   ASCII Banner
─────────────────────────────── */
const WELCOME_BANNER = `
\r\n\x1b[38;5;75m   _____                               \x1b[0m
\r\n\x1b[38;5;75m  / ____|                              \x1b[0m
\r\n\x1b[38;5;75m | (___   ___ _ __  ____ ___  _ __     \x1b[0m
\r\n\x1b[38;5;75m  \\___ \\ / _ \\ '_ \\|_  // _ \\| '__|    \x1b[0m
\r\n\x1b[38;5;75m  ____) |  __/ | | |/ /| (_) | |       \x1b[0m
\r\n\x1b[38;5;75m |_____/ \\___|_| |_/___|\\___/|_|       \x1b[0m
\r\n
\r\n\x1b[32m✔ Secure Session Established\x1b[0m
\r\n\x1b[90mConnected to ${os.hostname()} (${os.type()} ${os.release()})\x1b[0m
\r\n
`;

export class TerminalService {
  private socket: Socket | null = null;
  private ptyProcess: pty.IPty | null = null;
  private enabled = config.integrations.terminal.enabled;
  private spawning = false;
  private sessionId = 0;

  /* ───────────────────────────────
     Init
  ─────────────────────────────── */

  public init(): void {
    if (!this.enabled) return;

    logger.info('[Terminal] Initializing Terminal Service');

    const socketUrl = this.resolveSocketUrl();

    this.socket = io(socketUrl, {
      path: '/api/socket',
      transports: ['websocket'],
      auth: {
        type: 'agent',
        vpsId: config.agent.vpsId,
        apiKey: config.api.key
      },
      reconnection: true,
      reconnectionDelay: 5000
    });

    this.registerSocketHandlers();
  }

  /* ───────────────────────────────
     Socket Handlers
  ─────────────────────────────── */

  private registerSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      logger.info('[Terminal] Connected to relay');
    });

    this.socket.on('disconnect', () => {
      logger.warn('[Terminal] Disconnected — killing PTY');
      this.killPty();
    });

    this.socket.on('term:spawn', ({ cols, rows }) => {
      this.spawnPty(cols || 80, rows || 24);
    });

    this.socket.on('term:input', (data: unknown) => {
      if (typeof data !== 'string' || !this.ptyProcess) return;
      try { this.ptyProcess.write(data); } catch { }
    });

    this.socket.on('term:resize', ({ cols, rows }) => {
      if (!this.ptyProcess) return;
      try { this.ptyProcess.resize(cols, rows); } catch { }
    });
  }

  /* ───────────────────────────────
     PTY Lifecycle
  ─────────────────────────────── */

  private spawnPty(cols: number, rows: number): void {
    if (this.spawning) {
      logger.warn('[Terminal] Spawn already in progress — ignored');
      return;
    }

    this.spawning = true;
    this.killPty();

    const currentSession = ++this.sessionId;

    let shell = this.resolveShell();
    let args: string[] = [];

    // 🔒 HOST ACCESS (Explicitly gated)
    if (config.integrations.terminal.allowHostAccess === true) {
      const nsenter = '/usr/bin/nsenter';
      if (fs.existsSync(nsenter)) {
        logger.warn('[Terminal] HOST ACCESS ENABLED via nsenter');
        shell = nsenter;
        args = ['-t', '1', '-m', '-u', '-i', '-n', '/bin/bash'];
      }
    }

    try {
      const ptyProc = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME || '/root',
        env: this.buildSafeEnv()
      });

      this.ptyProcess = ptyProc;

      logger.info('[Terminal] PTY spawned', {
        pid: ptyProc.pid,
        session: currentSession,
        shell
      });

      this.socket?.emit('term:output', WELCOME_BANNER);

      ptyProc.onData((data) => {
        if (this.ptyProcess === ptyProc) {
          this.socket?.emit('term:output', data);
        }
      });

      ptyProc.onExit(({ exitCode, signal }) => {
        if (this.ptyProcess !== ptyProc) return;

        logger.info('[Terminal] PTY exited', {
          exitCode,
          signal,
          session: currentSession
        });

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

    try {
      logger.info('[Terminal] Killing PTY', { pid: this.ptyProcess.pid });
      this.ptyProcess.kill();
    } catch { }
    finally {
      this.ptyProcess = null;
    }
  }

  /* ───────────────────────────────
     Helpers
  ─────────────────────────────── */

  private resolveSocketUrl(): string {
    try {
      return new URL(config.api.endpoint).origin;
    } catch {
      return 'http://localhost:5000';
    }
  }

  private resolveShell(): string {
    if (fs.existsSync('/usr/bin/zsh')) return '/usr/bin/zsh';
    if (fs.existsSync('/bin/bash')) return '/bin/bash';
    return '/bin/sh';
  }

  private buildSafeEnv(): NodeJS.ProcessEnv {
    const allowed = ['PATH', 'HOME', 'USER', 'LANG', 'TERM'];
    return allowed.reduce((env, k) => {
      if (process.env[k]) env[k] = process.env[k];
      return env;
    }, {} as NodeJS.ProcessEnv);
  }
}

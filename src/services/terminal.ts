import { io, Socket } from 'socket.io-client';
import * as pty from 'node-pty';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const WELCOME_BANNER = `
\r\x1b[38;5;75m   _____                               \x1b[0m
\r\x1b[38;5;75m  / ____|                              \x1b[0m
\r\x1b[38;5;75m | (___   ___ _ __  ____ ___  _ __     \x1b[0m
\r\x1b[38;5;75m  \\___ \\ / _ \\ '_ \\|_  // _ \\| '__|    \x1b[0m
\r\x1b[38;5;75m  ____) |  __/ | | |/ /| (_) | |       \x1b[0m
\r\x1b[38;5;75m |_____/ \\___|_| |_/___|\\___/|_|       \x1b[0m
\r
\r\x1b[32m✔ Secure Session Established\x1b[0m
\r\x1b[90mConnected to ${os.hostname()} (${os.type()} ${os.release()})\x1b[0m
\r`;

const MAX_INPUT_BYTES = 4096;

export class TerminalService {
  private socket: Socket | null = null;
  private ptyProcess: pty.IPty | null = null;
  private enabled = config.integrations.terminal.enabled;
  private spawning = false;
  private sessionId = 0;

  public init(): void {
    if (!this.enabled) {
      logger.info('[Terminal] Service disabled');
      return;
    }

    const socketUrl = this.resolveSocketUrl();
    logger.info('[Terminal] Initializing', { socketUrl });

    this.socket = io(socketUrl, {
      path: '/api/socket',
      transports: ['websocket'],
      auth: {
        type: 'agent',
        vpsId: config.agent.vpsId,
        apiKey: config.api.key
      },
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.3,
    });

    this.registerSocketHandlers();
  }

  public destroy(): void {
    logger.info('[Terminal] Shutting down');
    this.killPty();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private registerSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      logger.info('[Terminal] Connected to relay');
    });

    this.socket.on('disconnect', (reason) => {
      logger.warn('[Terminal] Disconnected — killing PTY', { reason });
      this.killPty();
    });

    this.socket.on('term:spawn', ({ cols, rows }) => {
      this.spawnPty(cols || 80, rows || 24);
    });

    this.socket.on('term:destroy', () => {
      logger.info('[Terminal] Received destroy signal (User disconnected)');
      this.killPty();
    });

    this.socket.on('term:input', (data: unknown) => {
      if (typeof data !== 'string' || !this.ptyProcess) return;
      if (Buffer.byteLength(data, 'utf8') > MAX_INPUT_BYTES) {
        logger.warn('[Terminal] Oversized input rejected', { bytes: Buffer.byteLength(data, 'utf8') });
        return;
      }
      try { this.ptyProcess.write(data); } catch (err: any) {
        logger.warn('[Terminal] Write to PTY failed', { error: err.message });
      }
    });

    this.socket.on('term:resize', ({ cols, rows }) => {
      if (!this.ptyProcess) return;
      try { this.ptyProcess.resize(cols, rows); } catch (err: any) {
        logger.warn('[Terminal] Resize failed', { error: err.message });
      }
    });
  }

  private canUseNsenter(): boolean {
    if (!config.integrations.terminal.allowHostAccess) return false;
    if (!fs.existsSync('/usr/bin/nsenter')) return false;

    try {
      execSync('/usr/bin/nsenter -t 1 -m -u -i -n true', {
        stdio: 'ignore',
        timeout: 250
      });
      return true;
    } catch {
      return false;
    }
  }

  private spawnPty(cols: number, rows: number): void {
    if (this.spawning || !this.socket?.connected) {
      logger.warn('[Terminal] Spawn blocked (busy or disconnected)');
      return;
    }

    this.spawning = true;

    try {
      this.killPty();

      const session = ++this.sessionId;
      const isHost = this.canUseNsenter();

      const shell = this.resolveShell(isHost);
      const cwd = this.resolveCwd(isHost);
      const env = this.buildSafeEnv(shell);
      const args = isHost ? ['-t', '1', '-m', '-u', '-i', '-n', shell, '-i'] : ['-i'];

      const ptyProc = pty.spawn(isHost ? '/usr/bin/nsenter' : shell, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env
      });

      this.ptyProcess = ptyProc;

      logger.info('[Terminal] PTY spawned', {
        pid: ptyProc.pid,
        session,
        mode: isHost ? 'host' : 'container',
        shell,
        cwd
      });

      this.socket!.emit('term:output', WELCOME_BANNER);
      this.socket!.emit(
        'term:output',
        isHost
          ? `\x1b[90mConnected to HOST (${os.hostname()})\x1b[0m\r\n\r\n`
          : '\x1b[33m⚠ Container shell (host access unavailable)\x1b[0m\r\n\r\n'
      );

      ptyProc.onData((data) => {
        if (this.ptyProcess === ptyProc) {
          this.socket?.emit('term:output', data);
        }
      });

      ptyProc.onExit(({ exitCode, signal }) => {
        if (this.ptyProcess !== ptyProc) return;

        logger.info('[Terminal] PTY exited', { exitCode, signal, session });
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
    try {
      logger.info('[Terminal] Killing PTY', { pid });
      this.ptyProcess.kill();
    } catch (err: any) {
      logger.warn('[Terminal] Error killing PTY', { pid, error: err.message });
    } finally {
      this.ptyProcess = null;
    }
  }

  private resolveShell(isHost: boolean): string {
    if (isHost) {
      if (fs.existsSync('/bin/bash')) return '/bin/bash';
      return '/bin/sh';
    }

    if (fs.existsSync('/usr/bin/zsh')) return '/usr/bin/zsh';
    if (fs.existsSync('/bin/bash')) return '/bin/bash';
    return '/bin/sh';
  }

  private resolveCwd(isHost: boolean): string {
    if (isHost) return '/';

    const home = process.env.HOME;
    if (home && fs.existsSync(home)) return home;

    return '/root';
  }

  private buildSafeEnv(shell: string): NodeJS.ProcessEnv {
    const { API_KEY, ...safeEnv } = process.env;
    const user = safeEnv.USER || 'root';
    const host = os.hostname();

    const env: NodeJS.ProcessEnv = {
      ...safeEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    if (shell.includes('bash')) {
      // \[...\] marks non-printing sequences so readline calculates cursor position correctly
      env.PS1 = `\\[\\e[1;32m\\]${user}@${host}\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[0m\\]\\$ `;
    } else if (!shell.includes('zsh')) {
      // Plain prompt for sh — zsh uses its own prompt via .zshrc
      env.PS1 = `${user}@${host}:\\$ `;
    }

    return env;
  }

  private resolveSocketUrl(): string {
    try {
      return new URL(config.api.endpoint).origin;
    } catch {
      return 'http://localhost:5000';
    }
  }
}

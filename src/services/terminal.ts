import { io, Socket } from 'socket.io-client';
import * as pty from 'node-pty';
import os from 'os';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export class TerminalService {
  private socket: Socket | null = null;
  private ptyProcess: pty.IPty | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = config.integrations.terminal.enabled;
  }

  public init() {
    if (!this.enabled) {
      logger.info('[Terminal] Service disabled via config.');
      return;
    }

    logger.info('[Terminal] Starting Terminal Service...');

    // 1. Determine Socket URL
    // We strip the path from the API Endpoint to get the base URL
    // e.g. "https://api.senzor.dev/api/ingest/stats" -> "https://api.senzor.dev"
    let socketBaseUrl = 'http://localhost:5000';
    try {
      const urlObj = new URL(config.api.endpoint);
      socketBaseUrl = urlObj.origin;
    } catch (e) {
      logger.warn('[Terminal] Invalid API Endpoint format, defaulting to localhost');
    }

    // 2. Connect
    this.socket = io(socketBaseUrl, {
      path: '/api/socket', // Must match Backend configuration
      auth: {
        type: 'agent',
        vpsId: config.agent.vpsId,
        apiKey: config.api.key
      },
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: Infinity
    });

    // --- Socket Event Listeners ---

    this.socket.on('connect', () => {
      logger.info('[Terminal] Connected to Relay Server');
    });

    this.socket.on('connect_error', (err) => {
      // Quiet log for connection refused to avoid spamming if server is down
      if (err.message !== 'xhr poll error') {
        logger.error(`[Terminal] Connection Error: ${err.message}`);
      }
    });

    this.socket.on('disconnect', (reason) => {
      logger.warn(`[Terminal] Disconnected from Relay: ${reason}`);
      this.killPty(); // Security: Kill shell if connection drops
    });

    // 3. Spawn Shell Request (from Frontend)
    this.socket.on('term:spawn', ({ cols, rows }) => {
      this.spawnPty(cols || 80, rows || 24);
    });

    // 4. Handle Input (Keystrokes from Frontend)
    this.socket.on('term:input', (data) => {
      if (this.ptyProcess) {
        try {
          this.ptyProcess.write(data);
        } catch (e) {
          // PTY might be dead
        }
      }
    });

    // 5. Handle Resize
    this.socket.on('term:resize', ({ cols, rows }) => {
      if (this.ptyProcess) {
        try {
          this.ptyProcess.resize(cols, rows);
        } catch (e) { }
      }
    });
  }

  private spawnPty(cols: number, rows: number) {
    // Kill existing shell to prevent zombie processes
    this.killPty();

    // Determine shell based on OS
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

    try {
      // Spawn pseudo-terminal
      this.ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: cols,
        rows: rows,
        cwd: process.env.HOME || '/root',
        env: process.env as any // Pass current env vars (API keys, etc)
      });

      logger.info(`[Terminal] Spawned shell: ${shell} (PID: ${this.ptyProcess.pid})`);

      // Pipe PTY output -> Socket
      this.ptyProcess.onData((data) => {
        this.socket?.emit('term:output', data);
      });

      this.ptyProcess.onExit(({ exitCode, signal }) => {
        logger.info(`[Terminal] Shell exited (Code: ${exitCode}, Signal: ${signal})`);
        this.socket?.emit('term:output', '\r\n\x1b[33m[Session Closed]\x1b[0m\r\n');
        this.ptyProcess = null;
      });

    } catch (e: any) {
      logger.error('[Terminal] Failed to spawn PTY', e);
      this.socket?.emit('term:output', `\r\nError spawning shell: ${e.message}\r\n`);
    }
  }

  private killPty() {
    if (this.ptyProcess) {
      try {
        logger.info('[Terminal] Killing active PTY session');
        this.ptyProcess.kill();
      } catch (e) {
        // Ignore errors if process already dead
      }
      this.ptyProcess = null;
    }
  }
}
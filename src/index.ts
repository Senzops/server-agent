import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config, validateConfig } from './config/env';
import { MonitorService } from './services/monitor';
import { logger } from './utils/logger';
import { TerminalService } from './services/terminal';

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

const monitorService = new MonitorService();
let terminalService: TerminalService | null = null;
let shutdownRequested = false;

async function pushWithRetry(metrics: object): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await axios.post(config.api.endpoint, {
        vpsId: config.agent.vpsId,
        runId: uuidv4(),
        metrics,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-vps-id': config.agent.vpsId!,
          'x-api-key': config.api.key!,
        },
        timeout: config.api.timeout,
      });
      return;
    } catch (err: any) {
      const isLast = attempt === MAX_RETRIES;
      if (isLast) throw err;

      const jitter = Math.random() * 500;
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1) + jitter;
      logger.warn(`Push failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${Math.round(delay)}ms`, { error: err.message });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function shutdown(signal: string) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);

  if (terminalService) {
    terminalService.destroy();
  }

  setTimeout(() => {
    logger.warn('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 5000).unref();

  process.exit(0);
}

const runAgent = async () => {
  try {
    validateConfig();
    logger.info(`Senzor Agent starting`, { serverId: config.agent.vpsId, interval: config.agent.interval });

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    if (config.integrations.terminal.enabled) {
      logger.info('[System] Terminal Integration Enabled');
      terminalService = new TerminalService();
      terminalService.init();
    } else {
      logger.info('[System] Terminal Integration Disabled (Default)');
    }

    while (!shutdownRequested) {
      const startTime = Date.now();

      try {
        const metrics = await monitorService.collectStats();

        if (metrics) {
          await pushWithRetry(metrics);
          logger.info('Telemetry pushed successfully');
        }
      } catch (err: any) {
        if (err.code === 'ECONNREFUSED') {
          logger.error('Connection refused: API Server is unreachable');
        } else {
          logger.error('Failed to push telemetry after retries', { error: err.message });
        }
      }

      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, (config.agent.interval * 1000) - elapsed);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

  } catch (criticalError) {
    logger.error('Critical startup error', criticalError);
    process.exit(1);
  }
};

runAgent();

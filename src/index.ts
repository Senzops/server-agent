import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config, validateConfig } from './config/env';
import { MonitorService } from './services/monitor';
import { logger } from './utils/logger';

// Initialize
const monitorService = new MonitorService();

const runAgent = async () => {
  try {
    validateConfig();
    logger.info(`Starting Senzor Agent for SERVER: ${config.agent.vpsId}`);

    // Main Loop
    while (true) {
      const startTime = Date.now();

      try {
        // 1. Collect
        const metrics = await monitorService.collectStats();

        if (metrics) {
          // 2. Push
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

          logger.info('Telemetry pushed successfully');
        }
      } catch (err: any) {
        if (err.code === 'ECONNREFUSED') {
          logger.error('Connection refused: API Server is unreachable');
        } else {
          logger.error('Error in agent loop', { error: err.message });
        }
      }

      // 3. Wait
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
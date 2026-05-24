import { NginxIntegration } from './nginx';
import { config } from '../config/env';
import { TraefikIntegration } from './traefik';
import { BaseIntegration } from './base';
import { logger } from '../utils/logger';

export class IntegrationManager {
  private integrations: BaseIntegration<unknown>[] = [];

  constructor() {
    if (config.integrations.nginx.enabled) {
      this.integrations.push(new NginxIntegration(config.integrations.nginx));
    }
    if (config.integrations.traefik.enabled) {
      this.integrations.push(new TraefikIntegration(config.integrations.traefik));
    }
  }

  async collectAll(): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};

    const settled = await Promise.allSettled(
      this.integrations.map(async (integration) => {
        const data = await integration.collect();
        if (data) {
          results[integration.name] = data;
        }
      })
    );

    for (const result of settled) {
      if (result.status === 'rejected') {
        logger.warn('Integration collection failed', { error: result.reason?.message });
      }
    }

    return results;
  }
}

import { NginxIntegration } from './nginx';
import { config } from '../config/env';

export class IntegrationManager {
  private integrations: any[] = [];

  constructor() {
    // 1. Initialize Nginx
    if (config.integrations.nginx.enabled) {
      this.integrations.push(new NginxIntegration(config.integrations.nginx));
    }
  }

  async collectAll() {
    const results: any = {};

    // Run all collections in parallel
    const promises = this.integrations.map(async (integration) => {
      const data = await integration.collect();
      if (data) {
        results[integration.name] = data;
      }
    });

    await Promise.all(promises);
    return results;
  }
}
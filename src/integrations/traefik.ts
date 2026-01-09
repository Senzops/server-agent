import axios from 'axios';
import { BaseIntegration, IntegrationConfig } from './base';
import { logger } from '../utils/logger';
import { TraefikStats } from '../types/telemetry';

export class TraefikIntegration extends BaseIntegration {
  constructor(config: IntegrationConfig) {
    super('traefik', config);
  }

  async collect(): Promise<TraefikStats | null> {
    if (!this.config.enabled) return null;

    try {
      // Default Traefik API port is 8080. Endpoint for stats is /api/overview
      // We allow base URL configuration, e.g., http://127.0.0.1:8080
      const baseUrl = this.config.url || 'http://127.0.0.1:8080';
      const endpoint = `${baseUrl}/api/overview`;

      // Optional: Add Basic Auth if user configured it
      const authConfig = (this.config.username && this.config.password)
        ? { auth: { username: this.config.username, password: this.config.password } }
        : {};

      const response = await axios.get(endpoint, {
        timeout: 2000,
        ...authConfig
      });

      const data = response.data;

      // Validation: Ensure structure matches Traefik API v2/v3
      if (!data.routers || !data.services || !data.middlewares) {
        throw new Error('Invalid Traefik API response format');
      }

      return {
        routers: {
          total: data.routers.total || 0,
          active: data.routers.enabled || data.routers.active || 0, // Traefik versions vary on 'enabled' vs 'active'
          failed: data.routers.disabled || data.routers.failed || 0,
        },
        services: {
          total: data.services.total || 0,
          active: data.services.enabled || data.services.active || 0,
          failed: data.services.disabled || data.services.failed || 0,
        },
        middlewares: {
          total: data.middlewares.total || 0,
          active: data.middlewares.enabled || data.middlewares.active || 0,
          failed: data.middlewares.disabled || data.middlewares.failed || 0,
        },
      };

    } catch (error: any) {
      // Suppress connection refused logs unless in debug mode to avoid spamming 
      // if service is temporarily down
      if (error.code !== 'ECONNREFUSED') {
        logger.warn(`[Traefik] Failed to collect stats: ${error.message}`);
      }
      return null;
    }
  }
}
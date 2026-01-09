import axios from 'axios';
import { BaseIntegration, IntegrationConfig } from './base';
import { logger } from '../utils/logger';
import { TraefikComponentStats, TraefikStats } from '../types/telemetry';

export class TraefikIntegration extends BaseIntegration {
  constructor(config: IntegrationConfig) {
    super('traefik', config);
  }

  async collect(): Promise<TraefikStats | null> {
    if (!this.config.enabled) return null;

    try {
      const baseUrl = this.config.url || 'http://127.0.0.1:8080';
      const endpoint = `${baseUrl}/api/overview`;

      const authConfig = (this.config.username && this.config.password)
        ? { auth: { username: this.config.username, password: this.config.password } }
        : {};

      const response = await axios.get(endpoint, {
        timeout: 3000,
        ...authConfig
      });

      const data = response.data;

      // Robust Aggregation Helper
      // Handles both nested (http.routers) and flat (routers) structures
      const aggregate = (type: 'routers' | 'services' | 'middlewares'): TraefikComponentStats => {
        let total = 0;
        let failed = 0;
        let warnings = 0;

        // Protocol list to scan (Traefik v2/v3 structure)
        const protocols = ['http', 'tcp', 'udp'];

        let foundProtocolData = false;

        // 1. Try Nested Structure (HTTP/TCP/UDP)
        protocols.forEach(proto => {
          if (data[proto] && data[proto][type]) {
            foundProtocolData = true;
            total += (data[proto][type].total || 0);
            // 'errors' is the standard field in new versions, 'failed' in older ones
            failed += (data[proto][type].errors || data[proto][type].failed || 0);
            warnings += (data[proto][type].warnings || 0);
          }
        });

        // 2. Fallback to Flat Structure (Older V2) if no protocols found
        if (!foundProtocolData && data[type]) {
          total += (data[type].total || 0);
          failed += (data[type].errors || data[type].failed || 0);
        }

        // Calculation:
        // Active = Total Configured (In Traefik terms, 'total' is usually the count of loaded configs)
        // We report 'active' as total because 'errors' usually implies misconfiguration, not necessarily "down".
        // The UI will show Total vs Failed.
        return {
          total,
          active: total,
          failed: failed
        };
      };

      // Check if we got valid data (Look for standard keys)
      const hasData = data.http || data.tcp || data.routers || data.features;
      if (!hasData) {
        throw new Error('Response does not look like Traefik API data');
      }

      return {
        routers: aggregate('routers'),
        services: aggregate('services'),
        middlewares: aggregate('middlewares'),
      };

    } catch (error: any) {
      if (error.code !== 'ECONNREFUSED') {
        // Only log full error if it's not just "service down" to keep logs clean
        logger.warn(`[Traefik] Collection failed: ${error.message}`);
      }
      return null;
    }
  }
}
import axios from 'axios';
import https from 'https';
import { BaseIntegration, IntegrationConfig } from './base';
import { TraefikStats, TraefikComponentStats } from '../types/telemetry';
import { logger } from '../utils/logger';

export class TraefikIntegration extends BaseIntegration {
  constructor(config: IntegrationConfig) {
    super('traefik', config);
  }

  async collect(): Promise<TraefikStats | null> {
    if (!this.config.enabled) return null;

    // Define Candidate URLs
    // 1. If user provided a specific URL, try ONLY that.
    // 2. If no URL provided, try Auto-Discovery (Localhost -> Docker Gateway -> DNS aliases).
    let candidates: string[] = [];

    if (this.config.url && this.config.url.trim() !== '') {
      candidates.push(this.config.url);
    } else {
      candidates = [
        'http://127.0.0.1:8080',       // Standard Host Networking (Linux)
        'http://172.17.0.1:8080',      // Default Docker Bridge Gateway (Coolify/Dokploy standard)
        'http://host.docker.internal:8080', // Docker Desktop (Mac/Windows)
        'http://traefik:8080'          // Internal Docker Service Name
      ];
    }

    // Try endpoints sequentially until one works
    for (const rawUrl of candidates) {
      try {
        const stats = await this.fetchStats(rawUrl);
        if (stats) {
          return stats; // Success!
        }
      } catch (error) {
        // Continue to next candidate
      }
    }

    return null;
  }

  private async fetchStats(rawUrl: string): Promise<TraefikStats | null> {
    try {
      // 1. URL Normalization
      let baseUrl = rawUrl;
      if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
      if (baseUrl.endsWith('/dashboard')) baseUrl = baseUrl.replace('/dashboard', '');

      const endpoint = `${baseUrl}/api/overview`;

      // 2. Auth Config
      const authConfig = (this.config.username && this.config.password)
        ? { auth: { username: this.config.username, password: this.config.password } }
        : {};

      // 3. Request
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });

      const response = await axios.get(endpoint, {
        timeout: 2000, // Fast timeout for discovery
        ...authConfig,
        httpsAgent
      });

      const data = response.data;

      // 4. Robust Aggregation
      const aggregate = (type: 'routers' | 'services' | 'middlewares'): TraefikComponentStats => {
        let total = 0;
        let failed = 0;
        const protocols = ['http', 'tcp', 'udp'];
        let foundProtocolData = false;

        // V2.10+ / V3 Structure
        protocols.forEach(proto => {
          if (data[proto] && data[proto][type]) {
            foundProtocolData = true;
            total += (data[proto][type].total || 0);
            failed += (data[proto][type].errors || data[proto][type].failed || 0);
          }
        });

        // Legacy V2 Structure
        if (!foundProtocolData && data[type]) {
          total += (data[type].total || 0);
          failed += (data[type].errors || data[type].failed || 0);
        }

        return { total, active: total, failed };
      };

      // Validation
      const hasData = data.http || data.tcp || data.routers || data.features;
      if (!hasData) throw new Error('Invalid structure');

      return {
        routers: aggregate('routers'),
        services: aggregate('services'),
        middlewares: aggregate('middlewares'),
      };

    } catch (error: any) {
      // Only log specific errors if it was a user-configured URL failure
      // For auto-discovery, we silently fail until we run out of candidates
      if (this.config.url) {
        if (error.code !== 'ECONNREFUSED' && error.code !== 'ETIMEDOUT') {
          logger.warn(`[Traefik] Error checking ${rawUrl}: ${error.message}`);
        }
      }
      throw error; // Propagate to loop
    }
  }
}
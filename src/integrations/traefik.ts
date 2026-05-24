import axios from 'axios';
import https from 'https';
import { BaseIntegration, IntegrationConfig } from './base';
import { TraefikStats, TraefikComponentStats } from '../types/telemetry';
import { logger } from '../utils/logger';

export class TraefikIntegration extends BaseIntegration<TraefikStats> {
  private resolvedUrl: string | null = null;

  constructor(config: IntegrationConfig) {
    super('traefik', config);
  }

  async collect(): Promise<TraefikStats | null> {
    if (!this.config.enabled) return null;

    if (this.resolvedUrl) {
      try {
        return await this.fetchStats(this.resolvedUrl);
      } catch {
        logger.warn(`[Traefik] Cached endpoint failed, re-discovering...`);
        this.resolvedUrl = null;
      }
    }

    const candidates = new Set<string>();

    if (this.config.url && this.config.url.trim() !== '') {
      candidates.add(this.config.url);
    }

    candidates.add('http://127.0.0.1:8080');
    candidates.add('http://172.17.0.1:8080');
    candidates.add('http://host.docker.internal:8080');
    candidates.add('http://traefik:8080');

    let lastError: Error | null = null;

    for (const url of candidates) {
      try {
        const stats = await this.fetchStats(url);
        if (stats) {
          this.resolvedUrl = url;
          logger.info(`[Traefik] Connected via ${url}`);
          return stats;
        }
      } catch (error: any) {
        lastError = error;
      }
    }

    if (lastError) {
      const code = (lastError as any).code;
      if (code !== 'ECONNREFUSED' && code !== 'ETIMEDOUT' && code !== 'ECONNRESET') {
        logger.warn(`[Traefik] Failed to collect stats from any candidate. Last error: ${lastError.message}`);
      }
    }

    return null;
  }

  private async fetchStats(rawUrl: string): Promise<TraefikStats | null> {
    let baseUrl = rawUrl;
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    if (baseUrl.endsWith('/dashboard')) baseUrl = baseUrl.replace('/dashboard', '');

    const endpoint = `${baseUrl}/api/overview`;

    const authConfig = (this.config.username && this.config.password)
      ? { auth: { username: this.config.username, password: this.config.password } }
      : {};

    const insecure = this.config.insecureSkipVerify === true;
    const httpsAgent = new https.Agent({ rejectUnauthorized: !insecure });

    const response = await axios.get(endpoint, {
      timeout: 5000,
      ...authConfig,
      httpsAgent
    });

    const data = response.data;

    const aggregate = (type: 'routers' | 'services' | 'middlewares'): TraefikComponentStats => {
      let total = 0;
      let failed = 0;
      const protocols = ['http', 'tcp', 'udp'];
      let foundProtocolData = false;

      protocols.forEach(proto => {
        if (data[proto] && data[proto][type]) {
          foundProtocolData = true;
          total += (data[proto][type].total || 0);
          failed += (data[proto][type].errors || data[proto][type].failed || 0);
        }
      });

      if (!foundProtocolData && data[type]) {
        total += (data[type].total || 0);
        failed += (data[type].errors || data[type].failed || 0);
      }

      return { total, active: total, failed };
    };

    const hasData = data.http || data.tcp || data.routers || data.features;
    if (!hasData) throw new Error('Invalid structure');

    return {
      routers: aggregate('routers'),
      services: aggregate('services'),
      middlewares: aggregate('middlewares'),
    };
  }
}

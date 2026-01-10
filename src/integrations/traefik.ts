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

    // 1. Build Candidate List (Priority + Fallbacks)
    // We use a Set to handle duplicates if the user config matches a default
    const candidates = new Set<string>();

    // Priority: User Configured URL
    if (this.config.url && this.config.url.trim() !== '') {
      candidates.add(this.config.url);
    }

    // Fallbacks: Auto-Discovery Defaults
    // Useful for Coolify/Dokploy where 127.0.0.1 might fail inside the container
    candidates.add('http://127.0.0.1:8080');       // Host Networking
    candidates.add('http://172.17.0.1:8080');      // Docker Bridge Gateway
    candidates.add('http://host.docker.internal:8080'); // Docker Desktop
    candidates.add('http://traefik:8080');         // Internal Service Name

    // 2. Try endpoints sequentially
    let lastError: Error | null = null;

    for (const url of candidates) {
      try {
        const stats = await this.fetchStats(url);
        if (stats) {
          return stats; // Success!
        }
      } catch (error: any) {
        lastError = error;
        // Continue to next candidate...
      }
    }

    // 3. Log warning only if ALL candidates failed
    if (lastError) {
      const code = (lastError as any).code;
      // Suppress common connectivity errors to avoid log spam
      if (code !== 'ECONNREFUSED' && code !== 'ETIMEDOUT' && code !== 'ECONNRESET') {
        logger.warn(`[Traefik] Failed to collect stats from any candidate. Last error: ${lastError.message}`);
      }
    }

    return null;
  }

  private async fetchStats(rawUrl: string): Promise<TraefikStats | null> {
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
      timeout: 5000,
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
  }
}
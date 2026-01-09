import axios from 'axios';
import { BaseIntegration, IntegrationConfig } from './base';
import { logger } from '../utils/logger';
import { NginxStats } from '../types/telemetry';

export class NginxIntegration extends BaseIntegration {
  private previousRequests: number = 0;
  private previousTime: number = Date.now();

  constructor(config: IntegrationConfig) {
    super('nginx', config);
  }

  async collect(): Promise<NginxStats | null> {
    if (!this.config.enabled) return null;

    try {
      const url = this.config.statusUrl || 'http://127.0.0.1/nginx_status';
      const response = await axios.get(url, { timeout: 2000 });
      const text = response.data;

      // Parse Nginx stub_status output:
      // Active connections: 291 
      // server accepts handled requests
      //  16630948 16630948 31070465 
      // Reading: 6 Writing: 179 Waiting: 106 

      const activeMatch = text.match(/Active connections:\s+(\d+)/);
      const statsMatch = text.match(/\s+(\d+)\s+(\d+)\s+(\d+)/);
      const rwMatch = text.match(/Reading:\s+(\d+)\s+Writing:\s+(\d+)\s+Waiting:\s+(\d+)/);

      if (!activeMatch || !statsMatch || !rwMatch) {
        throw new Error('Invalid Nginx status format');
      }

      const totalRequests = parseInt(statsMatch[3], 10);

      // Calculate Requests Per Second
      const now = Date.now();
      const timeDiff = (now - this.previousTime) / 1000;
      let reqPerSec = 0;

      if (this.previousRequests > 0 && timeDiff > 0) {
        reqPerSec = (totalRequests - this.previousRequests) / timeDiff;
      }

      this.previousRequests = totalRequests;
      this.previousTime = now;

      return {
        activeConnections: parseInt(activeMatch[1], 10),
        accepts: parseInt(statsMatch[1], 10),
        handled: parseInt(statsMatch[2], 10),
        requests: totalRequests,
        reading: parseInt(rwMatch[1], 10),
        writing: parseInt(rwMatch[2], 10),
        waiting: parseInt(rwMatch[3], 10),
        reqPerSec: Math.max(0, reqPerSec)
      };

    } catch (error: any) {
      logger.warn(`[Nginx] Failed to collect stats: ${error.message}`);
      return null;
    }
  }
}
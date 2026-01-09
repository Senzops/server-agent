import si from 'systeminformation';
import { ContainerStats, TelemetryPayload } from '../types/telemetry';
import { logger } from '../utils/logger';
import { IntegrationManager } from '../integrations/manager';

export class MonitorService {

  private integrationManager: IntegrationManager;

  constructor() {
    this.integrationManager = new IntegrationManager();
  }

  /**
   * Collects comprehensive system metrics including Docker stats
   */
  public async collectStats(): Promise<TelemetryPayload | null> {
    try {
      // Parallelize data fetching (excluding docker for safety first)
      const [osInfo, cpu, currentLoad, mem, fsSize, networkStats, time,
        processes, latency, integrationData] = await Promise.all([
          si.osInfo(),
          si.cpu(),
          si.currentLoad(),
          si.mem(),
          si.fsSize(),
          si.networkStats(),
          si.time(),
          si.processes(),
          si.inetLatency(),
          this.integrationManager.collectAll()
        ]);

      // Fetch Docker Data (Metadata + Stats)
      let dockerStats: ContainerStats[] = [];
      try {
        // Fetch Metadata (Name, Image, State)
        const containers = await si.dockerContainers();
        // Fetch Performance Stats (CPU, Mem, I/O)
        const stats = await si.dockerContainerStats('*');

        dockerStats = containers.map((container) => {
          const stat = stats.find((s) => s.id === container.id);
          return {
            id: container.id,
            name: container.name,
            image: container.image,
            state: container.state,
            cpuPercent: stat?.cpuPercent || 0,
            memoryUsage: stat?.memUsage || 0,
            memoryLimit: stat?.memLimit || 0,
            memoryPercent: stat?.memPercent || 0,
            netIO: {
              rx: stat?.netIO.rx || 0,
              wx: stat?.netIO.wx || 0,
            },
            blockIO: {
              read: stat?.blockIO.r || 0,
              write: stat?.blockIO.w || 0,
            }
          }
        });
      } catch (dockerError) {
        // This is not critical; user might not have Docker or permissions
        // logger.warn('Docker stats could not be collected (socket likely missing)');
      }

      // Process System Data

      // Get primary disk (usually mounted on /)
      const mainDisk = fsSize.length > 0 ? fsSize[0] : { size: 0, used: 0, use: 0, fs: 'N/A' };

      // Aggregate network traffic across all interfaces
      const netRx = networkStats.reduce((acc, iface) => acc + iface.rx_sec, 0);
      const netTx = networkStats.reduce((acc, iface) => acc + iface.tx_sec, 0);

      const payload: TelemetryPayload = {
        os: {
          platform: osInfo.platform,
          distro: osInfo.distro,
          release: osInfo.release,
          hostname: osInfo.hostname,
          arch: osInfo.arch,
        },
        cpu: {
          usagePercent: currentLoad.currentLoad,
          cores: cpu.cores,
          speed: cpu.speed,
          brand: cpu.brand,
        },
        memory: {
          total: mem.total,
          used: mem.used,
          free: mem.free,
          active: mem.active,
          usagePercent: (mem.used / mem.total) * 100,
        },
        disk: {
          total: mainDisk.size,
          used: mainDisk.used,
          usagePercent: mainDisk.use,
          name: mainDisk.fs,
        },
        network: {
          bytesRecvSec: netRx,
          bytesSentSec: netTx,
          interfaceName: 'aggregate',
          latencyMs: latency,
        },
        processes: {
          total: processes.all,
          running: processes.running,
          blocked: processes.blocked,
          sleeping: processes.sleeping,
        },
        docker: dockerStats,
        uptimeSeconds: time.uptime,
        timestamp: new Date().toISOString(),

        nginx: integrationData.nginx || null,
      };

      return payload;
    } catch (error) {
      logger.error('Failed to collect system metrics', error);
      return null;
    }
  }
}
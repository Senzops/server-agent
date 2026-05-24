import si from 'systeminformation';
import { ContainerStats, TelemetryPayload } from '../types/telemetry';
import { logger } from '../utils/logger';
import { IntegrationManager } from '../integrations/manager';
import { config } from '../config/env';

export class MonitorService {
  private integrationManager: IntegrationManager;

  constructor() {
    this.integrationManager = new IntegrationManager();
  }

  public async collectStats(): Promise<TelemetryPayload | null> {
    try {
      const results = await Promise.allSettled([
        si.osInfo(),
        si.cpu(),
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.time(),
        si.processes(),
        si.inetLatency(),
        this.integrationManager.collectAll(),
        si.cpuTemperature(),
        si.graphics()
      ]);

      const get = <T>(index: number, fallback: T): T => {
        const r = results[index];
        if (r.status === 'fulfilled') return r.value as T;
        logger.warn(`Metric collection failed at index ${index}`, { error: (r as PromiseRejectedResult).reason?.message });
        return fallback;
      };

      const osInfo = get(0, { platform: 'unknown', distro: 'unknown', release: '', hostname: '', arch: '' } as any);
      const cpu = get(1, { cores: 0, speed: 0, brand: 'unknown' } as any);
      const currentLoad = get(2, { currentLoad: 0 } as any);
      const mem = get(3, { total: 0, used: 0, free: 0, active: 0, available: 0 } as any);
      const fsSize = get(4, [] as any[]);
      const networkStats = get(5, [] as any[]);
      const time = get(6, { uptime: 0 } as any);
      const processes = get(7, { all: 0, running: 0, blocked: 0, sleeping: 0 } as any);
      const latency = get(8, 0 as any);
      const integrationData = get(9, {} as any);
      const temp = get(10, { main: 0 } as any);
      const graphics = get(11, { controllers: [] } as any);

      let dockerStats: ContainerStats[] = [];
      try {
        const containers = await si.dockerContainers();
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
            netIO: { rx: stat?.netIO.rx || 0, wx: stat?.netIO.wx || 0 },
            blockIO: { read: stat?.blockIO.r || 0, write: stat?.blockIO.w || 0 }
          }
        });
      } catch (dockerError: any) {
        logger.debug('Docker stats unavailable', { error: dockerError.message });
      }

      // --- Multi-Disk Mapping ---
      const excludedFs = ['tmpfs', 'devtmpfs', 'overlay', 'squashfs', 'efivarfs', 'shm', 'sysfs', 'proc'];
      const activeDisks = fsSize
        .filter((d: any) => !excludedFs.includes(d.fs) && !excludedFs.includes(d.type))
        .map((d: any) => ({
          total: d.size,
          used: d.used,
          usagePercent: d.use,
          name: d.mount || d.fs
        }));

      // --- GPU Mapping ---
      const activeGpus = (graphics?.controllers || [])
        .filter((g: any) => g.model && g.model.toLowerCase() !== 'unknown')
        .map((gpu: any, index: number) => ({
          id: `gpu-${index}`,
          model: gpu.model || `GPU ${index}`,
          utilization: gpu.utilizationGpu || 0,
          temperature: gpu.temperatureGpu || 0,
          powerDraw: gpu.powerDraw || 0,
          vramUsed: gpu.memoryUsed || 0,
          vramTotal: gpu.memoryTotal || 0,
        }));

      const netRx = networkStats.reduce((acc: number, iface: any) => acc + (iface.rx_sec || 0), 0);
      const netTx = networkStats.reduce((acc: number, iface: any) => acc + (iface.tx_sec || 0), 0);

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
          usagePercent: mem.total > 0 ? ((mem.total - mem.available) / mem.total) * 100 : 0,
        },
        disk: activeDisks,
        hardware: {
          temperature: temp?.main || 0,
          powerDraw: 0,
        },
        gpus: activeGpus,
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
        traefik: integrationData.traefik || null,

        terminalEnabled: config.integrations.terminal.enabled,
      };

      return payload;
    } catch (error) {
      logger.error('Failed to collect system metrics', error);
      return null;
    }
  }
}

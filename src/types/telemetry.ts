export interface OsStats {
  platform: string;
  distro: string;
  hostname: string;
  release: string;
  arch: string;
}

export interface CpuStats {
  usagePercent: number;
  cores: number;
  speed: number;
  brand: string;
}

export interface MemoryStats {
  total: number;
  used: number;
  free: number;
  active: number;
  usagePercent: number;
}

export interface DiskStats {
  total: number;
  used: number;
  usagePercent: number;
  name: string;
}

export interface NetworkStats {
  bytesRecvSec: number;
  bytesSentSec: number;
  interfaceName: string;
}

export interface ContainerStats {
  id: string;
  name: string;
  image: string;
  state: string; // 'running', 'exited', etc.
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  netIO: {
    rx: number; // bytes received
    tx: number; // bytes sent
  };
  blockIO: {
    read: number; // bytes read from disk
    write: number; // bytes written to disk
  };
}

export interface TelemetryPayload {
  os: OsStats;
  cpu: CpuStats;
  memory: MemoryStats;
  disk: DiskStats;
  network: NetworkStats;
  docker: ContainerStats[]; // Array of containers
  uptimeSeconds: number;
  timestamp: string;
}
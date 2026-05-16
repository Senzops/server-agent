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
  name: string; // The mount point (e.g., '/', '/mnt/data')
}

export interface NetworkStats {
  bytesRecvSec: number;
  bytesSentSec: number;
  interfaceName: string;
  latencyMs: number;
}

export interface ContainerStats {
  id: string;
  name: string;
  image: string;
  state: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  netIO: { rx: number; wx: number; };
  blockIO: { read: number; write: number; };
}

export interface ProcessStats {
  total: number;
  running: number;
  blocked: number;
  sleeping: number;
}

export interface NginxStats {
  activeConnections: number;
  accepts: number;
  handled: number;
  requests: number;
  reading: number;
  writing: number;
  waiting: number;
  reqPerSec: number;
}

export interface TraefikComponentStats {
  total: number;
  active: number;
  failed: number;
}

export interface TraefikStats {
  uptimeSeconds?: number;
  routers: TraefikComponentStats;
  services: TraefikComponentStats;
  middlewares: TraefikComponentStats;
}

// --- HARDWARE METRICS ---
export interface HardwareStats {
  temperature: number; // Celsius
  powerDraw: number;   // Watts (if accessible by IPMI/Sensors)
}

export interface GpuStats {
  id: string;
  model: string;
  utilization: number;
  temperature: number;
  powerDraw: number;
  vramUsed: number;
  vramTotal: number;
}

export interface TelemetryPayload {
  os: OsStats;
  cpu: CpuStats;
  memory: MemoryStats;
  disk: DiskStats[]; // Upgraded to Array for multi-disk
  hardware: HardwareStats;
  gpus: GpuStats[];
  network: NetworkStats;
  processes: ProcessStats;
  docker: ContainerStats[];
  uptimeSeconds: number;
  timestamp: string;

  // Integrations Data
  nginx?: NginxStats | null;
  traefik?: TraefikStats | null;

  // Feature Flags
  terminalEnabled: boolean;
}
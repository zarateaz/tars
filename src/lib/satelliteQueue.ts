/**
 * TARS // GROUND SATELLITE QUEUE
 * Bridges cloud VPS central intelligence with local hardware (Laptop Hyprland, Audio & Smart TV LAN).
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SATELLITE_QUEUE_FILE = path.join(ROOT, "satellite_commands.json");
const SATELLITE_STATUS_FILE = path.join(ROOT, "satellite_status.json");

export interface SatelliteCommand {
  id: string;
  action: string;
  payload?: Record<string, any>;
  createdAt: string;
}

export interface SatelliteTelemetry {
  nodeName: string;
  hostname: string;
  ip: string;
  os: string;
  desktop: string;
  cpuPct: number;
  ramFreeMb: number;
  ramTotalMb: number;
  batteryPct?: number;
  tvConnected: boolean;
  lanUrl?: string;
  lastHeartbeat: string;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeJson(file: string, data: unknown): void {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    /* ignore */
  }
}

export function enqueueSatelliteCommand(action: string, payload?: Record<string, any>): SatelliteCommand {
  const queue = readJson<SatelliteCommand[]>(SATELLITE_QUEUE_FILE, []);
  // Movimientos de trackpad seguidos se suman en uno (evita colas de cientos de eventos)
  const last = queue[queue.length - 1];
  if (
    action === "input" && payload?.action === "move" &&
    last && last.action === "input" && last.payload?.action === "move" && last.payload?.target === payload?.target
  ) {
    last.payload.dx = Number(last.payload.dx || 0) + Number(payload.dx || 0);
    last.payload.dy = Number(last.payload.dy || 0) + Number(payload.dy || 0);
    writeJson(SATELLITE_QUEUE_FILE, queue);
    return last;
  }
  const cmd: SatelliteCommand = {
    id: `sat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action,
    payload,
    createdAt: new Date().toISOString(),
  };
  queue.push(cmd);
  writeJson(SATELLITE_QUEUE_FILE, queue.slice(-80));
  return cmd;
}

export function drainSatelliteCommands(): SatelliteCommand[] {
  const queue = readJson<SatelliteCommand[]>(SATELLITE_QUEUE_FILE, []);
  if (queue.length > 0) {
    writeJson(SATELLITE_QUEUE_FILE, []);
  }
  return queue;
}

export function saveSatelliteTelemetry(telemetry: SatelliteTelemetry): void {
  writeJson(SATELLITE_STATUS_FILE, telemetry);
}

export function getSatelliteTelemetry(): SatelliteTelemetry | null {
  return readJson<SatelliteTelemetry | null>(SATELLITE_STATUS_FILE, null);
}

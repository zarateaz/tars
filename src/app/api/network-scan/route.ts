import { NextResponse } from "next/server";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface LanDevice {
  ip: string;
  mac: string;
  state: string;
  dev: string;
  label: string;
}

const KNOWN_LABELS: Record<string, string> = {
  "192.168.1.1": "Router / Gateway Principal",
  "192.168.1.35": "Laptop Garuda Linux (Core)",
  "192.168.1.54": "Smart TV",
};

function labelForIp(ip: string): string {
  return KNOWN_LABELS[ip] || "Dispositivo en Red Local";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  try {
    const map = new Map<string, LanDevice>();

    // 1. Parse /proc/net/arp
    if (fs.existsSync("/proc/net/arp")) {
      const lines = fs.readFileSync("/proc/net/arp", "utf-8").split("\n").slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          const ip = parts[0];
          const flags = parts[2];
          const mac = parts[3];
          const dev = parts[5];
          if (ip && mac && mac !== "00:00:00:00:00:00") {
            map.set(ip, {
              ip,
              mac: mac.toUpperCase(),
              state: flags === "0x2" ? "REACHABLE" : "STALE",
              dev,
              label: labelForIp(ip),
            });
          }
        }
      }
    }

    // 2. Enrich / override with `ip neigh show`
    try {
      const { stdout } = await execFileAsync("/usr/bin/ip", ["neigh", "show"], { timeout: 3000 });
      for (const line of stdout.split("\n")) {
        const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+dev\s+(\S+)(?:\s+lladdr\s+([0-9a-fA-F:]+))?.*\b(REACHABLE|STALE|DELAY|PROBE|PERMANENT|FAILED)\b/);
        if (m) {
          const ip = m[1];
          const dev = m[2];
          const mac = (m[3] || "DESCONOCIDA").toUpperCase();
          const state = m[4];
          if (state === "FAILED") continue;
          map.set(ip, { ip, mac, state, dev, label: labelForIp(ip) });
        }
      }
    } catch {
      /* ignore */
    }

    // Always include local Laptop Core node
    if (!map.has("192.168.1.35")) {
      map.set("192.168.1.35", {
        ip: "192.168.1.35",
        mac: "LOCAL",
        state: "ONLINE",
        dev: "wlp2s0",
        label: "Laptop Garuda Linux (Core)",
      });
    }

    const devices = Array.from(map.values()).sort((a, b) => {
      const na = a.ip.split(".").map(Number);
      const nb = b.ip.split(".").map(Number);
      for (let i = 0; i < 4; i++) {
        if ((na[i] || 0) !== (nb[i] || 0)) return (na[i] || 0) - (nb[i] || 0);
      }
      return 0;
    });

    return NextResponse.json({ success: true, count: devices.length, devices });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "lock") {
      try {
        await execFileAsync("/usr/bin/loginctl", ["lock-session"], { timeout: 3000 });
      } catch {
        await execFileAsync("/usr/bin/loginctl", ["lock-sessions"], { timeout: 3000 });
      }
      return NextResponse.json({
        success: true,
        message: "Sesión de Garuda Linux bloqueada por Protocolo Escudo.",
      });
    }
    return NextResponse.json({ success: false, error: "Acción no reconocida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

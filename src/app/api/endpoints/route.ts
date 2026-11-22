import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";

export async function GET() {
  const tunnelFile = path.join(process.cwd(), "public", "tunnel_info.json");
  let data: Record<string, unknown> = {};

  if (fs.existsSync(tunnelFile)) {
    try {
      data = JSON.parse(fs.readFileSync(tunnelFile, "utf-8"));
    } catch {}
  }

  // Get current local IP from network interfaces
  const ifaces = os.networkInterfaces();
  let detectedIp = "127.0.0.1";
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        detectedIp = net.address;
        break;
      }
    }
    if (detectedIp !== "127.0.0.1") break;
  }

  const tunnelUrl = String(data.tunnelUrl || "https://cabinets-consolidation-terrace-bytes.trycloudflare.com");

  return NextResponse.json(
    {
      status: "online",
      localIp: detectedIp,
      tunnelUrl,
      isChamba: detectedIp.startsWith("192.168.100."),
      isCasa: detectedIp.startsWith("192.168.1."),
      candidates: [
        `http://${detectedIp}:3000`,
        tunnelUrl,
        "http://192.168.100.184:3000",
        "http://192.168.1.35:3000",
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

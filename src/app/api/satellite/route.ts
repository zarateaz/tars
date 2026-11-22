import { NextResponse } from "next/server";
import { verifyStarkAuth } from "@/lib/config";
import {
  drainSatelliteCommands,
  saveSatelliteTelemetry,
  getSatelliteTelemetry,
  enqueueSatelliteCommand,
} from "@/lib/satelliteQueue";
import { wantedSources, isInteractive, storeFrame } from "@/lib/liveRelay";

export async function GET(req: Request) {
  if (!verifyStarkAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized: Invalid TARS Auth Token" }, { status: 401 });
  }

  // Drain pending commands for the ground satellite laptop
  const pendingCommands = drainSatelliteCommands();
  const telemetry = getSatelliteTelemetry();

  return NextResponse.json({
    success: true,
    serverTime: new Date().toISOString(),
    commands: pendingCommands,
    latestTelemetry: telemetry,
    vision: wantedSources(),       // fuentes que el teléfono está mirando ahora
    interactive: isInteractive(),  // consultar más rápido (trackpad / vista en vivo)
  });
}

export async function POST(req: Request) {
  if (!verifyStarkAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized: Invalid TARS Auth Token" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // 1. If laptop is reporting telemetry / heartbeat
    if (body.telemetry) {
      saveSatelliteTelemetry({
        ...body.telemetry,
        lastHeartbeat: new Date().toISOString(),
      });
    }

    // 1b. Fotograma en vivo subido por la laptop
    if (body.frame && typeof body.frame === "object") {
      const ok = storeFrame(String(body.frame.source || ""), String(body.frame.image || ""), Number(body.frame.width) || 0, Number(body.frame.height) || 0);
      return NextResponse.json({ success: ok });
    }

    // 2. If enqueueing a new command from external source or web UI
    if (body.action) {
      const enqueued = enqueueSatelliteCommand(body.action, body.payload);
      return NextResponse.json({ success: true, enqueued });
    }

    return NextResponse.json({ success: true, message: "Satellite state updated" });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

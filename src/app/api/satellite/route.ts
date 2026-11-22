import { NextResponse } from "next/server";
import { verifyStarkAuth } from "@/lib/config";
import {
  drainSatelliteCommands,
  saveSatelliteTelemetry,
  getSatelliteTelemetry,
  enqueueSatelliteCommand,
} from "@/lib/satelliteQueue";

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

import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { announceIncomingNotification } from "@/lib/phoneLink";

const execFileAsync = promisify(execFile);

const TRAP_STATE_FILE = path.join(process.cwd(), "sentinel_trap.json");
const PHOTO_DIR = path.join(os.homedir(), "Imágenes", "Jearvis");

interface TrapState {
  armed: boolean;
  armedAt?: string;
  lastTriggerAt?: string;
  lastCaptureFile?: string;
}

function readState(): TrapState {
  try {
    if (fs.existsSync(TRAP_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(TRAP_STATE_FILE, "utf-8"));
    }
  } catch {
    /* ignore */
  }
  return { armed: false };
}

function writeState(data: TrapState): void {
  try {
    fs.writeFileSync(TRAP_STATE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    /* ignore */
  }
}

async function captureIntruderFrame(): Promise<string | null> {
  if (!fs.existsSync(PHOTO_DIR)) {
    fs.mkdirSync(PHOTO_DIR, { recursive: true });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(PHOTO_DIR, `intruso_${stamp}.jpg`);

  try {
    await execFileAsync(
      "/usr/bin/ffmpeg",
      [
        "-loglevel",
        "error",
        "-f",
        "v4l2",
        "-video_size",
        "640x480",
        "-i",
        "/dev/video0",
        "-frames:v",
        "1",
        "-y",
        filePath,
      ],
      { timeout: 5000 }
    );
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      return filePath;
    }
  } catch {
    /* fallback to grim if webcam is busy */
    try {
      await execFileAsync(
        "/usr/bin/grim",
        ["-t", "jpeg", "-q", "75", filePath],
        {
          env: {
            ...process.env,
            DISPLAY: ":0",
            WAYLAND_DISPLAY: "wayland-1",
            XDG_RUNTIME_DIR: `/run/user/${process.getuid?.() ?? 1000}`,
          },
          timeout: 3000,
        }
      );
      if (fs.existsSync(filePath)) return filePath;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  const state = readState();
  return NextResponse.json({ success: true, ...state });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body.action || "").toLowerCase().trim();
    const state = readState();

    if (action === "arm") {
      state.armed = true;
      state.armedAt = new Date().toISOString();
      writeState(state);
      return NextResponse.json({
        success: true,
        armed: true,
        reply: "Trampa Centinela Antirrobo armada. El sensor óptico vigilará cualquier interacción.",
      });
    }

    if (action === "disarm") {
      state.armed = false;
      writeState(state);
      return NextResponse.json({
        success: true,
        armed: false,
        reply: "Trampa Centinela desactivada.",
      });
    }

    if (action === "trigger" || action === "test") {
      const photoFile = await captureIntruderFrame();
      state.lastTriggerAt = new Date().toISOString();
      if (photoFile) state.lastCaptureFile = photoFile;
      writeState(state);

      announceIncomingNotification(
        "ALERTA CENTINELA",
        "Sensor Óptico Laptop",
        "¡Intruso detectado! Captura fotográfica almacenada en tu sistema."
      );

      let imageBase64 = "";
      if (photoFile && fs.existsSync(photoFile)) {
        imageBase64 = `data:image/jpeg;base64,${fs.readFileSync(photoFile).toString("base64")}`;
      }

      return NextResponse.json({
        success: true,
        triggered: true,
        photoFile,
        imageBase64,
        reply: "Alerta de intruso disparada: captura fotográfica guardada y enviada a tu teléfono.",
      });
    }

    return NextResponse.json({ success: false, error: "Acción desconocida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

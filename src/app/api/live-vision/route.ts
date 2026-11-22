import { IS_CLOUD } from "@/lib/system";
import { requestFrame, markInput } from "@/lib/liveRelay";
import { enqueueSatelliteCommand } from "@/lib/satelliteQueue";
import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { tvScreenshotBuffer, tvTap } from "@/lib/tvControl";

const execFileAsync = promisify(execFile);

const DESKTOP_ENV = {
  ...process.env,
  DISPLAY: process.env.DISPLAY || ":0",
  WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || "wayland-1",
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`,
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const source = (url.searchParams.get("source") || "screen").toLowerCase();

    // Nube: la imagen la captura y sube el satélite de la laptop
    if (IS_CLOUD) {
      const f = requestFrame(source);
      if (!f) {
        return NextResponse.json({
          success: false,
          waiting: true,
          error: "Esperando imagen de la laptop (¿está encendida con el satélite activo?)",
        });
      }
      // Solo enviar la imagen si es más nueva que la que ya tiene el teléfono (ahorra datos móviles)
      const since = Number(url.searchParams.get("since") || 0);
      if (since && f.ts <= since) {
        return NextResponse.json({ success: true, unchanged: true, source, timestamp: f.ts });
      }
      return NextResponse.json({ success: true, source, width: f.width, height: f.height, imageBase64: f.image, timestamp: f.ts });
    }

    if (source === "webcam") {
      const { stdout } = await execFileAsync(
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
          "-f",
          "image2pipe",
          "-vcodec",
          "mjpeg",
          "-",
        ],
        {
          encoding: "buffer",
          maxBuffer: 8 * 1024 * 1024,
          timeout: 4500,
        }
      );

      return NextResponse.json({
        success: true,
        source: "webcam",
        width: 640,
        height: 480,
        imageBase64: `data:image/jpeg;base64,${Buffer.from(stdout).toString("base64")}`,
        timestamp: Date.now(),
      });
    }

    if (source === "tv") {
      const buf = await tvScreenshotBuffer();
      if (!buf || buf.length === 0) {
        return NextResponse.json({ success: false, error: "No se pudo capturar la TV" }, { status: 502 });
      }
      return NextResponse.json({
        success: true,
        source: "tv",
        width: 1280,
        height: 720,
        imageBase64: `data:image/jpeg;base64,${buf.toString("base64")}`,
        timestamp: Date.now(),
      });
    }

    const { stdout } = await execFileAsync(
      "/usr/bin/grim",
      ["-s", "0.5", "-t", "jpeg", "-q", "62", "-"],
      {
        env: DESKTOP_ENV,
        encoding: "buffer",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 3000,
      }
    );

    return NextResponse.json({
      success: true,
      source: "screen",
      width: 1920,
      height: 1080,
      imageBase64: `data:image/jpeg;base64,${Buffer.from(stdout).toString("base64")}`,
      timestamp: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const xNorm = Number(body.xNorm);
    const yNorm = Number(body.yNorm);
    if (Number.isNaN(xNorm) || Number.isNaN(yNorm)) {
      return NextResponse.json({ success: false, error: "Coordenadas inválidas" }, { status: 400 });
    }

    if (IS_CLOUD) {
      markInput();
      enqueueSatelliteCommand("input", {
        action: "tap",
        target: body.target === "tv" ? "tv" : "pc",
        xNorm: Math.max(0, Math.min(1, xNorm)),
        yNorm: Math.max(0, Math.min(1, yNorm)),
        button: body.button === "right" ? "right" : "left",
      });
      return NextResponse.json({ success: true, queued: true });
    }

    if (body.target === "tv") {
      const rep = await tvTap(xNorm, yNorm);
      return NextResponse.json({ success: true, target: "tv", xNorm, yNorm, output: rep });
    }

    const x = Math.max(0, Math.min(1919, Math.round(xNorm * 1920)));
    const y = Math.max(0, Math.min(1079, Math.round(yNorm * 1080)));
    const btn = body.button === "right" ? "3" : "1";
    const mouseKey = body.button === "right" ? "mouse:273" : "mouse:272";

    try {
      await execFileAsync("/usr/bin/hyprctl", ["dispatch", "movecursor", `${x} ${y}`], {
        env: DESKTOP_ENV,
        timeout: 1000,
      });
      await execFileAsync("/usr/bin/hyprctl", ["dispatch", "sendshortcut", `none, ${mouseKey}, activewindow`], {
        env: DESKTOP_ENV,
        timeout: 1000,
      });
      return NextResponse.json({ success: true, x, y, button: btn });
    } catch {
      await execFileAsync("/usr/bin/xdotool", ["mousemove", String(x), String(y), "click", btn], {
        env: DESKTOP_ENV,
        timeout: 1500,
      }).catch(() => {});
      return NextResponse.json({ success: true, x, y, button: btn });
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

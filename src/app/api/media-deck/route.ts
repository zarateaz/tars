import { NextResponse } from "next/server";
import { execFile, spawn } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const AUDIO_ENV = {
  ...process.env,
  DISPLAY: process.env.DISPLAY || ":0",
  WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || "wayland-1",
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`,
  DBUS_SESSION_BUS_ADDRESS:
    process.env.DBUS_SESSION_BUS_ADDRESS || `unix:path=/run/user/${process.getuid?.() ?? 1000}/bus`,
};

async function readMediaState() {
  let status = "Stopped";
  let track = "Sin reproducción activa";
  let volumePct = 70;
  let muted = false;

  try {
    const { stdout } = await execFileAsync("/usr/bin/playerctl", ["status"], {
      env: AUDIO_ENV,
      timeout: 1500,
    });
    if (stdout.trim()) status = stdout.trim();
  } catch {
    /* no active MPRIS player */
  }

  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/playerctl",
      ["metadata", "--format", "{{artist}} — {{title}}"],
      { env: AUDIO_ENV, timeout: 1500 }
    );
    const cleaned = stdout.trim().replace(/^—\s*$/, "");
    if (cleaned) track = cleaned;
  } catch {
    /* ignore */
  }

  try {
    const { stdout } = await execFileAsync("/usr/bin/wpctl", ["get-volume", "@DEFAULT_AUDIO_SINK@"], {
      env: AUDIO_ENV,
      timeout: 1500,
    });
    const m = stdout.match(/Volume:\s*([0-9.]+)/i);
    if (m) volumePct = Math.round(parseFloat(m[1]) * 100);
    muted = /\[MUTED\]/i.test(stdout);
  } catch {
    /* ignore */
  }

  return { success: true, status, track, volumePct, muted };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  try {
    return NextResponse.json(await readMediaState());
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body.action || "").toLowerCase();

    if (action === "play-pause" || action === "next" || action === "previous") {
      try {
        await execFileAsync("/usr/bin/playerctl", [action], { env: AUDIO_ENV, timeout: 2000 });
      } catch {
        /* ignore if no player */
      }
    } else if (action === "mute") {
      await execFileAsync("/usr/bin/wpctl", ["set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"], {
        env: AUDIO_ENV,
        timeout: 2000,
      });
    } else if (action === "volume") {
      const val = Math.max(0, Math.min(150, Math.round(Number(body.value ?? 80))));
      await execFileAsync("/usr/bin/wpctl", ["set-volume", "@DEFAULT_AUDIO_SINK@", (val / 100).toFixed(2)], {
        env: AUDIO_ENV,
        timeout: 2000,
      });
    } else if (action === "play-yt" && typeof body.query === "string" && body.query.trim()) {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(body.query.trim())}`;
      spawn("/usr/bin/xdg-open", [url], { env: AUDIO_ENV, detached: true, stdio: "ignore" }).unref();
    } else {
      return NextResponse.json({ success: false, error: "Acción multimedia no válida" }, { status: 400 });
    }

    const state = await readMediaState();
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

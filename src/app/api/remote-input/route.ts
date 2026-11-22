import { IS_CLOUD } from "@/lib/system";
import { markInput } from "@/lib/liveRelay";
import { enqueueSatelliteCommand } from "@/lib/satelliteQueue";
import { NextResponse } from "next/server";
import fs from "fs";
import net from "net";
import { spawn } from "child_process";
import { tvSendDpad, tvTypeText, tvTap } from "@/lib/tvControl";

function getHyprlandSocketPath(): string | null {
  const runtimeDir = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`;
  const sig = process.env.HYPRLAND_INSTANCE_SIGNATURE;
  if (sig) {
    const p = `${runtimeDir}/hypr/${sig}/.socket.sock`;
    if (fs.existsSync(p)) return p;
  }
  try {
    const hyprDir = `${runtimeDir}/hypr`;
    if (fs.existsSync(hyprDir)) {
      const dirs = fs.readdirSync(hyprDir);
      for (const d of dirs) {
        const candidate = `${hyprDir}/${d}/.socket.sock`;
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function sendHyprlandSocket(cmd: string): Promise<string> {
  const sockPath = getHyprlandSocketPath();
  if (!sockPath) return Promise.reject(new Error("No Hyprland socket found"));

  return new Promise((resolve, reject) => {
    const client = net.createConnection(sockPath, () => {
      client.write(cmd);
    });
    let data = "";
    client.on("data", (chunk) => {
      data += chunk.toString();
    });
    client.on("end", () => {
      resolve(data.trim());
    });
    client.on("error", (err) => {
      reject(err);
    });
    client.setTimeout(250, () => {
      client.destroy();
      resolve(data.trim());
    });
  });
}

let lastCursorX = 960;
let lastCursorY = 540;
let lastSyncTime = 0;

async function syncCursorPosition(): Promise<[number, number]> {
  const now = Date.now();
  if (now - lastSyncTime > 1500) {
    try {
      const resp = await sendHyprlandSocket("cursorpos");
      const parts = resp.split(",");
      if (parts.length >= 2) {
        const x = parseInt(parts[0].trim(), 10);
        const y = parseInt(parts[1].trim(), 10);
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
          lastCursorX = x;
          lastCursorY = y;
          lastSyncTime = now;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [lastCursorX, lastCursorY];
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body.action || "").toLowerCase();
    const target = String(body.target || "pc").toLowerCase();

    // Nube: el mouse/teclado/TV se ejecutan en la laptop vía satélite
    if (IS_CLOUD) {
      const allowed = ["move", "click", "rclick", "scroll", "type", "key", "dpad", "tap", "touch_start", "sync_cursor"];
      if (!allowed.includes(action)) {
        return NextResponse.json({ success: false, error: "Acción de entrada no válida" }, { status: 400 });
      }
      markInput();
      if (action === "touch_start" || action === "sync_cursor") {
        return NextResponse.json({ success: true, relay: true });
      }
      enqueueSatelliteCommand("input", {
        action,
        target: target === "tv" ? "tv" : "pc",
        dx: Math.round(Number(body.dx || 0)),
        dy: Math.round(Number(body.dy || 0)),
        key: typeof body.key === "string" ? body.key.slice(0, 32) : undefined,
        text: typeof body.text === "string" ? body.text.slice(0, 500) : undefined,
        x: body.x !== undefined ? Number(body.x) : undefined,
        y: body.y !== undefined ? Number(body.y) : undefined,
      });
      return NextResponse.json({ success: true, queued: true });
    }

    // 1. Control de Smart TV TCL
    if (target === "tv") {
      if (action === "dpad" || action === "key") {
        const key = String(body.key || "select");
        await tvSendDpad(key);
        return NextResponse.json({ success: true, target: "tv", action, key });
      }
      if (action === "type" && typeof body.text === "string") {
        await tvTypeText(body.text);
        return NextResponse.json({ success: true, target: "tv", action: "type", text: body.text });
      }
      if (action === "tap" || action === "click") {
        const x = Number(body.x ?? 0.5);
        const y = Number(body.y ?? 0.5);
        await tvTap(x, y);
        return NextResponse.json({ success: true, target: "tv", action: "tap", x, y });
      }
      return NextResponse.json({ success: false, error: "Acción de TV no reconocida" }, { status: 400 });
    }

    // 2. Control Ultra-Rápido de Laptop (Direct Hyprland Socket ~0.2ms)
    if (action === "touch_start" || action === "sync_cursor") {
      lastSyncTime = 0; // Forzar sync inmediato
      const [cx, cy] = await syncCursorPosition();
      return NextResponse.json({ success: true, x: cx, y: cy });
    }

    if (action === "move") {
      const dx = Math.round(Number(body.dx || 0));
      const dy = Math.round(Number(body.dy || 0));
      if (dx !== 0 || dy !== 0) {
        const [curX, curY] = await syncCursorPosition();
        const nx = Math.max(0, Math.min(1919, curX + dx));
        const ny = Math.max(0, Math.min(1079, curY + dy));
        lastCursorX = nx;
        lastCursorY = ny;

        try {
          await sendHyprlandSocket(`dispatch movecursor ${nx} ${ny}`);
        } catch {
          /* fallback */
        }
      }
      return NextResponse.json({ success: true, x: lastCursorX, y: lastCursorY });
    }

    if (action === "click") {
      try {
        await sendHyprlandSocket("dispatch sendshortcut none, mouse:272, activewindow");
      } catch {
        /* fallback */
      }
      return NextResponse.json({ success: true, button: "left" });
    }

    if (action === "rclick") {
      try {
        await sendHyprlandSocket("dispatch sendshortcut none, mouse:273, activewindow");
      } catch {
        /* fallback */
      }
      return NextResponse.json({ success: true, button: "right" });
    }

    if (action === "scroll") {
      const dy = Number(body.dy || 0);
      const btn = dy > 0 ? "mouse_down" : "mouse_up";
      try {
        await sendHyprlandSocket(`dispatch sendshortcut none, ${btn}, activewindow`);
      } catch {
        /* fallback */
      }
      return NextResponse.json({ success: true, dy });
    }

    if (action === "type" && typeof body.text === "string" && body.text.length > 0) {
      try {
        const cp = spawn("/usr/bin/wl-copy", [body.text]);
        await new Promise((res) => cp.on("close", res));
        await sendHyprlandSocket("dispatch sendshortcut CTRL, v, activewindow");
      } catch {
        /* fallback */
      }
      return NextResponse.json({ success: true, text: body.text });
    }

    if (action === "key" && typeof body.key === "string" && /^[A-Za-z0-9_:]{1,32}$/.test(body.key)) {
      try {
        await sendHyprlandSocket(`dispatch sendshortcut none, ${body.key}, activewindow`);
      } catch {
        /* fallback */
      }
      return NextResponse.json({ success: true, key: body.key });
    }

    return NextResponse.json({ success: false, error: "Acción de entrada no válida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const AIRDROP_DIR = path.join(os.homedir(), "Descargas", "StarkAirDrop");
const PHOTO_DIR = path.join(os.homedir(), "Imágenes", "Jearvis");
const DOWNLOADS_DIR = path.join(os.homedir(), "Descargas");

const DESKTOP_ENV = {
  ...process.env,
  DISPLAY: process.env.DISPLAY || ":0",
  WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || "wayland-1",
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`,
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

async function readLaptopClipboard(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/wl-paste", ["--no-newline"], {
      env: DESKTOP_ENV,
      timeout: 2000,
    });
    return stdout;
  } catch {
    try {
      const { stdout } = await execFileAsync("/usr/bin/xclip", ["-selection", "clipboard", "-o"], {
        env: DESKTOP_ENV,
        timeout: 2000,
      });
      return stdout;
    } catch {
      return "";
    }
  }
}

async function writeLaptopClipboard(text: string): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      const p = spawn("/usr/bin/wl-copy", [], { env: DESKTOP_ENV, stdio: ["pipe", "ignore", "ignore"] });
      p.stdin.write(text);
      p.stdin.end();
      p.on("close", () => resolve());
      p.on("error", () => resolve());
    } catch {
      resolve();
    }
  });
  await new Promise<void>((resolve) => {
    try {
      const p = spawn("/usr/bin/xclip", ["-selection", "clipboard"], {
        env: DESKTOP_ENV,
        stdio: ["pipe", "ignore", "ignore"],
      });
      p.stdin.write(text);
      p.stdin.end();
      p.on("close", () => resolve());
      p.on("error", () => resolve());
    } catch {
      resolve();
    }
  });
}

function listRecentFiles(): Array<{ name: string; size: number; mtime: number; folder: string }> {
  const results: Array<{ name: string; size: number; mtime: number; folder: string }> = [];
  const seen = new Set<string>();
  const dirs = [
    { dir: AIRDROP_DIR, label: "StarkAirDrop" },
    { dir: PHOTO_DIR, label: "Jearvis" },
    { dir: DOWNLOADS_DIR, label: "Descargas" },
  ];
  for (const d of dirs) {
    if (!fs.existsSync(d.dir)) continue;
    try {
      for (const entry of fs.readdirSync(d.dir)) {
        if (entry.startsWith(".")) continue;
        if (seen.has(entry)) continue;
        const full = path.join(d.dir, entry);
        try {
          const st = fs.statSync(full);
          if (st.isFile()) {
            seen.add(entry);
            results.push({ name: entry, size: st.size, mtime: st.mtimeMs, folder: d.label });
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
  results.sort((a, b) => b.mtime - a.mtime);
  return results.slice(0, 15);
}

function resolveDownloadFile(filename: string): string | null {
  const safeName = path.basename(filename);
  if (!safeName || safeName === "." || safeName === "..") return null;
  for (const dir of [AIRDROP_DIR, PHOTO_DIR, DOWNLOADS_DIR]) {
    const candidate = path.join(dir, safeName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const download = url.searchParams.get("download");
    if (download) {
      const filePath = resolveDownloadFile(download);
      if (!filePath) {
        return NextResponse.json({ success: false, error: "Archivo no encontrado" }, { status: 404 });
      }
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".pdf": "application/pdf",
        ".txt": "text/plain; charset=utf-8",
        ".zip": "application/zip",
        ".apk": "application/vnd.android.package-archive",
      };
      const contentType = mimeMap[ext] || "application/octet-stream";
      return new NextResponse(data, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${path.basename(filePath)}"`,
        },
      });
    }

    const clipboardText = await readLaptopClipboard();
    const files = listRecentFiles();
    return NextResponse.json({ success: true, clipboardText, files });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "set_clipboard" && typeof body.text === "string") {
      await writeLaptopClipboard(body.text);
      try {
        spawn(
          "notify-send",
          ["-a", "TARS", "📋 Portapapeles TARS Sincronizado", body.text.slice(0, 120)],
          { detached: true, stdio: "ignore", env: DESKTOP_ENV }
        ).unref();
      } catch {
        /* ignore */
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === "send_file" && body.filename && body.base64) {
      if (!fs.existsSync(AIRDROP_DIR)) fs.mkdirSync(AIRDROP_DIR, { recursive: true });
      const safeName = path.basename(String(body.filename)).replace(/[^a-zA-Z0-9._-]/g, "_");
      const target = path.join(AIRDROP_DIR, safeName || `archivo_${Date.now()}`);
      const rawB64 = String(body.base64).replace(/^data:[^;]+;base64,/, "");
      fs.writeFileSync(target, Buffer.from(rawB64, "base64"));

      try {
        spawn("xdg-open", [target], { detached: true, stdio: "ignore", env: DESKTOP_ENV }).unref();
        spawn(
          "notify-send",
          ["-a", "TARS", "📥 AirDrop TARS Recibido", `Guardado en ${target}`],
          { detached: true, stdio: "ignore", env: DESKTOP_ENV }
        ).unref();
      } catch {
        /* ignore */
      }
      return NextResponse.json({ success: true, path: target });
    }

    return NextResponse.json({ success: false, error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

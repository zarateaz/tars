import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);
const FLUSH_FILE = "/tmp/jarvis_flush_mic";
const TV_SERIAL = "192.168.1.54:5555";
const DAEMON_URL = "http://127.0.0.1:8001";

export async function PUT() {
  try {
    fs.writeFileSync(FLUSH_FILE, "1");
    fetch(`${DAEMON_URL}/record`, { method: "PUT" }).catch(() => {});
    return NextResponse.json({ flushed: true });
  } catch (err) {
    return NextResponse.json({ flushed: false, error: String(err) });
  }
}

/**
 * Captura de voz de respuesta inmediata:
 * - Usa el demonio persistente `audio_daemon.py` en 127.0.0.1:8001 (0 ms de arranque de Python/C-extensions, stream en ~15 ms).
 * - Calibra hardware ALSA Capture en paso 44/63 (+8.25 dB limpios sin saturación de +30 dB) y PipeWire en 22% (0.22).
 * - Si el demonio no está activo aún, lo levanta en segundo plano y usa fallback directo.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const duck = url.searchParams.get("duck") === "1";

  // 1. Camino ultra-rápido: Demonio persistente de audio en memoria (0 ms cold start)
  try {
    const res = await fetch(`${DAEMON_URL}/record?duck=${duck ? "1" : "0"}`, {
      method: "POST",
      signal: AbortSignal.timeout(16000),
    });
    if (res.ok) {
      const data = await res.json();
      const text = String(data.text || "").trim();
      return NextResponse.json({ ...data, success: Boolean(text), text });
    }
  } catch {
    // Auto-iniciar el demonio si no estaba corriendo
    try {
      const venvPython = path.join(process.cwd(), ".venv", "bin", "python");
      const pyBin = fs.existsSync(venvPython) ? venvPython : "python3";
      const daemonScript = path.join(process.cwd(), "audio_daemon.py");
      if (fs.existsSync(daemonScript)) {
        const child = execFile(pyBin, [daemonScript]);
        child.unref();
      }
    } catch {
      // ignore
    }
  }

  // 2. Fallback directo si el demonio apenas está iniciando
  try {
    try {
      if (fs.existsSync(FLUSH_FILE)) fs.unlinkSync(FLUSH_FILE);
    } catch {
      // ignore
    }

    const venvPython = path.join(process.cwd(), ".venv", "bin", "python");
    const pyBin = fs.existsSync(venvPython) ? venvPython : "python3";
    const script = `
import audio_daemon
import json
res = audio_daemon._capture_and_transcribe_sync(duck=${duck ? "True" : "False"})
print(json.dumps(res, ensure_ascii=False))
`;
    const { stdout } = await execFileAsync(pyBin, ["-c", script], {
      cwd: process.cwd(),
      timeout: 18000,
    });
    const lines = stdout.trim().split("\n").filter(Boolean);
    let parsed: { text?: string; [k: string]: unknown } = {};
    try {
      parsed = JSON.parse(lines[lines.length - 1] || "{}");
    } catch {
      parsed = { text: "" };
    }
    const text = String(parsed.text || "").trim();
    return NextResponse.json({ ...parsed, success: Boolean(text), text });
  } catch (err) {
    if (duck) {
      execFile("playerctl", ["play"], () => {});
      execFile("adb", ["-s", TV_SERIAL, "shell", "input keyevent 126"], () => {});
    }
    return NextResponse.json({ success: false, text: "", error: String(err) });
  }
}

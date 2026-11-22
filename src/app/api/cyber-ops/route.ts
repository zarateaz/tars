import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { CLI_ALLOWED } from "@/lib/system";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(\s|$|\*)/i,
  /\bmkfs(\.[a-z0-9]+)?\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{\s*:\|\:\s*&\s*\}\s*;:/,
  />\s*\/dev\/sd[a-z]/i,
];

function trimOutput(text: string, limit = 4500): string {
  const clean = text.trim();
  if (clean.length <= limit) return clean || "(sin salida)";
  return `${clean.slice(0, limit)}\n...[salida truncada]`;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body.action || "shell").toLowerCase();

    if (action === "ports") {
      const [ssRes, upRes, unRes] = await Promise.all([
        execFileAsync("/usr/bin/ss", ["-tulnp"], { timeout: 3000 }).catch((e) => ({
          stdout: e.stdout || "",
          stderr: e.stderr || String(e),
        })),
        execFileAsync("/usr/bin/uptime", ["-p"], { timeout: 2000 }).catch(() => ({ stdout: "", stderr: "" })),
        execFileAsync("/usr/bin/uname", ["-sr"], { timeout: 2000 }).catch(() => ({ stdout: "", stderr: "" })),
      ]);

      const combined = [
        `KERNEL: ${String(unRes.stdout || "").trim()} | UPTIME: ${String(upRes.stdout || "").trim()}`,
        "--- PUERTOS EN ESCUCHA (ss -tulnp) ---",
        String(ssRes.stdout || ssRes.stderr || ""),
      ].join("\n");

      return NextResponse.json({ success: true, action: "ports", output: trimOutput(combined, 4000) });
    }

    if (action === "nmap") {
      const targetIp = String(body.targetIp || "192.168.1.1").trim();
      if (!/^[0-9a-zA-Z.:/-]+$/.test(targetIp)) {
        return NextResponse.json({ success: false, error: "IP objetivo inválida" }, { status: 400 });
      }
      try {
        const { stdout, stderr } = await execFileAsync(
          "/usr/bin/nmap",
          ["-F", "-T4", "--host-timeout", "6s", targetIp],
          { timeout: 8000, maxBuffer: 2 * 1024 * 1024 }
        );
        return NextResponse.json({
          success: true,
          action: "nmap",
          targetIp,
          output: trimOutput(`${stdout}\n${stderr}`, 4000),
        });
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return NextResponse.json({
          success: true,
          action: "nmap",
          targetIp,
          output: trimOutput(`${e.stdout || ""}\n${e.stderr || e.message || ""}`, 4000),
        });
      }
    }

    if (action === "shell") {
      if (!CLI_ALLOWED) {
        return NextResponse.json(
          { success: false, error: "Shell remota desactivada en este servidor (JARVIS_ALLOW_CLI=false)." },
          { status: 403 }
        );
      }
      const command = String(body.command || "").trim();
      if (!command) {
        return NextResponse.json({ success: false, error: "Comando vacío" }, { status: 400 });
      }
      if (BLOCKED_PATTERNS.some((rx) => rx.test(command))) {
        return NextResponse.json(
          { success: false, error: "Comando bloqueado por protocolo de seguridad TARS." },
          { status: 400 }
        );
      }

      try {
        const { stdout, stderr } = await execFileAsync("/bin/bash", ["-lc", command], {
          cwd: "/home/zarate",
          timeout: 8000,
          maxBuffer: 2 * 1024 * 1024,
        });
        return NextResponse.json({
          success: true,
          action: "shell",
          output: trimOutput(`${stdout}${stderr ? `\n[STDERR]\n${stderr}` : ""}`, 4500),
        });
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return NextResponse.json({
          success: true,
          action: "shell",
          output: trimOutput(`${e.stdout || ""}${e.stderr ? `\n${e.stderr}` : ""}${!e.stdout && !e.stderr ? e.message || "" : ""}`, 4500),
        });
      }
    }

    return NextResponse.json({ success: false, error: "Acción cyber-ops no válida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

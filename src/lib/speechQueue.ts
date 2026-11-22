import { getSettings } from "./config";
import { applyVoiceFx } from "./tts";
/**
 * TARS // SEQUENTIAL SPEECH QUEUE (ANTI-DESMADRE ENGINE)
 * Guarantees that proactive audio alerts, notifications, and spoken replies
 * NEVER play simultaneously or overlap. Plays strictly one after the other with natural pacing.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

export interface SpeechQueueItem {
  id: string;
  text: string;
  title?: string;
  priority?: "normal" | "critical";
  pauseAfterMs?: number;
}

const ROOT = process.cwd();
const queue: SpeechQueueItem[] = [];
let isPlaying = false;
let currentMpvProcess: ReturnType<typeof spawn> | null = null;

export function enqueueSpeech(item: SpeechQueueItem): void {
  queue.push(item);
  processQueue();
}

export function clearSpeechQueue(): void {
  queue.length = 0;
  if (currentMpvProcess) {
    try {
      currentMpvProcess.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    currentMpvProcess = null;
  }
  isPlaying = false;
}

export function isSpeechQueueActive(): boolean {
  return isPlaying || queue.length > 0;
}

async function processQueue(): Promise<void> {
  if (isPlaying || queue.length === 0) return;
  isPlaying = true;

  const item = queue.shift()!;
  try {
    // 1. Optional desktop notification banner
    if (item.title) {
      try {
        spawn(
          "notify-send",
          ["-u", item.priority || "normal", "-a", "TARS", item.title, item.text],
          { detached: true, stdio: "ignore" }
        ).unref();
      } catch {
        /* ignore */
      }
    }

    // 2. Synthesize audio file via edge-tts or daemon
    const edge = path.join(ROOT, ".venv", "bin", "edge-tts");
    if (fs.existsSync(edge)) {
      const out = path.join(os.tmpdir(), `jarvis_queue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`);
      // Misma voz TARS que el resto (antes leía solo process.env e ignoraba el .env)
      const settings = getSettings();
      const voice = settings.voice;
      const pitch = settings.voicePitch;
      const rate = settings.voiceRate;

      // Natural speech cleaning
      const cleanText = item.text
        .replace(/[*_#~>|]/g, "")
        .replace(/\b(wsp|wasap|wsap)\b/gi, "WhatsApp")
        .replace(/\s+/g, " ")
        .trim();

      await new Promise<void>((resolve) => {
        const tts = spawn(
          edge,
          ["--voice", voice, `--pitch=${pitch}`, `--rate=${rate}`, "--text", cleanText, "--write-media", out],
          { stdio: "ignore" }
        );
        tts.on("close", () => resolve());
        tts.on("error", () => resolve());
      });

      if (fs.existsSync(out) && fs.statSync(out).size > 0) {
        await applyVoiceFx(out, settings.voiceFx);
        await new Promise<void>((resolve) => {
          const mpv = spawn("mpv", ["--no-video", "--really-quiet", out], { stdio: "ignore" });
          currentMpvProcess = mpv;
          mpv.on("close", () => {
            currentMpvProcess = null;
            try {
              fs.unlinkSync(out);
            } catch {
              /* ignore */
            }
            resolve();
          });
          mpv.on("error", () => {
            currentMpvProcess = null;
            resolve();
          });
        });
      }
    }

    // Natural inter-message pause (defaults to 750ms so sentences never blend together)
    const pause = item.pauseAfterMs ?? 750;
    if (pause > 0) {
      await new Promise((r) => setTimeout(r, pause));
    }
  } catch (err) {
    console.error("SpeechQueue error:", err);
  } finally {
    isPlaying = false;
    // Process next item in queue
    if (queue.length > 0) {
      setTimeout(processQueue, 50);
    }
  }
}

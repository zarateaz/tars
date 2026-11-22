import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { getSettings } from "./config";

const execFileAsync = promisify(execFile);

export const AUDIO_CACHE_DIR = path.join(process.cwd(), "audio_cache");

if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

/**
 * Strips emojis so the TTS engine never reads out literal emoji names.
 */
function stripEmojis(text: string): string {
  return text.replace(
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu,
    ""
  );
}

/**
 * Normalizes text into natural spoken Latin American Spanish phonetics so the neural voice
 * sounds 100% human, warm, and fluent without robotic acronym spelling.
 */
export function normalizeForSpeech(raw: string): string {
  return stripEmojis(raw)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\bJ\.?E\.?A\.?R\.?V\.?I\.?S\.?\b/gi, "Tars")
    .replace(/\bJ\.?A\.?R\.?V\.?I\.?S\.?\b/gi, "Tars")
    .replace(/\bT\.A\.R\.S\.?|\bTARS\b/g, "Tars") // que no lo deletree "te-a-erre-ese"
    .replace(/\bde\s+una\b/gi, "enseguida")
    .replace(/\/home\/[a-zA-Z0-9_-]+\/([^\s,;:)"']+)/g, (_m, rel) => {
      const parts = String(rel).split("/").filter(Boolean);
      return parts.join(" ");
    })
    .replace(/\/home\/[a-zA-Z0-9_-]+\b/g, "tu carpeta personal")
    .replace(/\.html\b/gi, " punto html")
    .replace(/\.py\b/gi, " punto python")
    .replace(/\.tsx?\b/gi, " punto typescript")
    .replace(/\.jsx?\b/gi, " punto javascript")
    .replace(/\.json\b/gi, " punto json")
    .replace(/\.css\b/gi, " punto css")
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, "$1 por ciento")
    .replace(/(\d+(?:[.,]\d+)?)\s*GB\b/gi, "$1 gigas")
    .replace(/(\d+(?:[.,]\d+)?)\s*MB\b/gi, "$1 megas")
    .replace(/\bCLI\b/g, "terminal")
    .replace(/\bRAM\b/g, "memoria ram")
    .replace(/\bCPU\b/g, "procesador")
    .replace(/\bNVMe\b/gi, "disco sólido")
    .replace(/\bURL\b/g, "enlace")
    .replace(/https?:\/\/[^\s)]+/g, "el enlace web")
    .replace(/file:\/\/[^\s)]+/g, "el navegador")
    .replace(/[*_#~>|]/g, "")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s*--\s*/g, ", ")
    // Replace triple dots with a soft comma pause so Edge-TTS doesn't make an awkward robotic stop
    .replace(/\.{2,}/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

async function synthesizeWithElevenLabs(
  cleanText: string,
  apiKey: string,
  voiceId: string
): Promise<string | null> {
  try {
    const hash = crypto
      .createHash("md5")
      .update(`eleven_${voiceId}_${cleanText}`)
      .digest("hex");
    const filename = `${hash}.mp3`;
    const filePath = path.join(AUDIO_CACHE_DIR, filename);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: cleanText,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.42,
              similarity_boost: 0.82,
              style: 0.35,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(arrayBuf));
    }

    return `/api/audio/${filename}`;
  } catch {
    return null;
  }
}

/**
 * Timbre TARS: voz grave y seca "dentro de un chasis metálico".
 *  - highpass/lowpass: banda de altavoz de robot
 *  - aecho con retardos de 7 y 12 ms: filtro peine = resonancia metálica corta (sin eco audible)
 *  - ecualización: cuerpo grave + presencia en 1.9 kHz (inteligibilidad)
 *  - compresión + limitador: voz pareja, sin picos ni saturación
 */
export const TARS_VOICE_FILTER =
  "highpass=f=110,lowpass=f=6500,aecho=0.8:0.55:7|12:0.28|0.18," +
  "equalizer=f=220:t=q:w=1:g=3,equalizer=f=1900:t=q:w=1.4:g=3.5," +
  "acompressor=threshold=-20dB:ratio=4:attack=5:release=80:makeup=2,volume=1.3,alimiter=limit=0.89";

/** Aplica el efecto de voz configurado. Si ffmpeg falla, se conserva la voz limpia (nunca queda sin audio). */
export async function applyVoiceFx(filePath: string, fx: string): Promise<void> {
  if (fx !== "tars") return;
  const tmp = `${filePath}.fx.mp3`;
  try {
    await execFileAsync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", filePath, "-af", TARS_VOICE_FILTER, "-ar", "24000", "-b:a", "64k", tmp],
      { timeout: 15000 }
    );
    if (fs.existsSync(tmp) && fs.statSync(tmp).size > 200) {
      fs.renameSync(tmp, filePath);
    }
  } catch (err) {
    console.error("[TTS] Efecto de voz TARS no aplicado:", err);
  } finally {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

export interface SynthesizeOptions {
  customVoice?: string;
  customRate?: string;
  customPitch?: string;
}

export async function synthesizeSpeech(
  text: string,
  customVoiceOrOpts?: string | SynthesizeOptions
): Promise<string | null> {
  try {
    const settings = getSettings();
    const opts: SynthesizeOptions =
      typeof customVoiceOrOpts === "string"
        ? { customVoice: customVoiceOrOpts }
        : customVoiceOrOpts || {};

    const cleanText = normalizeForSpeech(text);
    if (!cleanText) return null;

    if (settings.elevenlabsApiKey && !opts.customVoice) {
      const elevenUrl = await synthesizeWithElevenLabs(
        cleanText,
        settings.elevenlabsApiKey,
        settings.elevenlabsVoiceId
      );
      if (elevenUrl) return elevenUrl;
    }

    let voice = opts.customVoice || settings.voice || "es-MX-JorgeNeural";
    const rate = opts.customRate || settings.voiceRate || "-6%";
    const pitch = opts.customPitch || settings.voicePitch || "-12Hz";
    const fx = settings.voiceFx;

    const hash = crypto
      .createHash("md5")
      .update(`tars_${fx}_${voice}_${rate}_${pitch}_${cleanText}`)
      .digest("hex");
    const filename = `${hash}.mp3`;
    const filePath = path.join(AUDIO_CACHE_DIR, filename);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      let synthesizedByDaemon = false;
      try {
        const daemonRes = await fetch("http://127.0.0.1:8001/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: cleanText,
            voice,
            rate,
            pitch,
            output_path: filePath,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (daemonRes.ok) {
          const d = await daemonRes.json();
          if (d.success && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
            synthesizedByDaemon = true;
          }
        }
      } catch {
        // Fallback to CLI edge-tts below
      }

      if (!synthesizedByDaemon) {
        const isPiperVoice =
          voice.toLowerCase().includes("piper") ||
          voice.toLowerCase().includes("bettany") ||
          voice.toLowerCase().includes("davefx");

        if (isPiperVoice) {
          const piperBin = path.join(process.cwd(), ".venv", "bin", "piper");
          const modelName =
            voice.toLowerCase().includes("alan") ||
            voice.toLowerCase().includes("bettany") ||
            voice.toLowerCase().includes("en")
              ? "en_GB-alan-medium.onnx"
              : "es_ES-davefx-medium.onnx";
          const modelPath = path.join(process.cwd(), "models", "piper", modelName);

          if (fs.existsSync(piperBin) && fs.existsSync(modelPath)) {
            try {
              const cmd = `echo ${JSON.stringify(cleanText)} | ${piperBin} --model ${modelPath} --output-raw | /usr/bin/ffmpeg -y -f s16le -ar 22050 -ac 1 -i - -b:a 128k ${filePath}`;
              await execFileAsync("bash", ["-c", cmd], { timeout: 12000 });
              if (fs.existsSync(filePath) && fs.statSync(filePath).size > 100) {
                synthesizedByDaemon = true;
              }
            } catch {
              /* ignore and fallback to edge-tts */
            }
          }
        }

        if (!synthesizedByDaemon) {
          const edgeTtsBin = path.join(process.cwd(), ".venv", "bin", "edge-tts");
          const bin = fs.existsSync(edgeTtsBin) ? edgeTtsBin : "edge-tts";
          await execFileAsync(bin, [
            "--voice",
            voice.startsWith("piper:") ? "es-ES-AlvaroNeural" : voice,
            `--rate=${rate}`,
            `--pitch=${pitch}`,
            "--text",
            cleanText,
            "--write-media",
            filePath,
          ]);
        }
      }
      await applyVoiceFx(filePath, fx);
    }

    return `/api/audio/${filename}`;
  } catch (err) {
    console.error("TTS synthesis error:", err);
    return null;
  }
}

/**
 * Synthesizes a reply with cohesive neural intonation across sentences.
 * Normal conversational replies (<= 260 chars) are synthesized in one continuous neural breath
 * so there are zero choppy cuts between sentences.
 */
export async function synthesizeSpeechQueue(text: string): Promise<string[]> {
  const cleaned = normalizeForSpeech(text);
  if (!cleaned) return [];

  if (cleaned.length <= 260) {
    const single = await synthesizeSpeech(cleaned);
    return single ? [single] : [];
  }

  const parts = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = "";
  for (const p of parts) {
    if (!buf) {
      buf = p;
    } else if (buf.length + p.length < 220) {
      buf = `${buf} ${p}`;
    } else {
      chunks.push(buf);
      buf = p;
    }
  }
  if (buf) chunks.push(buf);

  const urls = await Promise.all(chunks.map((c) => synthesizeSpeech(c)));
  return urls.filter((u): u is string => Boolean(u));
}

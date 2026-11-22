import fs from "fs";
import path from "path";

const ENV_PATH = path.join(process.cwd(), ".env");

export interface AppSettings {
  deepseekApiKey: string;
  deepseekModel: string;
  voice: string;
  voiceRate: string;
  voicePitch: string;
  emotionalProsody: boolean;
  continuousMode: boolean;
  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;
  starkAuthToken: string;
  /** "tars" = timbre robótico TARS (ffmpeg), "none" = voz limpia */
  voiceFx: string;
  humorLevel: number;
  honestyLevel: number;
}

function cleanEnvValue(v: string): string {
  const trimmed = v.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function getSettings(): AppSettings {
  const envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
  const map: Record<string, string> = {};
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx !== -1) {
      const k = trimmed.slice(0, idx).trim();
      const v = cleanEnvValue(trimmed.slice(idx + 1));
      map[k] = v;
    }
  }

  return {
    deepseekApiKey: map["DEEPSEEK_API_KEY"] || process.env.DEEPSEEK_API_KEY || "",
    deepseekModel: map["DEEPSEEK_MODEL"] || process.env.DEEPSEEK_MODEL || "deepseek-chat",
    // Voz TARS: grave, pausada y seca (base es-MX-JorgeNeural + filtro "tars")
    voice: map["JARVIS_VOICE"] || process.env.JARVIS_VOICE || "es-MX-JorgeNeural",
    voiceRate: map["JARVIS_VOICE_RATE"] || process.env.JARVIS_VOICE_RATE || "-6%",
    voicePitch: map["JARVIS_VOICE_PITCH"] || process.env.JARVIS_VOICE_PITCH || "-12Hz",
    emotionalProsody:
      (map["JARVIS_EMOTIONAL_PROSODY"] ?? process.env.JARVIS_EMOTIONAL_PROSODY ?? "false") ===
      "true",
    continuousMode:
      (map["JARVIS_CONTINUOUS_MODE"] ?? process.env.JARVIS_CONTINUOUS_MODE ?? "true") !==
      "false",
    elevenlabsApiKey: map["ELEVENLABS_API_KEY"] || process.env.ELEVENLABS_API_KEY || "",
    elevenlabsVoiceId:
      map["ELEVENLABS_VOICE_ID"] || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
    starkAuthToken: map["STARK_AUTH_TOKEN"] || process.env.STARK_AUTH_TOKEN || "",
    voiceFx: (map["JARVIS_VOICE_FX"] || process.env.JARVIS_VOICE_FX || "tars").toLowerCase(),
    humorLevel: Number(map["TARS_HUMOR"] || process.env.TARS_HUMOR || 75),
    honestyLevel: Number(map["TARS_HONESTY"] || process.env.TARS_HONESTY || 90),
  };
}

// Fail-closed: si no hay STARK_AUTH_TOKEN, nadie pasa (antes devolvía true = todo abierto).
export { isAuthorized as verifyStarkAuth } from "./auth";

export function updateSettings(
  updates: Partial<{
    DEEPSEEK_API_KEY: string;
    DEEPSEEK_MODEL: string;
    JARVIS_VOICE: string;
    JARVIS_VOICE_RATE: string;
    JARVIS_VOICE_PITCH: string;
    JARVIS_EMOTIONAL_PROSODY: string;
    JARVIS_CONTINUOUS_MODE: string;
    ELEVENLABS_API_KEY: string;
    ELEVENLABS_VOICE_ID: string;
    JARVIS_VOICE_FX: string;
    TARS_HUMOR: string;
    TARS_HONESTY: string;
  }>
) {
  const envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
  const lines = envContent.split("\n");
  const updatedKeys = new Set<string>();

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const idx = trimmed.indexOf("=");
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const updateVal = (updates as Record<string, string | undefined>)[key];
      if (updateVal !== undefined) {
        updatedKeys.add(key);
        return `${key}=${updateVal}`;
      }
    }
    return line;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined && !updatedKeys.has(k)) {
      newLines.push(`${k}=${v}`);
    }
  }

  if (!newLines.some((l) => l.trim().startsWith("PORT="))) {
    newLines.push("PORT=3000");
  }

  fs.writeFileSync(ENV_PATH, newLines.filter((l, i, arr) => l !== "" || i !== arr.length - 1).join("\n") + "\n", "utf-8");
}

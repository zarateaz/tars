import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/config";

export async function GET() {
  const s = getSettings();
  const masked =
    s.deepseekApiKey.length > 8
      ? `${s.deepseekApiKey.slice(0, 4)}...${s.deepseekApiKey.slice(-4)}`
      : "";
  const elevenMasked =
    s.elevenlabsApiKey.length > 8
      ? `${s.elevenlabsApiKey.slice(0, 4)}...${s.elevenlabsApiKey.slice(-4)}`
      : "";

  return NextResponse.json({
    deepseekConfigured: Boolean(s.deepseekApiKey),
    deepseekKeyMasked: masked,
    deepseekModel: s.deepseekModel,
    voice: s.voice,
    voiceRate: s.voiceRate,
    voicePitch: s.voicePitch,
    emotionalProsody: s.emotionalProsody,
    continuousMode: s.continuousMode,
    elevenlabsConfigured: Boolean(s.elevenlabsApiKey),
    elevenlabsKeyMasked: elevenMasked,
    elevenlabsVoiceId: s.elevenlabsVoiceId,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  updateSettings({
    DEEPSEEK_API_KEY:
      body.deepseekApiKey !== undefined ? String(body.deepseekApiKey).trim() : undefined,
    DEEPSEEK_MODEL: body.deepseekModel ? String(body.deepseekModel).trim() : undefined,
    JARVIS_VOICE: body.voice ? String(body.voice).trim() : undefined,
    JARVIS_VOICE_RATE: body.voiceRate ? String(body.voiceRate).trim() : undefined,
    JARVIS_VOICE_PITCH: body.voicePitch ? String(body.voicePitch).trim() : undefined,
    JARVIS_EMOTIONAL_PROSODY:
      body.emotionalProsody !== undefined ? String(Boolean(body.emotionalProsody)) : undefined,
    JARVIS_CONTINUOUS_MODE:
      body.continuousMode !== undefined ? String(Boolean(body.continuousMode)) : undefined,
    ELEVENLABS_API_KEY:
      body.elevenlabsApiKey !== undefined ? String(body.elevenlabsApiKey).trim() : undefined,
    ELEVENLABS_VOICE_ID:
      body.elevenlabsVoiceId !== undefined ? String(body.elevenlabsVoiceId).trim() : undefined,
  });
  return NextResponse.json({ success: true, message: "Configuración guardada correctamente." });
}

import { NextResponse } from "next/server";
import {
  getSystemStats,
  openApplication,
  playMusicOnYouTube,
  searchWeb,
  setVolume,
  toggleMute,
  mediaControl,
  takeScreenshot,
  killProcess,
} from "@/lib/system";
import { synthesizeSpeech } from "@/lib/tts";

export async function GET() {
  const stats = await getSystemStats();
  return NextResponse.json(stats);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, target, value, speak } = body;

    let result = { success: false, message: "Acción no reconocida." };

    if (action === "open_app" && target) {
      result = await openApplication(target);
    } else if (action === "play_music" && target) {
      result = await playMusicOnYouTube(target);
    } else if (action === "search_web" && target) {
      result = await searchWeb(target);
    } else if (action === "set_volume" && typeof value === "number") {
      result = await setVolume(value);
    } else if (action === "toggle_mute") {
      result = await toggleMute();
    } else if (action === "media" && target) {
      result = await mediaControl(target);
    } else if (action === "screenshot") {
      result = await takeScreenshot();
    } else if (action === "kill_process" && target) {
      result = await killProcess(String(target));
    } else if (action === "speak" && target) {
      result = { success: true, message: target };
    }

    let audioUrl: string | null = null;
    if (speak !== false && result.message) {
      audioUrl = await synthesizeSpeech(result.message);
    }

    return NextResponse.json({ ...result, audioUrl });
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}

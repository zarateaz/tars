import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { AUDIO_CACHE_DIR } from "@/lib/tts";

const execFileAsync = promisify(execFile);

export async function GET(
  _req: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  const safeName = path.basename(filename);
  const filePath = path.join(AUDIO_CACHE_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// Native OS speaker fallback when browser blocks HTML5 audio autoplay (hands-free mode without prior click)
export async function POST(
  _req: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  const safeName = path.basename(filename.split("?")[0]);
  const filePath = path.join(AUDIO_CACHE_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ played: false }, { status: 404 });
  }

  try {
    await execFileAsync("wpctl", ["set-mute", "@DEFAULT_AUDIO_SINK@", "0"]).catch(() => {});
    await execFileAsync("mpv", ["--no-video", "--really-quiet", filePath], { timeout: 25000 });
    return NextResponse.json({ played: true });
  } catch {
    return NextResponse.json({ played: false });
  }
}

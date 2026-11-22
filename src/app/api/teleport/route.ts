import { NextResponse } from "next/server";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { tvOpenUrl, tvSearchYouTube, tvGetVolume } from "@/lib/tvControl";

const execFileAsync = promisify(execFile);

const AUDIO_ENV = {
  ...process.env,
  DISPLAY: process.env.DISPLAY || ":0",
  WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || "wayland-1",
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`,
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  let title = "";
  let url = "";

  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/playerctl",
      ["metadata", "--format", "{{title}}|||{{xesam:url}}|||{{artist}}"],
      { env: AUDIO_ENV, timeout: 1500 }
    );
    const parts = stdout.trim().split("|||");
    title = (parts[0] || "").replace(/^\(\d+\)\s*/, "").replace(/\s*-\s*YouTube$/, "").trim();
    url = (parts[1] || "").trim();
  } catch {
    /* ignore */
  }

  const tvVol = await tvGetVolume().catch(() => 30);

  return NextResponse.json({
    success: true,
    laptopActive: { title, url },
    tvVolume: tvVol,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const target = String(body.target || "tv").toLowerCase().trim();
    let contentUrl = String(body.url || "").trim();
    let contentTitle = String(body.title || "").trim();

    if (!contentUrl && !contentTitle) {
      try {
        const { stdout } = await execFileAsync(
          "/usr/bin/playerctl",
          ["metadata", "--format", "{{title}}|||{{xesam:url}}"],
          { env: AUDIO_ENV, timeout: 1500 }
        );
        const parts = stdout.trim().split("|||");
        contentTitle = (parts[0] || "").replace(/^\(\d+\)\s*/, "").replace(/\s*-\s*YouTube$/, "").trim();
        contentUrl = (parts[1] || "").trim();
      } catch {
        /* ignore */
      }
    }

    if (target === "tv") {
      if (contentUrl && contentUrl.startsWith("http")) {
        await tvOpenUrl(contentUrl);
        return NextResponse.json({
          success: true,
          target: "tv",
          url: contentUrl,
          reply: `Proyectando enlace en tu Smart TV: ${contentUrl}`,
        });
      }

      const searchQuery = contentTitle || "música cyberpunk synthwave";
      await tvSearchYouTube(searchQuery, true);
      return NextResponse.json({
        success: true,
        target: "tv",
        query: searchQuery,
        reply: `Teletransportando "${searchQuery}" a tu Smart TV.`,
      });
    }

    if (target === "laptop") {
      const targetUrl = contentUrl || "https://www.youtube.com";
      spawn("/usr/bin/xdg-open", [targetUrl], { env: AUDIO_ENV, detached: true, stdio: "ignore" }).unref();
      return NextResponse.json({
        success: true,
        target: "laptop",
        url: targetUrl,
        reply: `Abriendo contenido en tu laptop.`,
      });
    }

    return NextResponse.json({ success: false, error: "Destino no soportado" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

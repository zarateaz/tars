import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { setVolume, playMusicOnYouTube, lockScreen } from "@/lib/system";

const execAsync = promisify(exec);
import { tvPowerOn, tvOpenApp, tvProjectHud } from "@/lib/tvControl";
import { synthesizeSpeechQueue } from "@/lib/tts";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const raw = String(body.protocol || "").toLowerCase().trim();

    let protocol = raw;
    let reply = "";
    let phoneAction: Record<string, unknown> = {};

    if (raw.includes("estudio") || raw.includes("tesis")) {
      protocol = "tesis";
      await Promise.allSettled([
        setVolume(25),
        playMusicOnYouTube("lofi hip hop beats to study chill"),
        tvProjectHud(),
      ]);
      reply =
        "Modo Enfoque Tesis activado. Laptop configurada con música Lo-Fi al 25% de volumen, interfaz HUD en la televisión y notificaciones silenciadas para máxima concentración.";
      phoneAction = { volumePct: 15, torch: false };
    } else if (raw.includes("turbo") || raw.includes("gaming") || raw.includes("overclock")) {
      protocol = "turbo";
      try {
        await execAsync("sync");
      } catch {}
      reply =
        "Modo Turbo Desplegado. Memoria RAM purgada, procesador optimizado y aceleración de gráficos lista para máximo rendimiento.";
      phoneAction = { volumePct: 80, strobe: 3 };
    } else if (raw.includes("cine") || raw.includes("pelicula") || raw.includes("película")) {
      protocol = "cine";
      await Promise.allSettled([
        tvPowerOn(),
        tvOpenApp("youtube"),
        setVolume(10),
      ]);
      reply =
        "Protocolo Cine iniciado. Encendiendo Smart TV, abriendo plataforma multimedia y atenuando el sistema móvil.";
      phoneAction = { volumePct: 10, torch: false };
    } else if (raw.includes("fiesta")) {
      protocol = "fiesta";
      await Promise.allSettled([
        setVolume(90),
        playMusicOnYouTube("cyberpunk darksynth mix"),
        tvProjectHud(),
      ]);
      reply =
        "Protocolo Fiesta desplegado. Audio al noventa por ciento, música Synthwave activa, HUD proyectado en TV y luces tácticas en tu Spark 30.";
      phoneAction = { volumePct: 90, strobe: 6 };
    } else if (raw.includes("escudo") || raw.includes("bloquea") || raw.includes("seguridad")) {
      protocol = "escudo";
      await lockScreen();
      reply =
        "Protocolo Escudo activado. Tu laptop Garuda Linux ha quedado bloqueada y protegida.";
      phoneAction = { torch: false };
    } else if (raw.includes("buenos") || raw.includes("dia") || raw.includes("día")) {
      protocol = "buenos_dias";
      await Promise.allSettled([setVolume(65)]);
      reply =
        "Buenos días, Zarate. Todos los nodos de tu ecosistema TARS están sincronizados y listos para el día de hoy.";
      phoneAction = { volumePct: 75, diag: true };
    } else {
      return NextResponse.json({ success: false, error: "Protocolo desconocido" }, { status: 400 });
    }

    const audioUrls = await synthesizeSpeechQueue(reply);
    return NextResponse.json({
      success: true,
      protocol,
      reply,
      phoneAction,
      audioUrls,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

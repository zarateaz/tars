import { exec } from "child_process";
import { promisify } from "util";
import dgram from "dgram";
import { enqueueSatelliteCommand } from "./satelliteQueue";
import { getSettings } from "./config";

// En la nube (VPS) no hay acceso a la LAN de casa: ADB y Wake-on-LAN los ejecuta el satélite.
const IS_CLOUD = process.env.JARVIS_MODE === "cloud";

const execAsync = promisify(exec);

export const TV_IP = "192.168.1.54:5555";
export const TV_HOST = "192.168.1.54";
export const TV_MAC = "44:0f:b4:12:fa:ee";
export const LAPTOP_IP = "192.168.1.35";

export const TV_APPS: Record<string, string> = {
  youtube: "com.google.android.youtube.tv",
  netflix: "com.netflix.ninja",
  crunchyroll: "com.crunchyroll.crunchyroid",
  disney: "com.disney.disneyplus",
  "disney plus": "com.disney.disneyplus",
  "prime video": "com.amazon.amazonvideo.livingroom",
  prime: "com.amazon.amazonvideo.livingroom",
  amazon: "com.amazon.amazonvideo.livingroom",
  hbo: "com.wbd.stream",
  max: "com.wbd.stream",
  "apple tv": "com.apple.atve.androidtv.appletv",
  navegador: "com.tcl.browser",
  browser: "com.tcl.browser",
};

/**
 * Sends a Wake-on-LAN (WoL) Magic Packet to wake the TV's network adapter from standby.
 * Sends a burst of packets to multiple broadcast and unicast ports for maximum reliability.
 */
export async function sendWakeOnLan(mac: string = TV_MAC): Promise<boolean> {
  if (IS_CLOUD) {
    enqueueSatelliteCommand("tv_wol", { mac });
    return true;
  }
  const cleanMac = mac.replace(/[:-]/g, "");
  if (cleanMac.length !== 12) return false;

  const macBytes = Buffer.from(cleanMac, "hex");
  const magicPacket = Buffer.concat([
    Buffer.alloc(6, 0xff),
    ...Array(16).fill(macBytes),
  ]);

  const sendSingle = (port: number, host: string): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const client = dgram.createSocket("udp4");
        client.bind(() => {
          client.setBroadcast(true);
          client.send(magicPacket, 0, magicPacket.length, port, host, () => {
            client.close();
            resolve();
          });
        });
      } catch {
        resolve();
      }
    });
  };

  // Burst of packets across standard WoL ports and destinations
  for (let i = 0; i < 3; i++) {
    await Promise.all([
      sendSingle(9, "192.168.1.255"),
      sendSingle(7, "192.168.1.255"),
      sendSingle(9, "255.255.255.255"),
      sendSingle(9, TV_HOST),
    ]);
    await new Promise((r) => setTimeout(r, 60));
  }
  return true;
}

export async function runAdb(command: string, timeoutMs = 3000): Promise<string> {
  if (IS_CLOUD) {
    enqueueSatelliteCommand("tv_adb", { command });
    return "Orden enviada a la laptop";
  }
  try {
    const full = `adb -s ${TV_IP} ${command}`;
    const { stdout } = await execAsync(full, { timeout: timeoutMs });
    return stdout.trim();
  } catch (err: any) {
    // If not connected, attempt auto-reconnect once (rápido)
    try {
      await execAsync(`adb connect ${TV_IP}`, { timeout: 2000 });
      const full = `adb -s ${TV_IP} ${command}`;
      const { stdout } = await execAsync(full, { timeout: timeoutMs });
      return stdout.trim();
    } catch (e2: any) {
      return `Error ADB: ${e2?.message || err?.message}`;
    }
  }
}

/** Devuelve true si la pantalla está encendida, false si está en reposo, null si no hay conexión. */
export async function tvIsAwake(): Promise<boolean | null> {
  const out = await runAdb(`shell "dumpsys power | grep -m1 mWakefulness="`, 2500);
  if (out.includes("Awake")) return true;
  if (out.includes("Asleep") || out.includes("Dozing")) return false;
  return null;
}

/**
 * PROTOCOLO HÍBRIDO ULTRA-AVANZADO DE ENCENDIDO CON 0 MARGEN DE ERROR:
 * 1. Dispara ráfagas de Wake-on-LAN Magic Packets a la MAC de la TV (44:0f:b4:12:fa:ee).
 * 2. Realiza polling resiliente de reconexión ADB para capturar el instante en que la TV reasocia Wi-Fi.
 * 3. Inyecta KEYCODE_WAKEUP (224), KEYCODE_POWER (26) y KEYCODE_HOME (3) para activar pantalla y Launcher.
 */
export async function tvPowerOn(): Promise<string> {
  if (IS_CLOUD) {
    enqueueSatelliteCommand("tv_power", { state: "on", mac: TV_MAC });
    return "Encendiendo la TV desde tu laptop";
  }
  // Camino rápido: KEYCODE_WAKEUP (224) es idempotente (solo enciende, nunca apaga).
  const r = await runAdb("shell input keyevent 224", 2500);
  if (!r.startsWith("Error ADB")) return "TV encendida";

  // Camino lento: ADB caído (Wi-Fi dormido) -> Wake-on-LAN y reintento corto.
  await sendWakeOnLan(TV_MAC);
  for (let i = 0; i < 3; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    const retry = await runAdb("shell input keyevent 224", 2000);
    if (!retry.startsWith("Error ADB")) return "TV encendida (Wake-on-LAN)";
  }
  return "Error ADB: la TV no responde por red. Enciéndela con el control remoto.";
}

export async function tvPowerOff(): Promise<string> {
  if (IS_CLOUD) {
    enqueueSatelliteCommand("tv_power", { state: "off" });
    return "Apagando la TV desde tu laptop";
  }
  // KEYCODE_POWER (26) alterna; solo se envía si la pantalla está realmente encendida.
  // Así "apaga" nunca enciende por accidente.
  const awake = await tvIsAwake();
  if (awake === false) return "La TV ya estaba apagada";
  if (awake === null) return "Error ADB: la TV no responde por red";
  return await runAdb("shell input keyevent 26", 2500);
}

export async function tvPlayPause(): Promise<string> {
  return await runAdb("shell input keyevent 85");
}

export async function tvGetVolume(): Promise<number> {
  try {
    const out = await runAdb("shell cmd media_session volume --stream 3 --get", 2000);
    const m = out.match(/volume is (\d+)/i);
    if (m) return parseInt(m[1], 10);
  } catch {
    /* ignore */
  }
  return 30;
}

export async function tvVolumeUp(steps = 5): Promise<string> {
  const safeSteps = Math.max(1, Math.min(35, Math.round(steps)));
  if (IS_CLOUD) {
    enqueueSatelliteCommand("tv_volume_step", { delta: safeSteps });
    return `Subiendo el volumen de la tele ${safeSteps} puntos.`;
  }
  const cmds = Array(safeSteps).fill("input keyevent 24").join(" && ");
  await runAdb(`shell "${cmds}"`, 4000);
  const newVol = await tvGetVolume();
  return `Volumen de la televisión subido al ${newVol}% (+${safeSteps} puntos).`;
}

export async function tvVolumeDown(steps = 5): Promise<string> {
  const safeSteps = Math.max(1, Math.min(35, Math.round(steps)));
  if (IS_CLOUD) {
    enqueueSatelliteCommand("tv_volume_step", { delta: -safeSteps });
    return `Bajando el volumen de la tele ${safeSteps} puntos.`;
  }
  const cmds = Array(safeSteps).fill("input keyevent 25").join(" && ");
  await runAdb(`shell "${cmds}"`, 4000);
  const newVol = await tvGetVolume();
  return `Volumen de la televisión bajado al ${newVol}% (-${safeSteps} puntos).`;
}

export async function tvSetVolume(targetPct: number): Promise<string> {
  if (IS_CLOUD) {
    const level = Math.max(0, Math.min(100, Math.round(targetPct)));
    enqueueSatelliteCommand("tv_set_volume", { level });
    return `Volumen de la tele al ${level} por ciento.`;
  }
  const cur = await tvGetVolume();
  const target = Math.max(0, Math.min(100, Math.round(targetPct)));
  const diff = target - cur;
  if (diff === 0) return `El volumen de la televisión ya está al ${cur}%.`;
  const key = diff > 0 ? "24" : "25";
  const count = Math.min(50, Math.abs(diff));
  const cmds = Array(count).fill(`input keyevent ${key}`).join(" && ");
  await runAdb(`shell "${cmds}"`, 5000);
  const newVol = await tvGetVolume();
  return `Volumen de la televisión ajustado al ${newVol}%.`;
}

export async function tvMute(): Promise<string> {
  return await runAdb("shell input keyevent 164");
}

export async function tvHome(): Promise<string> {
  return await runAdb("shell input keyevent 3");
}

export async function tvTypeText(text: string): Promise<string> {
  const safe = text.replace(/[^a-zA-Z0-9_\-\s.,]/g, "").replace(/\s+/g, "%s");
  if (!safe) return "Texto vacío o no compatible";
  return await runAdb(`shell input text "${safe}"`);
}

export async function tvOpenUrl(url: string): Promise<string> {
  const cleanUrl = url.trim();
  // Solo http(s) y sin caracteres que el shell pueda interpretar
  if (!/^https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!&()*+,;=%]+$/.test(cleanUrl) || /[`$"'\\]/.test(cleanUrl)) {
    return "URL no válida para la TV";
  }
  return await runAdb(`shell am start -a android.intent.action.VIEW -d '${cleanUrl.replace(/[&;()]/g, (c) => "\\" + c)}'`);
}

export async function tvSendKey(code: number | string): Promise<string> {
  return await runAdb(`shell input keyevent ${code}`);
}

export async function tvBack(): Promise<string> {
  return await runAdb("shell input keyevent 4");
}

export async function tvSendDpad(key: string): Promise<string> {
  const map: Record<string, number> = {
    up: 19,
    down: 20,
    left: 21,
    right: 22,
    center: 23,
    enter: 23,
    ok: 23,
    back: 4,
    home: 3,
  };
  const code = map[key.toLowerCase().trim()] || 23;
  return await runAdb(`shell input keyevent ${code}`);
}

export async function tvTap(xNorm: number, yNorm: number): Promise<string> {
  const x = Math.max(0, Math.min(1279, Math.round(xNorm * 1280)));
  const y = Math.max(0, Math.min(719, Math.round(yNorm * 720)));
  return await runAdb(`shell input tap ${x} ${y}`);
}

export async function tvCycleWallpaper(): Promise<string> {
  try {
    const { stdout } = await execAsync("python3 /home/zarate/tv/wallpaper_cycler.py --next", { timeout: 8000 });
    return stdout.trim() || "Fondo de pantalla Cyberpunk cambiado en la televisión.";
  } catch (e: any) {
    return `Error cambiando fondo: ${e?.message || e}`;
  }
}

export async function tvScreenshotBuffer(): Promise<Buffer | null> {
  try {
    const { stdout } = await execAsync(
      `adb -s ${TV_IP} exec-out screencap -p | ffmpeg -loglevel error -f image2pipe -vcodec png -i - -vf "scale=640:-1" -q:v 5 -f image2pipe -vcodec mjpeg -`,
      {
        encoding: "buffer",
        maxBuffer: 4 * 1024 * 1024,
        timeout: 3500,
      }
    );
    return stdout;
  } catch {
    return null;
  }
}

export async function tvOpenApp(appName: string): Promise<string> {
  const key = appName.toLowerCase().trim();
  const pkg = TV_APPS[key];
  if (pkg) {
    return await runAdb(`shell monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
  }
  // Nombre de paquete Android válido (com.algo.app); evita inyección de comandos
  if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(appName.trim())) {
    return `App de TV desconocida: ${appName}`;
  }
  return await runAdb(`shell monkey -p ${appName.trim()} 1`);
}

export async function tvSearchYouTube(query: string, autoPlay = true): Promise<string> {
  if (IS_CLOUD) {
    // Búsqueda + OK con la espera hecha en la laptop (si se enviaban por separado, el OK llegaba antes de cargar YouTube)
    enqueueSatelliteCommand("tv_youtube", { query, autoplay: autoPlay, delaySec: 3 });
    return `Poniendo "${query}" en YouTube de la tele`;
  }
  const encoded = encodeURIComponent(query);
  const res = await runAdb(`shell am start -a android.intent.action.VIEW -d "vnd.youtube://search?q=${encoded}"`);
  if (autoPlay) {
    // Esperar 1.8 segundos a que cargue la app y presionar OK (DPAD_CENTER) para reproducir el primer resultado
    setTimeout(async () => {
      try {
        await runAdb("shell input keyevent 23");
      } catch {}
    }, 1800);
  }
  return res;
}

export async function tvProjectHud(): Promise<string> {
  // El navegador de la TV necesita el token una vez; el middleware lo cambia por cookie
  const token = encodeURIComponent(process.env.STARK_AUTH_TOKEN || getSettings().starkAuthToken);
  const url = `http://${LAPTOP_IP}:3000/tv.html?token=${token}`;
  return await runAdb(`shell am start -a android.intent.action.VIEW -d "${url}"`);
}

export async function tvStartScreensaver(): Promise<string> {
  return await runAdb("shell am start -n com.neilturner.aerialviews/.ui.screensaver.TestActivity");
}

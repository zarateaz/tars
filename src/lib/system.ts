import os from "os";
import fs from "fs";
import path from "path";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { enqueueSatelliteCommand } from "./satelliteQueue";

const execAsync = promisify(exec);

/**
 * JARVIS_MODE=cloud → el núcleo corre en un VPS/Docker y NO tiene escritorio.
 * Las acciones físicas (apps, volumen, bloqueo...) se encolan para el
 * satélite (laptop_satellite.py) que corre en la laptop y las ejecuta allí.
 */
export const IS_CLOUD = process.env.JARVIS_MODE === "cloud";
/** Ejecución de bash libre: activada en local, desactivada en la nube salvo JARVIS_ALLOW_CLI=true. */
export const CLI_ALLOWED = process.env.JARVIS_ALLOW_CLI
  ? process.env.JARVIS_ALLOW_CLI === "true"
  : !IS_CLOUD;

function toSatellite(action: string, payload: Record<string, unknown>, message: string) {
  enqueueSatelliteCommand(action, payload);
  return { success: true, message: `${message} (enviado a la laptop)` };
}

export const APP_ALIASES: Record<string, string[]> = {
  chrome: ["google-chrome-stable", "google-chrome", "chromium", "firedragon"],
  "google chrome": ["google-chrome-stable", "google-chrome", "chromium"],
  navegador: ["google-chrome-stable", "firedragon", "firefox", "chromium"],
  browser: ["google-chrome-stable", "firedragon", "firefox"],
  firedragon: ["firedragon"],
  terminal: ["alacritty", "kitty", "konsole", "xfce4-terminal", "gnome-terminal"],
  consola: ["alacritty", "kitty", "konsole"],
  alacritty: ["alacritty"],
  kitty: ["kitty"],
  konsole: ["konsole"],
  archivos: ["dolphin", "thunar", "nemo", "nautilus"],
  explorador: ["dolphin", "thunar", "nemo"],
  carpeta: ["dolphin", "thunar", "nemo"],
  dolphin: ["dolphin"],
  editor: ["kate", "code", "cursor"],
  kate: ["kate"],
  codigo: ["code", "cursor", "kate"],
  spotify: ["spotify"],
  musica: ["spotify", "vlc", "mpv"],
  vlc: ["vlc"],
  configuracion: ["systemsettings"],
  ajustes: ["systemsettings"],
  calculadora: ["kcalc", "galculator", "gnome-calculator"],
  captura: ["spectacle"],
};

async function findBinary(candidates: string[]): Promise<string | null> {
  for (const cmd of candidates) {
    try {
      if (!/^[\w.+-]+$/.test(cmd)) continue;
      const { stdout } = await execAsync(`which ${cmd}`);
      const path = stdout.trim();
      if (path) return path;
    } catch {
      // continue
    }
  }
  return null;
}

function spawnDetached(bin: string, args: string[] = []) {
  const child = spawn(bin, args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
  });
  child.unref();
}

export async function openUrlInBrowser(url: string, _fullscreen: boolean = false): Promise<void> {
  if (IS_CLOUD) {
    enqueueSatelliteCommand("open_url", { url });
    return;
  }
  const chromeBin = await findBinary(["google-chrome-stable", "google-chrome", "firedragon", "xdg-open"]);
  if (chromeBin) {
    if (chromeBin.includes("chrome")) {
      // Abre en una ventana nueva, independiente y fluida sin forzar fullscreen para evitar lag
      spawnDetached(chromeBin, ["--new-window", url]);
    } else {
      spawnDetached(chromeBin, [url]);
    }
  } else {
    spawnDetached("xdg-open", [url]);
  }
}

export async function openFolderInFileManager(folderNameOrPath: string): Promise<{ success: boolean; message: string }> {
  if (IS_CLOUD) return toSatellite("open_folder", { folder: folderNameOrPath }, `Abriendo la carpeta ${folderNameOrPath}`);
  let resolved = resolveUserPath(folderNameOrPath);
  const clean = folderNameOrPath.trim().toLowerCase();

  const knownFolders: Record<string, string> = {
    descargas: path.join(os.homedir(), "Descargas"),
    downloads: path.join(os.homedir(), "Descargas"),
    documentos: path.join(os.homedir(), "Documentos"),
    documents: path.join(os.homedir(), "Documentos"),
    imágenes: path.join(os.homedir(), "Imágenes"),
    imagenes: path.join(os.homedir(), "Imágenes"),
    pictures: path.join(os.homedir(), "Imágenes"),
    fotos: path.join(os.homedir(), "Imágenes"),
    escritorio: path.join(os.homedir(), "Escritorio"),
    desktop: path.join(os.homedir(), "Escritorio"),
    videos: path.join(os.homedir(), "Vídeos"),
    vídeos: path.join(os.homedir(), "Vídeos"),
    música: path.join(os.homedir(), "Música"),
    musica: path.join(os.homedir(), "Música"),
    senati: path.join(os.homedir(), "senati"),
    juegos: path.join(os.homedir(), "games"),
    games: path.join(os.homedir(), "games"),
    jearvis: process.cwd(),
  };

  if (knownFolders[clean]) {
    resolved = knownFolders[clean];
  }

  if (!fs.existsSync(resolved)) {
    try {
      fs.mkdirSync(resolved, { recursive: true });
    } catch {
      // ignore
    }
  }

  const fmBin = await findBinary(["thunar", "dolphin", "nautilus", "xdg-open"]);
  if (fmBin) {
    spawnDetached(fmBin, [resolved]);
    return {
      success: true,
      message: `Abriendo la carpeta ${path.basename(resolved)} en el gestor de archivos.`,
    };
  }
  return { success: false, message: `No se pudo abrir la carpeta ${resolved}.` };
}

export async function playMusicOnYouTube(query: string): Promise<{ success: boolean; message: string; url?: string }> {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  let targetUrl = searchUrl;

  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(3500),
    });
    const html = await res.text();
    const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (match) {
      targetUrl = `https://www.youtube.com/watch?v=${match[1]}&autoplay=1`;
    }
  } catch {
    targetUrl = searchUrl;
  }

  await openUrlInBrowser(targetUrl, true);
  return {
    success: true,
    message: `Reproduciendo "${query}" en YouTube a pantalla completa.`,
    url: targetUrl,
  };
}

export async function searchWeb(query: string): Promise<{ success: boolean; message: string }> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  await openUrlInBrowser(url, true);
  return {
    success: true,
    message: `Buscando "${query}" en Google Chrome.`,
  };
}

export async function openApplication(appName: string): Promise<{ success: boolean; message: string }> {
  const clean = appName.trim().toLowerCase();

  // Direct websites
  if (clean.includes("youtube")) {
    await openUrlInBrowser("https://www.youtube.com");
    return { success: true, message: "Abriendo YouTube en el navegador." };
  }
  if (clean.includes("whatsapp")) {
    await openUrlInBrowser("https://web.whatsapp.com");
    return { success: true, message: "Abriendo WhatsApp Web." };
  }
  if (clean.includes("github")) {
    await openUrlInBrowser("https://github.com");
    return { success: true, message: "Abriendo GitHub." };
  }
  if (clean === "google") {
    await openUrlInBrowser("https://www.google.com");
    return { success: true, message: "Abriendo Google." };
  }

  if (IS_CLOUD) return toSatellite("open_app", { app: clean }, `Abriendo ${appName}`);

  const candidates = APP_ALIASES[clean] || [clean];
  const bin = await findBinary(candidates);

  if (!bin) {
    return {
      success: false,
      message: `No encontré la aplicación "${appName}" instalada en el sistema.`,
    };
  }

  spawnDetached(bin);
  return {
    success: true,
    message: `Abriendo ${appName}.`,
  };
}

export async function closeApplication(appName: string): Promise<{ success: boolean; message: string }> {
  const clean = appName.trim().toLowerCase();
  if (IS_CLOUD) return toSatellite("close_app", { app: clean }, `Cerrando ${appName}`);
  const candidates = APP_ALIASES[clean] || [clean];
  let closed = false;
  for (const c of candidates) {
    try {
      if (!/^[\w .+-]+$/.test(c)) continue;
      await execAsync(`pkill -f -- '${c}'`);
      closed = true;
    } catch {
      // ignore
    }
  }
  return {
    success: closed,
    message: closed ? `Se ha cerrado ${appName}.` : `No encontré ${appName} en ejecución.`,
  };
}

export async function setVolume(percent: number): Promise<{ success: boolean; message: string }> {
  const clamped = Math.max(0, Math.min(150, Math.round(percent)));
  if (IS_CLOUD) return toSatellite("volume", { level: clamped }, `Volumen al ${clamped}%`);
  try {
    await execAsync(`pactl set-sink-volume @DEFAULT_SINK@ ${clamped}%`);
    return { success: true, message: `Volumen ajustado al ${clamped}%.` };
  } catch {
    return { success: false, message: "No se pudo ajustar el volumen." };
  }
}

export async function changeVolume(delta: number): Promise<{ success: boolean; message: string }> {
  const sign = delta >= 0 ? "+" : "-";
  const val = Math.abs(delta);
  if (IS_CLOUD) return toSatellite("volume_delta", { delta: Math.round(delta) }, `Volumen ${sign}${val}%`);
  try {
    await execAsync(`pactl set-sink-volume @DEFAULT_SINK@ ${sign}${val}%`);
    return {
      success: true,
      message: delta >= 0 ? `Subiendo el volumen un ${val}%.` : `Bajando el volumen un ${val}%.`,
    };
  } catch {
    return { success: false, message: "No se pudo cambiar el volumen." };
  }
}

export async function toggleMute(): Promise<{ success: boolean; message: string }> {
  if (IS_CLOUD) return toSatellite("mute", {}, "Silencio alternado");
  try {
    await execAsync(`pactl set-sink-mute @DEFAULT_SINK@ toggle`);
    return { success: true, message: "Estado de silencio alternado." };
  } catch {
    return { success: false, message: "No se pudo silenciar el audio." };
  }
}

export async function mediaControl(action: string): Promise<{ success: boolean; message: string }> {
  if (IS_CLOUD) return toSatellite("media", { action }, "Control multimedia");
  if (!/^[a-z-]+$/.test(action)) return { success: false, message: "Acción multimedia no válida." };
  try {
    await execAsync(`playerctl ${action}`);
    return { success: true, message: "Control multimedia ejecutado." };
  } catch {
    return { success: false, message: "No hay reproductor multimedia activo." };
  }
}

export async function takeScreenshot(): Promise<{ success: boolean; message: string }> {
  if (IS_CLOUD) return toSatellite("screenshot", {}, "Captura de pantalla");
  const bin = await findBinary(["spectacle", "flameshot"]);
  if (bin) {
    spawnDetached(bin, bin.endsWith("spectacle") ? ["-b", "-f"] : []);
    return { success: true, message: "Captura de pantalla realizada." };
  }
  return { success: false, message: "No se encontró herramienta de captura." };
}

export async function lockScreen(): Promise<{ success: boolean; message: string }> {
  if (IS_CLOUD) return toSatellite("lock_screen", {}, "Bloqueando la sesión");
  const bin = await findBinary(["loginctl", "hyprlock", "swaylock", "xdg-screensaver"]);
  if (bin) {
    if (bin.endsWith("loginctl")) {
      spawnDetached(bin, ["lock-session"]);
    } else if (bin.endsWith("xdg-screensaver")) {
      spawnDetached(bin, ["lock"]);
    } else {
      spawnDetached(bin);
    }
    return { success: true, message: "Asegurando perímetro y bloqueando sesión de usuario." };
  }
  return { success: false, message: "No se encontró el bloqueador de pantalla del sistema." };
}

export async function runCliCommand(command: string): Promise<{
  success: boolean;
  command: string;
  output: string;
}> {
  if (!CLI_ALLOWED) {
    return {
      success: false,
      command,
      output: "Ejecución de comandos desactivada en este servidor (JARVIS_ALLOW_CLI=false).",
    };
  }
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: os.homedir(),
      timeout: 25000,
      maxBuffer: 1024 * 1024 * 4,
      shell: "/bin/bash",
    });
    const combined = [stdout?.trim(), stderr?.trim()].filter(Boolean).join("\n");
    return {
      success: true,
      command,
      output: combined || "Comando ejecutado correctamente (sin salida en consola).",
    };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const combined = [e.stdout?.trim(), e.stderr?.trim(), e.message?.trim()]
      .filter(Boolean)
      .join("\n");
    return {
      success: false,
      command,
      output: combined || "Error al ejecutar el comando en la terminal.",
    };
  }
}

export async function runInTerminalWindow(command: string): Promise<{
  success: boolean;
  message: string;
}> {
  if (!CLI_ALLOWED || IS_CLOUD) {
    return { success: false, message: "Terminal no disponible en el servidor en la nube." };
  }
  const termBin = await findBinary(["alacritty", "kitty", "konsole", "xfce4-terminal"]);
  if (!termBin) {
    return { success: false, message: "No se encontró un emulador de terminal." };
  }
  const bashCmd = `${command}; echo ""; echo "=== Comando finalizado ==="; exec bash`;
  if (termBin.endsWith("alacritty") || termBin.endsWith("konsole")) {
    spawnDetached(termBin, ["-e", "bash", "-c", bashCmd]);
  } else if (termBin.endsWith("kitty")) {
    spawnDetached(termBin, ["bash", "-c", bashCmd]);
  } else {
    spawnDetached(termBin, ["-e", "bash", "-c", bashCmd]);
  }
  return {
    success: true,
    message: `Abriendo terminal y ejecutando: ${command}`,
  };
}

/**
 * En la nube, las herramientas de archivos de la IA solo pueden tocar esta carpeta.
 * Evita que una orden (o una inyección de prompt) lea /app/data/.env con tus claves.
 */
export const CLOUD_WORKSPACE = path.resolve(process.env.TARS_WORKSPACE || path.join(os.homedir(), "tars-workspace"));

export function resolveUserPath(targetPath: string): string {
  const trimmed = targetPath.trim();
  const base = IS_CLOUD ? CLOUD_WORKSPACE : os.homedir();
  let resolved: string;
  if (trimmed.startsWith("~/")) {
    resolved = path.join(base, trimmed.slice(2));
  } else if (trimmed === "~" || trimmed === "") {
    resolved = base;
  } else if (path.isAbsolute(trimmed)) {
    resolved = trimmed;
  } else {
    resolved = path.join(base, trimmed);
  }
  if (IS_CLOUD) {
    resolved = path.resolve(resolved);
    if (resolved !== CLOUD_WORKSPACE && !resolved.startsWith(CLOUD_WORKSPACE + path.sep)) {
      throw new Error(`Ruta fuera del espacio de trabajo de TARS (${CLOUD_WORKSPACE}): ${trimmed}`);
    }
    fs.mkdirSync(CLOUD_WORKSPACE, { recursive: true });
  }
  return resolved;
}

export async function createDirectory(dirPath: string): Promise<{
  success: boolean;
  path: string;
  message: string;
}> {
  try {
    const resolved = resolveUserPath(dirPath);
    fs.mkdirSync(resolved, { recursive: true });
    return {
      success: true,
      path: resolved,
      message: `Carpeta creada en: ${resolved}`,
    };
  } catch (err) {
    return {
      success: false,
      path: dirPath,
      message: `Error al crear carpeta: ${String(err)}`,
    };
  }
}

export async function writeFileContent(
  filePath: string,
  content: string
): Promise<{
  success: boolean;
  path: string;
  message: string;
}> {
  try {
    const resolved = resolveUserPath(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, "utf-8");
    return {
      success: true,
      path: resolved,
      message: `Archivo guardado en: ${resolved} (${content.length} bytes)`,
    };
  } catch (err) {
    return {
      success: false,
      path: filePath,
      message: `Error al escribir archivo: ${String(err)}`,
    };
  }
}

export async function editFileContent(
  filePath: string,
  target: string,
  replacement: string
): Promise<{
  success: boolean;
  path: string;
  message: string;
}> {
  try {
    const resolved = resolveUserPath(filePath);
    if (!fs.existsSync(resolved)) {
      return {
        success: false,
        path: resolved,
        message: `El archivo no existe: ${resolved}`,
      };
    }
    const existing = fs.readFileSync(resolved, "utf-8");
    if (!existing.includes(target)) {
      return {
        success: false,
        path: resolved,
        message: `No se encontró el fragmento a reemplazar en ${resolved}`,
      };
    }
    const updated = existing.split(target).join(replacement);
    fs.writeFileSync(resolved, updated, "utf-8");
    return {
      success: true,
      path: resolved,
      message: `Archivo editado correctamente: ${resolved}`,
    };
  } catch (err) {
    return {
      success: false,
      path: filePath,
      message: `Error al editar archivo: ${String(err)}`,
    };
  }
}

export async function readFileContent(filePath: string): Promise<{
  success: boolean;
  path: string;
  content: string;
}> {
  try {
    const resolved = resolveUserPath(filePath);
    if (!fs.existsSync(resolved)) {
      return {
        success: false,
        path: resolved,
        content: `El archivo no existe: ${resolved}`,
      };
    }
    const content = fs.readFileSync(resolved, "utf-8").slice(0, 12000);
    return {
      success: true,
      path: resolved,
      content,
    };
  } catch (err) {
    return {
      success: false,
      path: filePath,
      content: `Error al leer archivo: ${String(err)}`,
    };
  }
}

export async function listDirectoryContent(dirPath: string): Promise<{
  success: boolean;
  path: string;
  items: string[];
}> {
  try {
    const resolved = resolveUserPath(dirPath || "~");
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    return {
      success: true,
      path: resolved,
      items,
    };
  } catch (err) {
    return {
      success: false,
      path: dirPath,
      items: [`Error: ${String(err)}`],
    };
  }
}

export async function openInBrowserOrFile(target: string): Promise<{
  success: boolean;
  url: string;
  message: string;
}> {
  let url = target.trim();
  if (IS_CLOUD && !/^https?:\/\//i.test(url)) {
    return { success: false, url, message: "En la nube solo puedo abrir enlaces web en tu laptop." };
  }
  if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("file://")) {
    const resolved = resolveUserPath(url);
    url = `file://${resolved}`;
  }
  await openUrlInBrowser(url);
  return {
    success: true,
    url,
    message: `Abriendo en el navegador: ${url}`,
  };
}

export async function openInEditor(targetPath: string): Promise<{
  success: boolean;
  message: string;
}> {
  if (IS_CLOUD) return { success: false, message: "El editor solo está disponible en modo local." };
  const resolved = resolveUserPath(targetPath);
  const bin = await findBinary(["code", "cursor", "kate", "dolphin"]);
  if (bin) {
    spawnDetached(bin, [resolved]);
    return {
      success: true,
      message: `Abriendo ${resolved} en ${path.basename(bin)}.`,
    };
  }
  spawnDetached("xdg-open", [resolved]);
  return {
    success: true,
    message: `Abriendo ${resolved}.`,
  };
}

export async function killProcess(pid: string): Promise<{ success: boolean; message: string }> {
  if (IS_CLOUD) return { success: false, message: "No se pueden matar procesos del servidor en la nube." };
  try {
    const cleanPid = parseInt(pid, 10);
    if (isNaN(cleanPid) || cleanPid <= 1) {
      return { success: false, message: "PID no válido." };
    }
    await execAsync(`kill -9 ${cleanPid}`);
    return { success: true, message: `Proceso con PID ${cleanPid} finalizado correctamente.` };
  } catch (err) {
    return { success: false, message: `No se pudo finalizar el proceso: ${String(err)}` };
  }
}

let cachedLocalIp = "";
let lastIpCheck = 0;

let cachedPing: string | null = null;
let lastPingCheck = 0;

let cachedWeather = "🌤️ +24°C";
let lastWeatherCheck = 0;

let cachedTopProcs: Array<{ pid: string; name: string; cpu: string; mem: string }> = [];
let lastTopProcsCheck = 0;

async function getCachedLocalIp(): Promise<string> {
  const now = Date.now();
  if (cachedLocalIp && now - lastIpCheck < 60000) {
    return cachedLocalIp;
  }
  try {
    const { stdout } = await execAsync("ip route get 1.1.1.1 2>/dev/null || true");
    const m = stdout.match(/src\s+([0-9.]+)/);
    if (m && m[1]) {
      cachedLocalIp = m[1];
      lastIpCheck = now;
      return cachedLocalIp;
    }
  } catch {
    // fallback
  }
  return cachedLocalIp || "127.0.0.1";
}

async function getCachedPing(): Promise<string | null> {
  const now = Date.now();
  if (cachedPing !== null && now - lastPingCheck < 15000) {
    return cachedPing;
  }
  try {
    const { stdout } = await execAsync("ping -c 1 -W 1 1.1.1.1 2>/dev/null || true");
    const m = stdout.match(/(?:tiempo|time)=([\d.]+)\s*ms/i);
    if (m && m[1]) {
      cachedPing = `${m[1]}ms`;
      lastPingCheck = now;
      return cachedPing;
    }
  } catch {
    // fallback
  }
  return cachedPing || "8ms";
}

async function getCachedWeather(): Promise<string> {
  const now = Date.now();
  if (cachedWeather && now - lastWeatherCheck < 300000) {
    return cachedWeather;
  }
  try {
    const res = await fetch("https://wttr.in/?format=%c+%t&lang=es", {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text && !text.includes("Unknown location") && text.length < 30) {
        cachedWeather = text;
        lastWeatherCheck = now;
        return cachedWeather;
      }
    }
  } catch {
    // ignore
  }
  return cachedWeather;
}

export async function getSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPercent = Math.round((usedMem / totalMem) * 1000) / 10;

  // CPU load estimation
  const cpus = os.cpus();
  const load = os.loadavg()[0];
  const cpuPercent = Math.min(100, Math.round((load / Math.max(1, cpus.length)) * 1000) / 10);

  // Disk usage (pure Node.js fs.statfsSync — 0ms overhead, no subprocess spawn)
  let diskPercent = 0;
  let diskUsedGb = 0;
  let diskTotalGb = 0;
  try {
    const stat = fs.statfsSync("/");
    const total = stat.blocks * stat.bsize;
    const avail = stat.bavail * stat.bsize;
    const used = total - avail;
    if (total > 0) {
      diskTotalGb = Math.round((total / 1024 ** 3) * 10) / 10;
      diskUsedGb = Math.round((used / 1024 ** 3) * 10) / 10;
      diskPercent = Math.round((used / total) * 1000) / 10;
    }
  } catch {
    // ignore
  }

  // Top processes (cached for 4 seconds to avoid spawning ps every 2s)
  const now = Date.now();
  if (now - lastTopProcsCheck > 4000) {
    lastTopProcsCheck = now;
    try {
      const { stdout } = await execAsync("ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -n 6 | tail -n 5");
      cachedTopProcs = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const p = line.trim().split(/\s+/);
          return {
            pid: p[0] || "",
            name: p[1] || "",
            cpu: p[2] || "0.0",
            mem: p[3] || "0.0",
          };
        });
    } catch {
      // ignore
    }
  }
  const topProcesses = cachedTopProcs;

  const uptimeSec = os.uptime();
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);

  const [localIp, pingMs, weather] = await Promise.all([
    getCachedLocalIp(),
    getCachedPing(),
    getCachedWeather(),
  ]);

  return {
    cpuPercent,
    ramPercent,
    ramUsedGb: Math.round((usedMem / 1024 ** 3) * 100) / 100,
    ramTotalGb: Math.round((totalMem / 1024 ** 3) * 100) / 100,
    diskPercent,
    diskUsedGb,
    diskTotalGb,
    uptime: `${hours}h ${minutes}m`,
    topProcesses,
    network: {
      localIp,
      pingMs,
      weather,
    },
  };
}

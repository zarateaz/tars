/**
 * TARS // PHONE LINK (Laptop <-> Tecno Spark 30)
 * - Command queue: orders spoken on the laptop that must run on the phone.
 * - Reminder mirror: reminders scheduled on the phone are also announced by the laptop (voice + notification).
 * - Photo inbox: photos captured by the phone are stored on the laptop.
 */
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { enqueueSpeech } from "./speechQueue";

const ROOT = process.cwd();
const QUEUE_FILE = path.join(ROOT, "phone_commands.json");
const REMINDERS_FILE = path.join(ROOT, "reminders.json");
const ANNOUNCED_FILE = path.join(ROOT, "reminders_announced.json");
export const PHOTO_DIR = path.join(os.homedir(), "Imágenes", "Jearvis");

export interface PhoneCommand {
  id: string;
  text: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  text: string;
  time: number; // epoch ms
  done?: boolean;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeJson(file: string, data: unknown): void {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    /* ignore */
  }
}

/* ---------------- Command queue (laptop -> phone) ---------------- */

export function enqueuePhoneCommand(text: string): PhoneCommand {
  const queue = readJson<PhoneCommand[]>(QUEUE_FILE, []);
  const cmd: PhoneCommand = {
    id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    createdAt: new Date().toISOString(),
  };
  queue.push(cmd);
  writeJson(QUEUE_FILE, queue.slice(-20));
  return cmd;
}

/** Returns pending commands (max 2 minutes old) and clears the queue. */
export function drainPhoneCommands(): PhoneCommand[] {
  const queue = readJson<PhoneCommand[]>(QUEUE_FILE, []);
  if (queue.length === 0) return [];
  writeJson(QUEUE_FILE, []);
  const limit = Date.now() - 2 * 60 * 1000;
  return queue.filter((c) => new Date(c.createdAt).getTime() >= limit);
}

/** Phone-targeted intent detection for text received on the laptop. */
export function isPhoneTargetedCommand(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(laptop|pc|computadora|escritorio)\b/.test(t)) return false;
  if (/\b(recu[eé]rdame|recordatorio|recordar(me)?|av[ií]same)\b/.test(t)) return true;
  if (/\b(whatsapp|wasap|wsp|guasap)\b/.test(t)) return true;
  if (/\b(llama|llamar|ll[aá]male|marca)\b.*\b(a|al)\b/.test(t)) return true;
  if (/\b(foto|selfie|fotograf[ií]a)\b/.test(t)) return true;
  if (/\b(celular|tel[eé]fono|m[oó]vil|spark|tecno)\b/.test(t)) return true;
  return false;
}

/* ---------------- Reminder mirror ---------------- */

export function storeReminders(list: Reminder[]): void {
  const clean = list
    .filter((r) => r && r.id && r.text && typeof r.time === "number")
    .map((r) => ({ id: String(r.id), text: String(r.text), time: Number(r.time), done: Boolean(r.done) }));
  writeJson(REMINDERS_FILE, clean);
}

export function loadReminders(): Reminder[] {
  return readJson<Reminder[]>(REMINDERS_FILE, []);
}

function speakProactiveAlert(
  title: string,
  displayBody: string,
  speechText: string,
  urgency: "normal" | "critical" = "normal"
): void {
  enqueueSpeech({
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    text: speechText,
    priority: urgency,
    pauseAfterMs: 650,
  });
}

function announceOnLaptop(text: string): void {
  speakProactiveAlert(
    "⚡ TARS — Recordatorio",
    text,
    `Disculpa la interrupción. Tienes un recordatorio: ${text}`,
    "critical"
  );
}

function checkDueReminders(): void {
  const announced = new Set(readJson<string[]>(ANNOUNCED_FILE, []));
  const now = Date.now();
  let changed = false;
  for (const r of loadReminders()) {
    if (announced.has(r.id)) continue;
    if (r.time <= now && r.time > now - 10 * 60 * 1000) {
      announceOnLaptop(r.text);
      announced.add(r.id);
      changed = true;
    }
  }
  if (changed) writeJson(ANNOUNCED_FILE, Array.from(announced).slice(-200));

  checkProximitySecurity();
}

function checkProximitySecurity(): void {
  const state = readJson<AutonomousTriggerState>(AUTO_TRIGGERS_FILE, {
    lastLowBatteryAt: 0,
    lastHighTempAt: 0,
    lastReconnectAt: 0,
  });
  if (!state.proximityEnabled) return;
  const now = Date.now();
  const last = state.lastPhoneSeen || now;
  if (now - last > 180_000 && !state.lockedByProximity) {
    state.lockedByProximity = true;
    writeJson(AUTO_TRIGGERS_FILE, state);
    try {
      spawn("loginctl", ["lock-session"], { detached: true, stdio: "ignore" }).unref();
      spawn("adb", ["-s", "192.168.1.54:5555", "shell", "am", "start", "-n", "com.neilturner.aerialviews/.ui.screensaver.TestActivity"], { detached: true, stdio: "ignore" }).unref();
    } catch {
      /* ignore */
    }
    speakProactiveAlert(
      "🛡️ Radar TARS: Perímetro Asegurado",
      "Teléfono fuera de alcance. Sesión de laptop bloqueada y Smart TV en reposo.",
      "Perímetro asegurado. Bloqueando estación de trabajo y atenuando televisión."
    );
  }
}

// Single scheduler per server process
const g = globalThis as unknown as { __jarvisReminderTimer?: NodeJS.Timeout };
if (!g.__jarvisReminderTimer) {
  g.__jarvisReminderTimer = setInterval(checkDueReminders, 10_000);
}

/* ---------------- Photo inbox ---------------- */

export function savePhonePhoto(base64: string): string {
  if (!fs.existsSync(PHOTO_DIR)) fs.mkdirSync(PHOTO_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(PHOTO_DIR, `spark30_${stamp}.jpg`);
  fs.writeFileSync(file, Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), "base64"));
  return file;
}

export function openOnLaptop(file: string): void {
  try {
    spawn("xdg-open", [file], { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* ignore */
  }
}

/* ---------------- Phone notification relay (phone -> laptop) ---------------- */

const NOTIF_CACHE_FILE = path.join(ROOT, "notif_announced.json");

export function announceIncomingNotification(app: string, sender: string, text: string): void {
  const cleanApp = String(app || "Móvil").trim();
  const cleanSender = String(sender || "Contacto").trim();
  const cleanText = String(text || "").trim();
  if (!cleanText && !cleanSender) return;

  const hash = crypto
    .createHash("sha1")
    .update(`${cleanApp}|${cleanSender}|${cleanText}`)
    .digest("hex");

  const announced = new Set(readJson<string[]>(NOTIF_CACHE_FILE, []));
  if (announced.has(hash)) return;
  announced.add(hash);
  writeJson(NOTIF_CACHE_FILE, Array.from(announced).slice(-200));

  const title = `📱 ${cleanApp} — ${cleanSender}`;
  const shortMsg = cleanText.length > 140 ? cleanText.slice(0, 140) : cleanText;
  const phrase = `Notificación de ${cleanApp}. ${cleanSender} dice: ${shortMsg}`;
  speakProactiveAlert(title, cleanText, phrase, "normal");
}

/* ---------------- Autonomous proactive event triggers ---------------- */

const AUTO_TRIGGERS_FILE = path.join(ROOT, "autonomous_triggers.json");

interface AutonomousTriggerState {
  lastLowBatteryAt: number;
  lastHighTempAt: number;
  lastReconnectAt: number;
  proximityEnabled?: boolean;
  lastPhoneSeen?: number;
  lockedByProximity?: boolean;
}

export function isProximityGuardianEnabled(): boolean {
  const state = readJson<AutonomousTriggerState>(AUTO_TRIGGERS_FILE, {
    lastLowBatteryAt: 0,
    lastHighTempAt: 0,
    lastReconnectAt: 0,
  });
  return Boolean(state.proximityEnabled);
}

export function setProximityGuardian(enabled: boolean): boolean {
  const state = readJson<AutonomousTriggerState>(AUTO_TRIGGERS_FILE, {
    lastLowBatteryAt: 0,
    lastHighTempAt: 0,
    lastReconnectAt: 0,
  });
  state.proximityEnabled = enabled;
  state.lastPhoneSeen = Date.now();
  writeJson(AUTO_TRIGGERS_FILE, state);
  return enabled;
}

export function evaluateAutonomousPhoneTriggers(
  prev: { battery?: number; charging?: boolean; tempC?: number; lastSync?: string } | null,
  curr: { device: string; battery: number; charging: boolean; tempC: number; lastSync: string }
): void {
  const state = readJson<AutonomousTriggerState>(AUTO_TRIGGERS_FILE, {
    lastLowBatteryAt: 0,
    lastHighTempAt: 0,
    lastReconnectAt: 0,
  });
  const now = Date.now();
  let updated = false;

  state.lastPhoneSeen = now;
  if (state.lockedByProximity) {
    state.lockedByProximity = false;
    const msg = `Bienvenido de vuelta, Zarate. Radar de proximidad restablecido al alcance de tu Spark 30.`;
    speakProactiveAlert("🛰️ Radar TARS: Enlace Restablecido", msg, msg, "normal");
    updated = true;
  }

  if (prev && prev.lastSync) {
    const prevMs = Date.parse(prev.lastSync);
    if (!Number.isNaN(prevMs) && now - prevMs > 10 * 60 * 1000 && now - state.lastReconnectAt > 10 * 60 * 1000) {
      try {
        const { triggerWelcomeProtocol } = require("./concierge");
        triggerWelcomeProtocol(false);
      } catch {
        const msg = `Bienvenido de vuelta, comandante Zárate. Tu Tecno Spark 30 se ha reconectado al núcleo.`;
        speakProactiveAlert("⚡ Enlace TARS Restablecido", msg, msg, "normal");
      }
      state.lastReconnectAt = now;
      updated = true;
    }
  }

  if (!curr.charging && curr.battery <= 15 && now - state.lastLowBatteryAt > 30 * 60 * 1000) {
    const msg = `Alerta TARS: la batería de tu Tecno Spark 30 está al ${curr.battery} por ciento. Conéctalo al cargador.`;
    speakProactiveAlert("🔋 Batería Crítica en Spark 30", msg, msg, "critical");
    state.lastLowBatteryAt = now;
    updated = true;
  }

  if (curr.tempC >= 42.0 && now - state.lastHighTempAt > 20 * 60 * 1000) {
    const msg = `Atención Zarate: la temperatura de tu Tecno Spark 30 alcanzó ${curr.tempC} grados centígrados.`;
    speakProactiveAlert("🔥 Alerta Térmica Spark 30", msg, msg, "critical");
    state.lastHighTempAt = now;
    updated = true;
  }

  if (updated) {
    writeJson(AUTO_TRIGGERS_FILE, state);
  }
}

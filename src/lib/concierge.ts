/**
 * TARS // CONCIERGE & HOME WELCOMING PROTOCOL
 * Orchestrates warm, intelligent arrival greetings, notification aggregation,
 * and sequential, elegant audio briefings (WhatsApp, Emails, TARS Reminders).
 * Eliminates overlapping audio bursts ("desmadre") 100%.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { enqueueSpeech, clearSpeechQueue } from "./speechQueue";
import { loadReminders } from "./phoneLink";

const ROOT = process.cwd();
const INBOX_FILE = path.join(ROOT, "inbox_notifications.json");
const WELCOME_STATE_FILE = path.join(ROOT, "home_welcome_state.json");

export interface InboxItem {
  id: string;
  app: string;
  sender: string;
  text: string;
  timestamp: number;
  read: boolean;
}

export interface WelcomeState {
  lastWelcomeAt: number;
  awaitingConfirm: boolean;
  confirmExpiresAt: number;
  lastArrivalSyncAt: number;
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

export function loadInbox(): InboxItem[] {
  return readJson<InboxItem[]>(INBOX_FILE, []);
}

export function saveInbox(items: InboxItem[]): void {
  writeJson(INBOX_FILE, items.slice(-80));
}

export function getWelcomeState(): WelcomeState {
  return readJson<WelcomeState>(WELCOME_STATE_FILE, {
    lastWelcomeAt: 0,
    awaitingConfirm: false,
    confirmExpiresAt: 0,
    lastArrivalSyncAt: 0,
  });
}

export function saveWelcomeState(st: WelcomeState): void {
  writeJson(WELCOME_STATE_FILE, st);
}

/**
 * Stores an incoming phone notification quietly into the inbox and displays
 * an unobtrusive visual desktop banner without parallel audio screaming.
 */
export function recordIncomingNotification(app: string, sender: string, text: string): InboxItem | null {
  const cleanApp = String(app || "Móvil").trim();
  const cleanSender = String(sender || "Contacto").trim();
  const cleanText = String(text || "").trim();
  if (!cleanText && !cleanSender) return null;

  const inbox = loadInbox();
  const now = Date.now();

  // Deduplication: if the exact same message arrived within 15 seconds, ignore
  const duplicate = inbox.find(
    (item) =>
      item.app === cleanApp &&
      item.sender === cleanSender &&
      item.text === cleanText &&
      now - item.timestamp < 15000
  );
  if (duplicate) return null;

  const id = `notif_${now}_${Math.random().toString(36).slice(2, 6)}`;
  const item: InboxItem = {
    id,
    app: cleanApp,
    sender: cleanSender,
    text: cleanText,
    timestamp: now,
    read: false,
  };

  inbox.push(item);
  saveInbox(inbox);

  // Unobtrusive desktop banner on Hyprland (silent, visual only)
  try {
    spawn(
      "notify-send",
      ["-u", "normal", "-a", "TARS", `📱 ${cleanApp} — ${cleanSender}`, cleanText],
      { detached: true, stdio: "ignore" }
    ).unref();
  } catch {
    /* ignore */
  }

  return item;
}

/**
 * Returns a concise summary of pending items in the inbox.
 */
export function getInboxSummary(): {
  total: number;
  whatsappCount: number;
  emailCount: number;
  otherCount: number;
  senders: string[];
  unreadItems: InboxItem[];
  dueRemindersCount: number;
} {
  const inbox = loadInbox();
  const unreadItems = inbox.filter((i) => !i.read);

  let whatsappCount = 0;
  let emailCount = 0;
  let otherCount = 0;
  const sendersSet = new Set<string>();

  for (const item of unreadItems) {
    const appLower = item.app.toLowerCase();
    if (appLower.includes("whatsapp") || appLower.includes("wsp")) {
      whatsappCount++;
    } else if (appLower.includes("gmail") || appLower.includes("mail") || appLower.includes("correo")) {
      emailCount++;
    } else {
      otherCount++;
    }
    if (item.sender) sendersSet.add(item.sender);
  }

  // Count active TARS reminders for today
  const reminders = loadReminders();
  const now = Date.now();
  const dueReminders = reminders.filter((r) => !r.done && r.time >= now - 12 * 60 * 60 * 1000 && r.time <= now + 12 * 60 * 60 * 1000);

  return {
    total: unreadItems.length,
    whatsappCount,
    emailCount,
    otherCount,
    senders: Array.from(sendersSet),
    unreadItems,
    dueRemindersCount: dueReminders.length,
  };
}

/**
 * Formulates the distinguished TARS greeting based on the hour of the day.
 */
export function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return "Buenos días, comandante Zárate.";
  } else if (hour >= 12 && hour < 19) {
    return "Buenas tardes, comandante Zárate. Bienvenido a casa.";
  } else {
    return "Buenas noches, comandante Zárate. Bienvenido de vuelta a la base.";
  }
}

/**
 * Triggers the Home Welcome Protocol (Protocolo "Bienvenido a Casa").
 * Greets Zarate with warmth and executive poise, summarizes pending alerts,
 * and politely asks if he wants them read out loud.
 */
export function triggerWelcomeProtocol(force = false): {
  greeting: string;
  question: string;
  fullSpeech: string;
  hasPending: boolean;
  summary: ReturnType<typeof getInboxSummary>;
} {
  const state = getWelcomeState();
  const now = Date.now();

  // Rate limiter for automatic triggers (at most once every 20 minutes unless forced)
  if (!force && now - state.lastWelcomeAt < 20 * 60 * 1000) {
    const summary = getInboxSummary();
    return {
      greeting: "Bienvenido de vuelta, Zárate.",
      question: "",
      fullSpeech: "Bienvenido de vuelta, Zárate. Los sistemas siguen activos.",
      hasPending: summary.total > 0 || summary.dueRemindersCount > 0,
      summary,
    };
  }

  const greeting = getTimeGreeting();
  const summary = getInboxSummary();
  const totalItems = summary.total + summary.dueRemindersCount;

  let detailParts: string[] = [];
  if (summary.whatsappCount > 0) {
    const sendersPreview = summary.senders.slice(0, 3).join(", ");
    detailParts.push(
      `${summary.whatsappCount} ${summary.whatsappCount === 1 ? "mensaje" : "mensajes"} de WhatsApp${sendersPreview ? ` de ${sendersPreview}` : ""}`
    );
  }
  if (summary.emailCount > 0) {
    detailParts.push(`${summary.emailCount} ${summary.emailCount === 1 ? "correo nuevo" : "correos nuevos"}`);
  }
  if (summary.otherCount > 0) {
    detailParts.push(`${summary.otherCount} notificaciones adicionales`);
  }
  if (summary.dueRemindersCount > 0) {
    detailParts.push(`${summary.dueRemindersCount} ${summary.dueRemindersCount === 1 ? "recordatorio pendiente" : "recordatorios pendientes"}`);
  }

  let question = "";
  let fullSpeech = "";

  if (totalItems > 0) {
    const detailText = detailParts.join(", ");
    question = "¿Deseas que te los lea ahora?";
    fullSpeech = `${greeting} Alertas sincronizadas: tienes ${detailText}. ${question}`;

    // Mark that we are awaiting confirmation
    state.awaitingConfirm = true;
    state.confirmExpiresAt = now + 90 * 1000; // 90 seconds confirmation window
  } else {
    question = "¿Pongo música o activo algún protocolo?";
    fullSpeech = `${greeting} Todos los sistemas están al cien por ciento y no hay mensajes ni recordatorios pendientes. ${question}`;
    state.awaitingConfirm = false;
  }

  state.lastWelcomeAt = now;
  saveWelcomeState(state);

  // Play greeting via sequential speech queue (never overlap)
  enqueueSpeech({
    id: `welcome_${now}`,
    title: "⚡ TARS // BIENVENIDO A CASA",
    text: fullSpeech,
    priority: "normal",
    pauseAfterMs: 600,
  });

  return {
    greeting,
    question,
    fullSpeech,
    hasPending: totalItems > 0,
    summary,
  };
}

/**
 * Checks if TARS is currently awaiting confirmation to read notifications.
 */
export function isAwaitingNotificationConfirm(): boolean {
  const state = getWelcomeState();
  if (!state.awaitingConfirm) return false;
  if (Date.now() > state.confirmExpiresAt) {
    state.awaitingConfirm = false;
    saveWelcomeState(state);
    return false;
  }
  return true;
}

/**
 * Handles Zarate's response to the notification reading question.
 */
export function handleNotificationConfirmation(replyText: string): {
  handled: boolean;
  spokenReply: string;
  action: string;
} {
  const clean = replyText.toLowerCase().trim();
  const state = getWelcomeState();
  const summary = getInboxSummary();

  const isAffirmative =
    /\b(s[ií]|l[eé]elos|l[eé]eme|adelante|dale|a\s+ver|por\s+favor|claro|dime|escuchar|l[eé]erlas|ok|bueno|revisa)\b/i.test(clean);
  const isNegative =
    /\b(no|despu[eé]s|m[aá]s\s+tarde|luego|d[eé]jalo|silencio|cancelar|ahora\s+no|para\s+nada)\b/i.test(clean);

  if (isAffirmative) {
    state.awaitingConfirm = false;
    saveWelcomeState(state);

    if (summary.total === 0 && summary.dueRemindersCount === 0) {
      const msg = "Revisé la bandeja, pero no hay notificaciones ni recordatorios pendientes en este momento.";
      enqueueSpeech({ id: `read_empty_${Date.now()}`, text: msg, title: "📱 Bandeja al día" });
      return { handled: true, spokenReply: msg, action: "read_notifications_empty" };
    }

    // 1. Initial acknowledge
    enqueueSpeech({
      id: `ack_${Date.now()}`,
      text: "Leyendo tus alertas.",
      title: "📖 Leyendo notificaciones...",
      pauseAfterMs: 800,
    });

    // 2. Read each unread item sequentially
    const inbox = loadInbox();
    let idx = 1;

    for (const item of inbox) {
      if (item.read) continue;
      const appName = item.app.replace(/com\.whatsapp.*/i, "WhatsApp").replace(/com\.google\.android\.gm/i, "Gmail");
      const phrase = `Mensaje ${idx} de ${appName}, de ${item.sender}: "${item.text}".`;

      enqueueSpeech({
        id: `read_notif_${item.id}`,
        title: `📱 ${appName} — ${item.sender}`,
        text: phrase,
        pauseAfterMs: 850,
      });

      item.read = true;
      idx++;
    }
    saveInbox(inbox);

    // 3. Read pending TARS reminders
    const reminders = loadReminders();
    const now = Date.now();
    for (const rem of reminders) {
      if (!rem.done && rem.time >= now - 12 * 60 * 60 * 1000 && rem.time <= now + 12 * 60 * 60 * 1000) {
        enqueueSpeech({
          id: `read_rem_${rem.id}`,
          title: "⏰ Recordatorio Pendiente",
          text: `En tus recordatorios pendientes: "${rem.text}".`,
          pauseAfterMs: 850,
        });
      }
    }

    // 4. Wrap-up phrase
    const closing = "Eso es todo. Bandeja limpia.";
    enqueueSpeech({
      id: `read_done_${Date.now()}`,
      title: "✅ Bandeja Completa",
      text: closing,
      pauseAfterMs: 400,
    });

    return {
      handled: true,
      spokenReply: `Leyendo tus ${summary.total} notificaciones y recordatorios.`,
      action: "read_notifications_confirm",
    };
  }

  if (isNegative) {
    state.awaitingConfirm = false;
    saveWelcomeState(state);
    const msg = "Entendido, comandante Zárate. Las mantendré guardadas en su panel para cuando disponga. Que disfrute su descanso.";
    enqueueSpeech({ id: `cancel_read_${Date.now()}`, text: msg, title: "📱 Notificaciones Archivadas" });
    return { handled: true, spokenReply: msg, action: "read_notifications_decline" };
  }

  return { handled: false, spokenReply: "", action: "" };
}

/**
 * Directly reads all unread notifications on demand (e.g. if Zarate asks "léeme los mensajes").
 */
export function readAllNotificationsOnDemand(): string {
  clearSpeechQueue();
  const summary = getInboxSummary();

  if (summary.total === 0 && summary.dueRemindersCount === 0) {
    const msg = "No hay notificaciones pendientes. Disfruta el silencio.";
    enqueueSpeech({ id: `on_demand_empty_${Date.now()}`, text: msg, title: "📱 Bandeja al día" });
    return msg;
  }

  enqueueSpeech({
    id: `ack_ondemand_${Date.now()}`,
    text: `Tiene ${summary.total} alertas pendientes. Se las leo enseguida.`,
    title: "📖 Leyendo notificaciones...",
    pauseAfterMs: 750,
  });

  const inbox = loadInbox();
  let idx = 1;
  for (const item of inbox) {
    if (item.read) continue;
    const appName = item.app.replace(/com\.whatsapp.*/i, "WhatsApp").replace(/com\.google\.android\.gm/i, "Gmail");
    enqueueSpeech({
      id: `read_od_${item.id}`,
      title: `📱 ${appName} — ${item.sender}`,
      text: `Mensaje de ${appName}, de ${item.sender}: "${item.text}".`,
      pauseAfterMs: 850,
    });
    item.read = true;
    idx++;
  }
  saveInbox(inbox);

  const closing = "Lectura completada, Zárate.";
  enqueueSpeech({
    id: `read_od_done_${Date.now()}`,
    title: "✅ Bandeja Completa",
    text: closing,
    pauseAfterMs: 300,
  });

  return `Leyendo ${summary.total} alertas en orden secuencial.`;
}

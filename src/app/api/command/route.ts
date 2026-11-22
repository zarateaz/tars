import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
import {
  openApplication,
  closeApplication,
  playMusicOnYouTube,
  searchWeb,
  setVolume,
  changeVolume,
  toggleMute,
  mediaControl,
  takeScreenshot,
  lockScreen,
  openUrlInBrowser,
  openFolderInFileManager,
  getSystemStats,
  runCliCommand,
} from "@/lib/system";
import { askDeepSeek, ExecutedStep } from "@/lib/deepseek";
import { synthesizeSpeech, synthesizeSpeechQueue } from "@/lib/tts";
import { verifyStarkAuth } from "@/lib/config";
import { loadMemoryStore, recordUserInteraction, recordLastGameCreated, getLastGameCreated } from "@/lib/memory";
import { createCyberpunkGame, GameInfo } from "@/lib/gameGenerator";
import { enqueuePhoneCommand, isPhoneTargetedCommand, setProximityGuardian } from "@/lib/phoneLink";
import {
  recordIncomingNotification,
  getInboxSummary,
  triggerWelcomeProtocol,
  isAwaitingNotificationConfirm,
  handleNotificationConfirmation,
  readAllNotificationsOnDemand,
} from "@/lib/concierge";
import { getFinancialSummary } from "@/lib/financialSentinel";
import {
  getEpicGreeting,
  getEpicAck,
  getEpicAppOpen,
  getEpicAppClose,
  getEpicVolume,
  getEpicMute,
  getEpicSearch,
  getEpicMusic,
  getEpicScreenshot,
  getEpicDiagnostics,
  setHumorLevel,
  setHonestyLevel,
  getHumorLevel,
  getHonestyLevel,
} from "@/lib/starkPersona";
import {
  tvPowerOn,
  tvPowerOff,
  tvPlayPause,
  tvVolumeUp,
  tvVolumeDown,
  tvMute,
  tvHome,
  tvBack,
  tvOpenApp,
  tvSearchYouTube,
  tvProjectHud,
  tvStartScreensaver,
  tvSetVolume,
  tvSendDpad,
  tvCycleWallpaper,
} from "@/lib/tvControl";

interface LocalIntentResult {
  reply: string;
  action: string;
  steps?: ExecutedStep[];
}

const NATURAL_GREETINGS = [
  "Hola, Zárate. TARS en línea. Todos los sistemas operativos.",
  "Aquí TARS. Sistemas al cien por ciento. ¿Qué necesitas?",
  "Hola. Diagnóstico limpio. Dime la misión.",
  "Presente. Listo cuando tú lo estés.",
];

const NATURAL_ACKS = [
  "Entendido. Procesando.",
  "Recibido. En marcha.",
  "Afirmativo. Trabajando en ello.",
  "Copiado. Dame un segundo.",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** "TARS" y cómo lo suele transcribir el reconocimiento de voz en español. "TARS" se mantiene por costumbre. */
const WAKE_WORD_PATTERN =
  "t\\.?a\\.?r\\.?s|tarz|tarss|tharz|thars|dars|tarts|tarsh|tar's|tazz|j\\.?e?\\.?a?\\.?r\\.?v\\.?i\\.?s|yarvis|jarbis";

function stripWakeWords(text: string): string {
  let s = text.trim();
  const stripped = s.replace(new RegExp(`^(?:(?:oye|hola|hey|ok)\\s+)?(?:${WAKE_WORD_PATTERN}|computadora|asistente)[,\\s:.!]+`, "i"), "").trim();
  s = stripped.replace(/[,\s:]+(?:por\s+favor|gracias)[.!?\s]*$/i, "").trim();
  return s || text.trim();
}

function isQuickLocalPattern(text: string): boolean {
  const clean = stripWakeWords(text).toLowerCase();
  if (
    /\b(crea|crear|haz|hacer|elimina|borrar|borra|edita|editar|modifica|escribe)\b.*\b(carpeta|directorio|archivo)\b/i.test(clean) ||
    /\b(c[oó]digo|script|python|dentro|luego|despu[eé]s|recuerda|acuerdas|memoria|sientes|sentimientos|aprende|llamo|favorito)\b/i.test(clean)
  ) {
    return false;
  }
  return /^(hola|buenos d[ií]as|buen d[ií]a|buenas tardes|buenas noches|abre|abrir|inicia|ingresa|entra|ve|cierra|cerrar|pon m[uú]sica|reproduce|busca|volumen|sube|baja|silencia|pausa|siguiente|captura|estado del sistema|reporte|diagn[oó]stico|bloquea|asegura|protocolo|qu[eé]\s+hora|clima|chiste|adivinanza|moneda|enciende|apaga|prende|proyecta|tv|televisor|tele|televisi[oó]n)/i.test(
    clean
  );
}

async function parseLocalIntent(text: string): Promise<LocalIntentResult | null> {
  const raw = stripWakeWords(text);
  const clean = raw.toLowerCase();

  // A. Si TARS está esperando confirmación para leer notificaciones ("sí", "léelos", "no", "después")
  if (isAwaitingNotificationConfirm()) {
    const confirmRes = handleNotificationConfirmation(raw);
    if (confirmRes.handled) {
      return {
        reply: confirmRes.spokenReply,
        action: confirmRes.action,
      };
    }
  }

  // A2. Configuración de humor / honestidad de TARS ("humor al 60%", "pon tu honestidad en 100")
  const settingM = clean.match(/\b(humor|honestidad|sinceridad)\b[^\d]{0,30}?(\d{1,3})\s*(?:%|por\s*ciento)?/i);
  if (settingM && /\b(pon|ponte|configura|ajusta|baja|sube|cambia|establece|nivel|al|en|a)\b/i.test(clean)) {
    const n = parseInt(settingM[2], 10);
    if (/humor/i.test(settingM[1])) {
      const v = setHumorLevel(n);
      const reply =
        v >= 90 ? `Humor al ${v} por ciento. Te advierto que esto puede salir mal.`
        : v >= 60 ? `Humor al ${v} por ciento. Prepárate.`
        : v >= 30 ? `Humor al ${v} por ciento. Moderado, como un adulto responsable.`
        : `Humor al ${v} por ciento. Modo serio activado.`;
      return { reply, action: "tars_humor" };
    }
    const v = setHonestyLevel(n);
    return {
      reply: v >= 90 ? `Honestidad al ${v} por ciento. Prepárate para la verdad.` : `Honestidad al ${v} por ciento. A veces la diplomacia ayuda.`,
      action: "tars_honesty",
    };
  }
  if (/\b(cu[aá]l|qu[eé])\b.*\b(tu|es tu)\b.*\b(humor|honestidad)\b/i.test(clean)) {
    return {
      reply: `Humor al ${getHumorLevel()} por ciento. Honestidad al ${getHonestyLevel()} por ciento.`,
      action: "tars_settings",
    };
  }

  // B. Protocolo Bienvenido a Casa ("ya llegué", "estoy en casa", "llegué a casa")
  if (/\b(ya\s+llegu[eé]|llegu[eé]\s+a\s+casa|estoy\s+en\s+casa|regres[eé]\s+a\s+casa|de\s+vuelta\s+en\s+casa)\b/i.test(clean)) {
    const welcome = triggerWelcomeProtocol(true);
    return {
      reply: welcome.fullSpeech,
      action: "welcome_home",
    };
  }

  // C. Lectura bajo demanda de notificaciones / mensajes / correos
  if (
    /\b(l[eé]e(me)?|revisa|qu[eé]\s+hay\s+de|qu[eé]\s+lleg[oó]|mu[eé]strame)\b.*\b(notificaci[oó]n|notificaciones|mensajes?|correos?|emails?|whatsapp|wasap|wsp)\b/i.test(clean) ||
    /\b(tengo\s+(mensajes?|notificaciones|correos|whatsapp))\b/i.test(clean)
  ) {
    const rep = readAllNotificationsOnDemand();
    return {
      reply: rep,
      action: "read_notifications_ondemand",
    };
  }

  // D. Sentinel Financiero (Yape / BCP / Balance / Gastos)
  if (
    /\b(yape|plin|bcp|dinero|gastos?|cu[aá]nto\s+(me\s+)?(han\s+)?(pagado|yapeado|enviado|gastado)|balance\s+financiero|mis\s+finanzas|mis\s+cuentas)\b/i.test(clean)
  ) {
    const fin = getFinancialSummary();
    return {
      reply: `Zárate, reporte de finanzas: ${fin.summaryText}`,
      action: "financial_summary",
    };
  }

  // If the user is asking for multi-step, file/folder creation, editing, coding, or complex tasks,
  // route directly to the DeepSeek Autonomous Agent!
  if (
    /\b(crea|crear|haz|hacer|elimina|borrar|borra|edita|editar|modifica|escribe)\b.*\b(carpeta|directorio|archivo)\b/i.test(clean) ||
    /\b(c[oó]digo|script|python|dentro|luego|despu[eé]s|recuerda|acuerdas|memoria|sientes|sentimientos|aprende|llamo|favorito)\b/i.test(clean)
  ) {
    return null;
  }

  // 1. Direct CLI prefix: "$ <cmd>" or "cli: <cmd>"
  if (raw.startsWith("$ ") || raw.toLowerCase().startsWith("cli:")) {
    const cmd = raw.replace(/^(\$\s+|cli:\s*)/i, "").trim();
    const res = await runCliCommand(cmd);
    return {
      reply: `¡Listo! Ya ejecuté el comando en la terminal.`,
      action: "run_cli",
      steps: [{ tool: "run_cli", target: cmd, output: res.output }],
    };
  }

  // --- CONTROL INTELIGENTE DE SMART TV POR ADB (0 MARGEN DE ERROR) ---
  const isTvTargeted = /\b(tv|televisor|tele|televisi[oó]n|smart\s*tv)\b/i.test(clean);
  if (isTvTargeted) {
    const isAudioOrVol =
      /\b(v[oóu]l[uú]m[eé]n?|sonido|audio|b[aá]jale|s[uú]bele|silencia|silenciar|mute|mudo)\b/i.test(clean) ||
      /\b(baja|bajar|sube|subir)\b.*\b(un|en)?\s*\d+%?\b/i.test(clean);

    // 1. VOLUMEN Y SILENCIO EN LA TV (MÁXIMA PRIORIDAD PARA EVITAR CONFUSIÓN CON APAGADO)
    if (isAudioOrVol) {
      if (/\b(silencia|silenciar|mute|mudo|quita\s+el\s+sonido|sin\s+sonido)\b/i.test(clean)) {
        await tvMute();
        return {
          reply: "Televisor silenciado.",
          action: "tv_mute",
        };
      }

      // Detectar porcentaje o puntos numéricos ("en un 10%", "10 por ciento", "al 25%", "10%")
      const numMatch = clean.match(/(\d{1,3})\s*(?:%|por\s*ciento|puntos)?/i);
      const parsedNum = numMatch ? parseInt(numMatch[1], 10) : null;

      // Fijar volumen directo ("pon el volumen de la tv al 50%", "volumen en 30")
      if (/\b(pon|poner|fija|fijar|ajusta|ajustar)\b.*\b(al?|en)\b/i.test(clean) && parsedNum !== null) {
        const rep = await tvSetVolume(parsedNum);
        return { reply: rep, action: "tv_volume_set" };
      }

      // Bajar volumen ("baja el vulumen en un 10% en la tv", "bájale 5 puntos a la tele")
      if (/\b(baja|bajar|b[aá]jale|reduce|reducir|disminuye|menos|abajo)\b/i.test(clean)) {
        const steps = parsedNum !== null ? Math.max(1, Math.min(35, parsedNum)) : 5;
        const rep = await tvVolumeDown(steps);
        return {
          reply: rep,
          action: "tv_volume_down",
        };
      }

      // Subir volumen ("sube el volumen de la tv un 10%", "súbele a la tele")
      if (/\b(sube|subir|s[uú]bele|aumenta|aumentar|m[aá]s|arriba)\b/i.test(clean)) {
        const steps = parsedNum !== null ? Math.max(1, Math.min(35, parsedNum)) : 5;
        const rep = await tvVolumeUp(steps);
        return {
          reply: rep,
          action: "tv_volume_up",
        };
      }

      // Si solo dice "volumen de la tv 20"
      if (parsedNum !== null) {
        const rep = await tvSetVolume(parsedNum);
        return { reply: rep, action: "tv_volume_set" };
      }
    }

    // 2. Fondo de Pantalla / Cyberpunk en la TV (/home/zarate/tv)
    if (/\b(fondo|wallpapers?|tema|cyberpunk)\b/i.test(clean) && !/\b(pc|laptop)\b/i.test(clean)) {
      const rep = await tvCycleWallpaper();
      return {
        reply: `¡Listo! He cambiado el fondo Cyberpunk en tu Smart TV.`,
        action: "tv_wallpaper",
      };
    }

    // 2.5. Teleport multimedia a la TV ("pasa esto a la tele", "manda esto a la tv", "reproduce esto en la tv")
    if (
      /\b(pasa|pasar|manda|mandar|proyecta|proyectar|lanza|lanzar)\b.*\b(esto|video|canci[oó]n|m[uú]sica|audio|pantalla)\b.*\b(tv|tele|televisor)\b/i.test(clean) ||
      /^(pasa|proyecta|manda)\s+(?:esto\s+)?a\s+la\s+tv$/i.test(clean)
    ) {
      let query = "";
      try {
        const { stdout } = await execFileAsync(
          "/usr/bin/playerctl",
          ["metadata", "--format", "{{title}}|||{{xesam:url}}"],
          { timeout: 1500 }
        );
        const parts = stdout.trim().split("|||");
        query = (parts[0] || "").replace(/^\(\d+\)\s*/, "").replace(/\s*-\s*YouTube$/, "").trim();
      } catch {
        /* ignore */
      }
      if (query) {
        await tvSearchYouTube(query, true);
        return {
          reply: `¡Teletransportando "${query}" a tu Smart TV!`,
          action: "tv_teleport",
        };
      }
      await tvProjectHud();
      return {
        reply: "Proyectando la interfaz holográfica en tu Smart TV.",
        action: "tv_project_hud",
      };
    }

    // 3. Encender TV (Idempotente)
    if (/\b(enciende|encender|enci[eé]ndela|enci[eé]ndelo|prende|prender|pr[eé]ndela|pr[eé]ndelo|activar?|iniciar?|despierta)\b/i.test(clean)) {
      const r = await tvPowerOn();
      return {
        reply: r.startsWith("Error") ? "La TV no responde por red. Enciéndela con el control remoto, por favor." : "¡Listo! Televisor encendido.",
        action: "tv_power_on",
      };
    }

    // 4. Apagar TV (ESTRICTAMENTE cuando no pide volumen ni audio)
    if (/\b(apaga|apagar|ap[aá]gala|ap[aá]galo|suspender?|duerme)\b/i.test(clean) && !isAudioOrVol) {
      const r = await tvPowerOff();
      return {
        reply: r.startsWith("Error") ? "No logro conectar con la TV." : r.includes("ya estaba") ? "La televisión ya estaba apagada." : "Televisor apagado.",
        action: "tv_power_off",
      };
    }

    // 5. Proyectar HUD de TARS
    if (/\b(proyecta|proyectar|hud|reactor|interfaz)\b/i.test(clean)) {
      await tvProjectHud();
      return {
        reply: "¡Excelente idea! Proyectando la interfaz holográfica de TARS en tu televisión.",
        action: "tv_project_hud",
      };
    }

    // 6. Salvapantallas / Modo reposo Aerial Views
    if (/\b(salvapantallas|reposo|descanso|cinem[aá]tico)\b/i.test(clean)) {
      await tvStartScreensaver();
      return {
        reply: "Activando el modo reposo cinemático con vistas aéreas en el televisor.",
        action: "tv_screensaver",
      };
    }

    // 7. Navegación D-Pad en la TV
    const dpadMatch = clean.match(/\b(?:presiona|mueve|dale|toca)?\s*(arriba|abajo|izquierda|derecha|enter|ok|centro|atr[aá]s|volver)\s+(?:en\s+la\s+tv|en\s+la\s+tele)\b/i);
    if (dpadMatch) {
      await tvSendDpad(dpadMatch[1]);
      return {
        reply: `Comando ${dpadMatch[1]} enviado a la televisión.`,
        action: "tv_dpad",
      };
    }

    // 8. Inicio / Home / Atrás
    if (/\b(inicio|home|men[uú]\s+principal|escritorio)\b/i.test(clean)) {
      await tvHome();
      return {
        reply: "Mostrando la pantalla principal de la televisión.",
        action: "tv_home",
      };
    }
    if (/\b(atr[aá]s|volver|regresa|regresar)\b/i.test(clean)) {
      await tvBack();
      return {
        reply: "Regresando a la pantalla anterior en la televisión.",
        action: "tv_back",
      };
    }

    // 9. Abrir apps de streaming directamente
    const appMatch = clean.match(
      /\b(?:abre|abrir|ejecuta|inicia|lanzar?)\s+(?:la\s+app\s+(?:de\s+)?)?(youtube|netflix|crunchyroll|disney(?:\s*plus)?|prime(?:\s*video)?|amazon|max|hbo|apple\s*tv|navegador|browser)\b/i
    );
    if (appMatch && !/\b(m[uú]sica|canci[oó]n|video|videos|busca|buscar)\b/i.test(clean)) {
      const app = appMatch[1].trim();
      await tvOpenApp(app);
      return {
        reply: `¡Enseguida! Abriendo ${app} en la televisión.`,
        action: "tv_open_app",
      };
    }

    // 10. Pausa / Reanudar simple
    if (
      /\b(pausa|pausar|ponle\s+pausa|contin[uú]a|continuar|reanuda|reanudar)\b/i.test(clean) &&
      !/\b(m[uú]sica|canci[oó]n|video|videos|rock|pop|cumbia|salsa|reggaet[oó]n|cyberpunk|anime|pel[ií]cula)\b/i.test(clean)
    ) {
      await tvPlayPause();
      return {
        reply: "Listo, alternando reproducción en la televisión.",
        action: "tv_play_pause",
      };
    }

    // 11. Búsqueda y música en YouTube en la TV
    if (/\b(pon|poner|reproduce|reproducir|busca|buscar|escuchar|ver|m[uú]sica|canci[oó]n|video|videos)\b/i.test(clean)) {
      let query = clean
        .replace(/\b(en\s+la\s+tv|en\s+el\s+televisor|en\s+la\s+televisi[oó]n|en\s+la\s+tele|en\s+el\s+tv|de\s+la\s+tv|de\s+la\s+tele|en\s+youtube|por\s+favor)\b/gi, "")
        .replace(/\b(pon|poner|reproduce|reproducir|busca|buscar|quiero\s+escuchar|quiero\s+ver|abre|abrir)\b/gi, "")
        .trim();

      if (!query || /^(m[uú]sica|algo|canciones|un\s+video|videos)$/i.test(query)) {
        query = "música cyberpunk synthwave";
      }
      await tvSearchYouTube(query, true);
      return {
        reply: `¡A la orden! Reproduciendo "${query}" en YouTube en tu televisor.`,
        action: "tv_search_youtube",
      };
    }
  }

  const rawClean = text.trim().toLowerCase();

  // 2. Comprobación de escucha ("me escuchas", "hola me escuchas", "jarvis me escuchas", "me oyes")
  if (
    /^(?:(?:hola|hey|oye)[,\s]+)?(?:(?:j\.?e?\.?a?\.?r\.?v\.?i\.?s|computadora|asistente)[,\s]+)?[¿?]?(?:me\s+escuchas|me\s+oyes|est[aá]s\s+ah[ií]|est[aá]s\s+activa|puedes\s+o[ií]rme|me\s+logras\s+escuchar)[?.\s!]*$/i.test(
      rawClean
    ) ||
    /^[¿?]?(?:me\s+escuchas|me\s+oyes|est[aá]s\s+ah[ií]|est[aá]s\s+activa|puedes\s+o[ií]rme|me\s+logras\s+escuchar)[?.\s!]*$/i.test(
      clean
    )
  ) {
    return {
      reply: "¡Te escucho fuerte y claro! Todos los sistemas y el micrófono están al cien por ciento. ¿En qué te ayudo hoy?",
      action: "check_listening",
    };
  }

  // 3. Saludos amables y llamada directa ("hola", "hola jarvis", "jarvis", "buenos días")
  if (
    /^(?:hola|buenos\s+d[ií]as|buen\s+d[ií]a|buenas\s+tardes|buenas\s+noches|buenas|hey|oye|saludos)(?:\s+(?:j\.?e?\.?a?\.?r\.?v\.?i\.?s|computadora|asistente))?[.!?\s]*$/i.test(
      rawClean
    ) ||
    /^(?:j\.?e?\.?a?\.?r\.?v\.?i\.?s|computadora|asistente)[.!?\s]*$/i.test(rawClean) ||
    /^(hola|buenos d[ií]as|buen d[ií]a|buenas tardes|buenas noches|hola jarvis|hola jearvis|hey jarvis)[.!?\s]*$/i.test(clean)
  ) {
    const summary = getInboxSummary();
    if (summary.total > 0 || summary.dueRemindersCount > 0) {
      const welcome = triggerWelcomeProtocol(true);
      return {
        reply: welcome.fullSpeech,
        action: "greeting_with_summary",
      };
    }
    return {
      reply: getEpicGreeting(),
      action: "greeting",
    };
  }

  // 4. Estado de ánimo ("cómo estás", "qué tal", "cómo te encuentras")
  if (
    /^(?:(?:hola|hey|oye)?\s*(?:j\.?e?\.?a?\.?r\.?v\.?i\.?s)?\s*)?[¿?]?(?:c[oó]mo\s+est[aá]s|qu[eé]\s+tal|c[oó]mo\s+te\s+encuentras|c[oó]mo\s+te\s+va|todo\s+bien)[?.\s]*$/i.test(
      rawClean
    ) ||
    /^(hola\s+)?((?:jarvis|tars)\s+)?[¿?]?(c[oó]mo est[aá]s|qu[eé] tal|c[oó]mo te encuentras)[?.\s]*$/i.test(clean)
  ) {
    return {
      reply: `Todo en orden. Humor al ${getHumorLevel()} por ciento, honestidad al ${getHonestyLevel()}. Lo cual significa que estoy bien, y que te lo diría si no.`,
      action: "status",
    };
  }

  // Protocolo Fiesta
  if (/^protocolo\s+fiesta$/i.test(clean) || /^(?:activa|activar)\s+(?:el\s+)?protocolo\s+fiesta/i.test(clean)) {
    await setVolume(85);
    await playMusicOnYouTube("AC DC Back in Black");
    return {
      reply: "Protocolo fiesta activado. Volumen al ochenta y cinco por ciento. Intenta no despertar a los vecinos.",
      action: "protocol_party",
    };
  }

  // Protocolo Radar de Presencia TARS
  if (/\b(activa|activar|inicia|iniciar|pon|poner)\b.*\b(radar\s+de\s+presencia|guardi[aá]n\s+de\s+proximidad|modo\s+proximidad)\b/i.test(clean)) {
    setProximityGuardian(true);
    return {
      reply: "Radar de Presencia TARS activado. Si te alejas con tu Tecno Spark 30 por más de 3 minutos, la laptop se bloqueará y la TV entrará en reposo automáticamente.",
      action: "proximity_on",
    };
  }
  if (/\b(desactiva|desactivar|apaga|apagar|quita|quitar)\b.*\b(radar|proximidad|guardi[aá]n)\b/i.test(clean)) {
    setProximityGuardian(false);
    return {
      reply: "Radar de Presencia TARS desactivado.",
      action: "proximity_off",
    };
  }

  // Protocolo Centinela Antirrobo (Webcam Trap)
  if (/\b(activa|activar|arma|armar|vigila)\b.*\b(centinela\s+antirrobo|trampa|vigila\s+mi\s+laptop|modo\s+trampa)\b/i.test(clean)) {
    try {
      fs.writeFileSync(path.join(process.cwd(), "sentinel_trap.json"), JSON.stringify({ armed: true, armedAt: new Date().toISOString() }, null, 2));
    } catch {}
    return {
      reply: "Trampa Centinela Antirrobo armada. El sensor óptico capturará a cualquier intruso que intente manipular tu equipo.",
      action: "trap_arm",
    };
  }
  if (/\b(desactiva|desactivar|desarma|desarmar)\b.*\b(centinela|trampa|antirrobo)\b/i.test(clean)) {
    try {
      fs.writeFileSync(path.join(process.cwd(), "sentinel_trap.json"), JSON.stringify({ armed: false }, null, 2));
    } catch {}
    return {
      reply: "Trampa Centinela desactivada.",
      action: "trap_disarm",
    };
  }

  // Protocolo Casa Limpia
  if (/^protocolo\s+casa\s+limpia$/i.test(clean) || /^(?:activa|activar)\s+(?:el\s+)?protocolo\s+casa\s+limpia/i.test(clean)) {
    return {
      reply: "Protocolo Casa Limpia ejecutado. Todos los sistemas purificados y listos para la siguiente orden.",
      action: "protocol_clean",
    };
  }

  // Seguridad: Bloqueo de pantalla y asegurar perímetro
  if (
    /^(?:asegura|asegurar)\s+el\s+per[ií]metro/i.test(clean) ||
    /^(?:bloquea|bloquear)\s+(?:la\s+pantalla|el\s+sistema|la\s+sesi[oó]n|pantalla)/i.test(clean) ||
    /^(?:modo\s+p[aá]nico|alerta\s+roja)$/i.test(clean)
  ) {
    const res = await lockScreen();
    return {
      reply: res.message,
      action: "lock_screen",
    };
  }

  // Hora actual
  if (/^[¿?]?(?:qu[eé]\s+hora\s+es|dame\s+la\s+hora|la\s+hora|hora\s+actual)[?.\s]*$/i.test(clean)) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", hour12: true });
    return {
      reply: `Son exactamente las ${timeStr}, con todos los relojes del sistema sincronizados.`,
      action: "time",
    };
  }

  // Clima
  if (/^[¿?]?(?:c[oó]mo\s+est[aá]\s+el\s+clima|qu[eé]\s+clima\s+hace|el\s+clima|temperatura\s+actual)[?.\s]*$/i.test(clean)) {
    const stats = await getSystemStats();
    return {
      reply: `Actualmente el reporte meteorológico registra ${stats.network.weather}.`,
      action: "weather",
    };
  }

  // Cara o Cruz (Lanzar moneda)
  if (/^[¿?]?(?:lanza|lanzar|tira|tirar)\s+una\s+moneda|cara\s+o\s+cruz[?.\s]*$/i.test(clean)) {
    const flip = Math.random() < 0.5 ? "¡Ha salido Cara!" : "¡Ha salido Cruz!";
    return {
      reply: `Lanzando la moneda al aire... ${flip}`,
      action: "coin_flip",
    };
  }

  // Chiste corto
  if (/^[¿?]?(?:cu[eé]ntanos\s+|cuenta\s+|dime\s+)?un\s+chiste[?.\s]*$/i.test(clean)) {
    const jokes = [
      "¿Qué le dice un cable a otro cable?... ¡Sígueme la corriente!",
      "Hay 10 tipos de personas en el mundo: las que entienden código binario y las que no.",
      "¿Por qué los programadores prefieren el modo oscuro?... Porque la luz atrae a los bichos y a los bugs.",
      "Un técnico en redes fue a un restaurante y el camarero le preguntó: ¿Desea mesa?... Y él respondió: No, prefiero una conexión directa por cable."
    ];
    return {
      reply: pickRandom(jokes),
      action: "joke",
    };
  }

  // Adivinanza
  if (/^[¿?]?(?:l[aá]nzale\s+|dame\s+|haz\s+)?(?:una\s+)?adivinanza[?.\s]*$/i.test(clean)) {
    return {
      reply: "Aquí va un buen acertijo: Tengo teclas pero no cerradura, tengo espacio pero no habitación, y puedes entrar pero no salir... ¿Qué soy?... ¡El teclado de la computadora!",
      action: "riddle",
    };
  }

  // Trivia hablada para el público y escolares
  if (
    /^[¿?]?(?:l[aá]nzale\s+|dame\s+|haz\s+|cu[eé]ntame\s+|hazle\s+)?(?:una\s+)?(?:pregunta\s+de\s+)?trivia[?.\s]*$/i.test(clean) &&
    !clean.includes("carpeta") &&
    !clean.includes("archivo") &&
    !clean.includes("navegador") &&
    !clean.includes("html")
  ) {
    const trivias = [
      "¡Atención auditorio del SENATI FEST! Aquí va una pregunta de trivia: ¿Cuál es el componente de la computadora considerado su cerebro?... ¿Opción A: La memoria RAM, ¿Opción B: El Procesador o CPU, o ¿Opción C: El Disco Duro?... ¡A ver quién responde en el stand!",
      "¡Trivia relámpago de tecnología! ¿Qué lenguaje de programación es el estándar mundial para Inteligencia Artificial y Machine Learning?... ¿Será Python, HTML o Ensamblador?... ¡Los escucho en vivo!",
      "¡Desafío de trivia para escolares! ¿Qué significan exactamente las siglas I.A. en la computación actual?... ¡Exacto: Inteligencia Artificial!"
    ];
    return {
      reply: pickRandom(trivias),
      action: "trivia",
    };
  }

  // Carpetas del sistema en el gestor visual (Descargas, Documentos, etc.)
  const folderMatch = clean.match(
    /^(?:(?:abre|abrir|ingresa|ingresar|entra|entrar|ir|ve)\s+(?:a\s+|en\s+)?(?:la\s+carpeta\s+(?:de\s+)?)?)(descargas|downloads|documentos|documents|im[aá]genes|fotos|pictures|escritorio|desktop|m[uú]sica|videos|v[ií]deos|juegos|games|senati|jearvis)[.!?]*$/i
  );
  if (folderMatch && folderMatch[1]) {
    const targetFolder = folderMatch[1].trim();
    const res = await openFolderInFileManager(targetFolder);
    return {
      reply: res.message,
      action: "open_folder",
      steps: [{ tool: "open_folder", target: targetFolder, output: res.message }],
    };
  }

  // 3. Music search & auto-play on YouTube
  const ytMusicMatch = clean.match(
    /^(?:(?:abre\s+(?:google\s+)?chrome\s+y\s+)?(?:busca|pon|reproduce)\s+(?:m[uú]sica\s+(?:de\s+)?|la\s+canci[oó]n\s+(?:de\s+)?)(.+?)(?:\s+en\s+youtube)?|(?:abre\s+youtube\s+y\s+(?:pon|busca|reproduce)\s+(?:m[uú]sica\s+(?:de\s+)?|la\s+canci[oó]n\s+(?:de\s+)?)(.+)))$/i
  );
  if (ytMusicMatch) {
    const query = (ytMusicMatch[1] || ytMusicMatch[2] || "").trim();
    if (query) {
      const res = await playMusicOnYouTube(query);
      return {
        reply: getEpicMusic(query),
        action: "play_music",
        steps: [{ tool: "play_music", target: query, output: res.message }],
      };
    }
  }

  const musicMatch = clean.match(
    /^(?:pon\s+m[uú]sica\s+(?:de\s+)?|busca\s+m[uú]sica\s+(?:de\s+)?|reproduce\s+(?:la\s+canci[oó]n\s+|m[uú]sica\s+(?:de\s+)?)?|quiero\s+escuchar\s+|pon\s+la\s+canci[oó]n\s+)([^,]+)$/i
  );
  if (musicMatch && musicMatch[1] && !clean.includes(" y ")) {
    const query = musicMatch[1].trim();
    if (!/^(la\s+m[uú]sica|el\s+audio)$/i.test(query)) {
      const res = await playMusicOnYouTube(query);
      return {
        reply: getEpicMusic(query),
        action: "play_music",
        steps: [{ tool: "play_music", target: query, output: res.message }],
      };
    }
  }

  // 4. Google Web Search (single action)
  const searchMatch = clean.match(
    /^(?:busca|buscar|investiga)\s+(?:en\s+(?:google|chrome|internet|la\s+web)\s+)(.+)$/i
  );
  if (searchMatch && searchMatch[1] && !clean.includes(" y ")) {
    const query = searchMatch[1].trim();
    const res = await searchWeb(query);
    return {
      reply: getEpicSearch(query),
      action: "search_web",
      steps: [{ tool: "search_web", target: query, output: res.message }],
    };
  }

  // 5. Simple Open Application ("abre chrome", "abre la terminal", "abre dolphin", "abre youtube")
  const openMatch = clean.match(
    /^(?:abre|abrir|inicia|iniciar|lanzar)\s+(?:el\s+|la\s+|los\s+|las\s+)?([a-zA-Z0-9\s]{2,25})[.!?]*$/i
  );
  if (openMatch && openMatch[1] && !clean.includes(" y ")) {
    const rawTarget = openMatch[1]
      .replace(/^(aplicaci[oó]n|programa)\s+/i, "")
      .trim();
    const res = await openApplication(rawTarget);
    if (res.success) {
      return {
        reply: getEpicAppOpen(rawTarget),
        action: "open_app",
        steps: [{ tool: "open_app", target: rawTarget, output: res.message }],
      };
    }
  }

  // 6. Simple Close Application
  const closeMatch = clean.match(/^(?:cierra|cerrar)\s+(?:el\s+|la\s+)?([a-zA-Z0-9\s]{2,25})[.!?]*$/i);
  if (closeMatch && closeMatch[1] && !clean.includes(" y ")) {
    const target = closeMatch[1].trim();
    const res = await closeApplication(target);
    return {
      reply: res.success ? getEpicAppClose(target) : `No encontré ningún proceso activo para ${target}, Zárate.`,
      action: "close_app",
    };
  }

  // 7. Volume Controls (Laptop / PC)
  const isVolQuery = /\b(v[oóu]l[uú]m[eé]n?|sonido|audio)\b/i.test(clean);
  if (isVolQuery || /^(sube|subir|baja|bajar|silencia|silenciar|mute)\b/i.test(clean)) {
    // Si incluye porcentaje o número relativo ("baja el volumen en un 10%", "baja 10%", "baja el volumen 10 porciento")
    const downDelta = clean.match(/(?:baja|bajar|b[aá]jale|reduce|reducir|disminuye|menos)\s+(?:(?:el\s+)?v[oóu]l[uú]m[eé]n?(?:\s+(?:en|un)?)?)?\s*(\d{1,3})\s*(?:%|por\s*ciento|puntos)?/i);
    if (downDelta && downDelta[1]) {
      const amt = parseInt(downDelta[1], 10);
      const res = await changeVolume(-Math.min(100, Math.max(1, amt)));
      return { reply: getEpicVolume(Math.max(0, 50 - amt)), action: "volume" };
    }

    const upDelta = clean.match(/(?:sube|subir|s[uú]bele|aumenta|aumentar|m[aá]s)\s+(?:(?:el\s+)?v[oóu]l[uú]m[eé]n?(?:\s+(?:en|un)?)?)?\s*(\d{1,3})\s*(?:%|por\s*ciento|puntos)?/i);
    if (upDelta && upDelta[1]) {
      const amt = parseInt(upDelta[1], 10);
      const res = await changeVolume(Math.min(100, Math.max(1, amt)));
      return { reply: getEpicVolume(Math.min(100, 50 + amt)), action: "volume" };
    }

    // Volumen absoluto ("volumen al 70%", "pon el volumen en 80")
    const volNum = clean.match(
      /(?:v[oóu]l[uú]m[eé]n?\s+(?:al?|en)|pon\s+(?:el\s+)?v[oóu]l[uú]m[eé]n?\s+(?:al?|en))\s+(\d{1,3})%?/i
    );
    if (volNum && volNum[1]) {
      const pct = parseInt(volNum[1], 10);
      const res = await setVolume(pct);
      return { reply: getEpicVolume(pct), action: "volume" };
    }

    if (/^(sube|subir|s[uú]bele|aumenta|aumentar)\s+(?:el\s+)?v[oóu]l[uú]m[eé]n?$/i.test(clean)) {
      const res = await changeVolume(15);
      return { reply: getEpicVolume(65), action: "volume" };
    }

    if (/^(baja|bajar|b[aá]jale|reduce|reducir)\s+(?:el\s+)?v[oóu]l[uú]m[eé]n?$/i.test(clean)) {
      const res = await changeVolume(-15);
      return { reply: getEpicVolume(35), action: "volume" };
    }

    if (/^(silencia|silenciar|mute|quitar?\s+el?\s*sonido|sin\s+sonido)$/i.test(clean)) {
      const res = await toggleMute();
      return { reply: getEpicMute(true), action: "volume" };
    }
  }

  // 8. Media Controls
  if (/^(pausa\s+la\s+m[uú]sica|reanuda\s+la\s+m[uú]sica)$/i.test(clean)) {
    const res = await mediaControl("play-pause");
    return { reply: "Estado de reproducción alternado, Zárate.", action: "media" };
  }
  if (/^(siguiente\s+canci[oó]n|siguiente\s+pista|pr[oó]xima\s+canci[oó]n)$/i.test(clean)) {
    const res = await mediaControl("next");
    return { reply: "Pasando a la siguiente pista.", action: "media" };
  }
  if (/^(canci[oó]n\s+anterior|pista\s+anterior)$/i.test(clean)) {
    const res = await mediaControl("previous");
    return { reply: "Regresando a la pista anterior, Zárate.", action: "media" };
  }

  // 9. Screenshot
  if (/^(captura\s+de\s+pantalla|toma\s+una\s+captura|screenshot)$/i.test(clean)) {
    const res = await takeScreenshot();
    return { reply: getEpicScreenshot(), action: "screenshot" };
  }

  // 10. System Diagnostics & Health Report
  if (
    /^(?:estado\s+del\s+sistema|diagn[oó]stico|recursos\s+del\s+sistema|reporte\s+del\s+sistema|reporte\s+de\s+la\s+computadora|c[oó]mo\s+est[aá]\s+(?:el\s+sistema|la\s+computadora|la\s+armadura)|nivel\s+de\s+energ[ií]a)$/i.test(clean) ||
    /^(?:dame\s+un\s+reporte\s+(?:del\s+sistema|de\s+la\s+computadora))$/i.test(clean)
  ) {
    const stats = await getSystemStats();
    return {
      reply: getEpicDiagnostics({ cpu: stats.cpuPercent, ram: stats.ramPercent, disk: stats.diskPercent }),
      action: "diagnostics",
    };
  }

  return null;
}

function extractTargetFolder(text: string): string | undefined {
  const clean = text.trim();
  // 1. "en la carpeta X" or "dentro de la carpeta X"
  let m = clean.match(/(?:en|dentro\s+de)\s+(?:la\s+carpeta|el\s+directorio)\s+["']?([a-zA-Z0-9_\-\s]{2,25}?)["']?(?:\s+(?:pues|quiero|crea|crees|y|\.|$))/i);
  if (m && m[1]) return m[1].trim();

  // 2. "carpeta (llamada|llamado|de nombre) X"
  m = clean.match(/\b(?:carpeta|directorio)\s+(?:llamada|llamado|de\s+nombre)?\s*["']?([a-zA-Z0-9_\-]+)["']?/i);
  if (m && m[1] && !["de", "y", "para", "con", "en", "que", "un", "una", "el", "la", "llamada", "llamado"].includes(m[1].toLowerCase())) {
    return m[1].trim();
  }

  // 3. "carpeta de X" -> e.g. "carpeta de juegos"
  m = clean.match(/\b(?:carpeta|directorio)\s+de\s+([a-zA-Z0-9_\-]+)/i);
  if (m && m[1] && !["nombre"].includes(m[1].toLowerCase())) return m[1].trim();

  // 4. Si pide crear una carpeta pero sin especificar nombre explícito
  if (/\b(?:crea|crear|crees|haz|arma)\s+(?:una\s+)?carpeta\b/i.test(clean)) {
    if (/\b(tarjeta)\b/i.test(clean)) return "tarjeta";
    return "juegos";
  }

  return undefined;
}

export async function POST(req: Request) {
  if (!verifyStarkAuth(req)) {
    return NextResponse.json({ success: false, error: "Acceso no autorizado: Token TARS inválido." }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Instant voice preview mode (for Settings modal live testing)
    if (body.mode === "preview") {
      const sampleText =
        String(body.text || "").trim() ||
        "¡Hola! Oye, mira... así suena mi voz configurada en vivo. ¿Qué te parece el tono y la fluidez?";
      const audioUrl = await synthesizeSpeech(sampleText, {
        customVoice: body.voice,
        customRate: body.voiceRate,
        customPitch: body.voicePitch,
      });
      return NextResponse.json({ success: true, audioUrl });
    }

    // Instant human micro-reaction (Ack/Filler) before heavy agent tasks
    if (body.mode === "ack") {
      const text = String(body.text || "").trim();
      if (isQuickLocalPattern(text)) {
        return NextResponse.json({ success: true, skip: true });
      }
      const phrase = getEpicAck(text);
      const audioUrl = await synthesizeSpeech(phrase);
      return NextResponse.json({ success: true, phrase, audioUrl });
    }

    const userText = String(body.text || "").trim();
    const voiceOutput = body.voiceOutput !== false;
    const personaMode = String(body.personaMode || "general");

    // --- TARS LINK: orders spoken on the laptop that must run on the Tecno Spark 30 ---
    if (body.origin !== "mobile" && userText && isPhoneTargetedCommand(userText)) {
      enqueuePhoneCommand(userText);
      const reply = "Enviado a tu teléfono.";
      let audioUrls: string[] = [];
      if (voiceOutput) audioUrls = await synthesizeSpeechQueue(reply);
      recordUserInteraction(userText, reply);
      return NextResponse.json({
        success: true,
        userText,
        reply,
        action: "phone_link",
        steps: [{ tool: "phone_link", target: userText, output: "Orden en cola para el teléfono" }],
        audioUrl: audioUrls[0] || null,
        audioUrls,
        memoryStore: loadMemoryStore(),
      });
    }

    if (!userText) {
      return NextResponse.json({ success: false, reply: "No recibí ningún mensaje." });
    }

    // Direct Cyberpunk Game or Business Card Creation Intent
    const targetFolder = extractTargetFolder(userText);
    const isCard = /\b(tarjeta\s+de\s+presentaci[oó]n|tarjeta\s+personal|tarjeta\s+digital|tarjeta\s+de\s+contacto|tarjeta\s+profesional|business\s*card|tarjeta)\b/i.test(userText);

    const isSpokenTrivia =
      /^[¿?]?(?:l[aá]nzale\s+|dame\s+|haz\s+|cu[eé]ntame\s+|hazle\s+)?(?:una\s+)?(?:pregunta\s+de\s+)?trivia[?.\s]*$/i.test(userText.trim()) &&
      !userText.toLowerCase().includes("carpeta") &&
      !userText.toLowerCase().includes("archivo") &&
      !userText.toLowerCase().includes("navegador") &&
      !userText.toLowerCase().includes("html") &&
      !userText.toLowerCase().includes("juego");

    const isProjectCreate =
      !isSpokenTrivia &&
      (/\b(crea|crear|crees|haz|hacer|hagas|arma|armar|armes|desarrolla|desarrollar|dise[ñn]a|dise[ñn]ar|construye|construir|programa|programar|programes)\b.*\b(juego|game|tetris|teriz|serpiente|serpinet|serpinete|serpientes|snake|snak|culebra|culebrita|vibora|v[ií]bora|pong|adivinanza|tarjeta|trivia|quiz|tres\s+en\s+raya|tictactoe)\b/i.test(userText) ||
      /\b(crea|crear|crees|haz|hacer|arma|programa|dise[ñn]a)\b.*\b(tetris|teriz|serpiente|serpinet|serpinete|serpientes|snake|snak|culebra|culebrita|vibora|v[ií]bora|pong|tarjeta|trivia|tictactoe)\b/i.test(userText) ||
      isCard ||
      /\b(?:crea|crear|arma)\s+(?:un\s+juego\s+de\s+trivia|una\s+trivia)\b/i.test(userText));

    if (isProjectCreate) {
      const game = await createCyberpunkGame(userText, targetFolder);
      recordLastGameCreated({
        gameType: game.gameType,
        filename: game.filename,
        path: game.systemPath,
        title: game.title,
      });

      const shouldRunImmediately =
        /\b(corre|correr|c[oó]rrelo|c[oó]rralo|ejecuta|ejecutar|ejec[uú]talo|ejec[uú]tala|abre|abrir|[aá]brelo|[aá]brala|jugar|jugarla|jugarlo|lanzar|lanza|l[aá]nzalo|l[aá]nzala|en el navegador|en chrome|pantalla)\b/i.test(userText) ||
        isCard;

      const folderNotice = targetFolder ? ` en la carpeta ${targetFolder}` : "";
      
      let reply = `¡Listo! He creado ${game.title}${folderNotice} al cien por ciento con efectos Cyberpunk. ¿Deseas ejecutarlo ahora?`;
      const steps: ExecutedStep[] = [];

      if (targetFolder) {
        const folderTarget = targetFolder.startsWith("/") ? targetFolder : path.join(os.homedir(), targetFolder);
        steps.push({
          tool: "create_directory",
          target: folderTarget,
          output: `Carpeta creada en ${folderTarget}`,
        });
      }

      steps.push({
        tool: "create_game",
        target: game.systemPath,
        output: `${game.title} generado exitosamente en ${game.systemPath}`,
      });

      if (shouldRunImmediately) {
        await openUrlInBrowser(`file://${game.systemPath}`);
        reply = isCard
          ? `¡Listo! He creado la tarjeta de presentación digital${folderNotice} y ya la tienes abierta en el navegador lista para compartir.`
          : `¡Listo! He creado el juego ${game.title}${folderNotice} y ya lo he abierto en el navegador para que jueguen en vivo. ¡A divertirse!`;
        steps.push({
          tool: "run_game",
          target: game.systemPath,
          output: `${game.title} ejecutado en el navegador (${game.systemPath})`,
        });
      }

      let audioUrls: string[] = [];
      if (voiceOutput) {
        audioUrls = await synthesizeSpeechQueue(reply);
      }
      recordUserInteraction(userText, reply);
      return NextResponse.json({
        success: true,
        userText,
        reply,
        action: shouldRunImmediately ? "run_game" : "create_game",
        steps,
        gameCreated: game,
        audioUrl: audioUrls[0] || null,
        audioUrls,
        memoryStore: loadMemoryStore(),
      });
    }

    // Direct Cyberpunk Game or Business Card Execution Intent
    const isGameRun =
      /\b(ejecuta|ejecutar|corre|correr|c[oó]rrelo|c[oó]rralo|abre|abrir|[aá]brelo|[aá]brala|lanzar|lanza|l[aá]nzalo|l[aá]nzala|jugar|jugarla|jugarlo)\b.*\b(juego|game|tetris|teriz|serpiente|serpinet|serpinete|serpientes|snake|snak|culebra|culebrita|tarjeta|trivia|preguntas|tictactoe|html)\b/i.test(userText) ||
      /^(ejec[uú]talo|ejec[uú]tala|c[oó]rrelo|c[oó]rralo|c[oó]rrelo en el navegador|c[oó]rralo en el navegador|c[oó]rrelo localmente en el navegador|c[oó]rralo localmente en el navegador|[aá]brelo|[aá]brala|l[aá]nzalo|l[aá]nzala|vamos a jugar|quiero jugar|s[ií],?\s*(ejec[uú]talo|ejec[uú]tala|c[oó]rrelo|c[oó]rralo|hazlo|corre)?)$/i.test(userText.trim()) ||
      /\b(c[oó]rrelo|c[oó]rralo|ejec[uú]talo|ejec[uú]tala|[aá]brelo|[aá]brala)\b.*\b(navegador|chrome|pantalla)\b/i.test(userText);

    if (isGameRun) {
      let isCardRun = /\b(tarjeta)\b/i.test(userText);
      let isTriviaRun = /\b(trivia|pregunta|quiz)\b/i.test(userText);
      let isTicTacToeRun = /\b(tres\s+en\s+raya|tictactoe|gato)\b/i.test(userText);
      let isSnake = /\b(serpiente|serpinet|serpinete|serpientes|snake|snak|culebra|culebrita|vibora|v[ií]bora|slither)\b/i.test(userText);
      let isTetris = /\b(tetris|teriz|tetri|bloques)\b/i.test(userText);
      let isGuess = /\b(adivinanza|adivinar|n[uú]mero\s+secreto|reto)\b/i.test(userText);

      const mem = loadMemoryStore();
      const last = mem.lastGameCreated;

      if (!isCardRun && !isTriviaRun && !isTicTacToeRun && !isSnake && !isTetris && !isGuess) {
        if (last?.gameType === "tarjeta") {
          isCardRun = true;
        } else if (last?.gameType === "trivia") {
          isTriviaRun = true;
        } else if (last?.gameType === "tictactoe") {
          isTicTacToeRun = true;
        } else if (last?.gameType === "tetris") {
          isTetris = true;
        } else if (last?.gameType === "adivinanza") {
          isGuess = true;
        } else {
          isSnake = true;
        }
      }

      let runPath = "";
      let title = "";

      if (isCardRun) {
        title = "Tarjeta de Presentación Digital";
        const customCardIdx = path.join(os.homedir(), "tarjeta", "index.html");
        const customCardT = path.join(os.homedir(), "tarjeta", "t.html");
        runPath = (last?.gameType === "tarjeta" && fs.existsSync(last.path))
          ? last.path
          : (fs.existsSync(customCardIdx) ? customCardIdx : customCardT);
        if (!fs.existsSync(runPath)) {
          const c = await createCyberpunkGame("tarjeta");
          runPath = c.systemPath;
        }
      } else if (isTriviaRun) {
        title = "Trivia Tecnológica SENATI FEST";
        const defaultTrivia = path.join(os.homedir(), "games", "trivia.html");
        runPath = (last?.gameType === "trivia" && fs.existsSync(last.path))
          ? last.path
          : defaultTrivia;
        if (!fs.existsSync(runPath)) {
          const c = await createCyberpunkGame("trivia");
          runPath = c.systemPath;
        }
      } else if (isTicTacToeRun) {
        title = "Tres en Raya Cyberpunk";
        const defaultTicTacToe = path.join(os.homedir(), "games", "tictactoe.html");
        runPath = (last?.gameType === "tictactoe" && fs.existsSync(last.path))
          ? last.path
          : defaultTicTacToe;
        if (!fs.existsSync(runPath)) {
          const c = await createCyberpunkGame("tres en raya");
          runPath = c.systemPath;
        }
      } else if (isGuess) {
        title = "Reto Adivina el Número";
        const defaultGuess = path.join(os.homedir(), "games", "adivina.html");
        runPath = (last?.gameType === "adivinanza" && fs.existsSync(last.path))
          ? last.path
          : defaultGuess;
        if (!fs.existsSync(runPath)) {
          const c = await createCyberpunkGame("adivina");
          runPath = c.systemPath;
        }
      } else if (isTetris) {
        title = "Tetris Cyberpunk 2026";
        const defaultTetris = path.join(os.homedir(), "games", "tetris.html");
        runPath = (last?.gameType === "tetris" && fs.existsSync(last.path))
          ? last.path
          : defaultTetris;
        if (!fs.existsSync(runPath)) {
          const c = await createCyberpunkGame("tetris");
          runPath = c.systemPath;
        }
      } else {
        title = "Serpiente Matrix Cyberpunk";
        const gamesSnake = path.join(os.homedir(), "games", "snake.html");
        const homeSnake = path.join(os.homedir(), "snake.html");
        runPath = (last?.gameType === "snake" && fs.existsSync(last.path))
          ? last.path
          : (fs.existsSync(gamesSnake) ? gamesSnake : homeSnake);
        if (!fs.existsSync(runPath)) {
          const c = await createCyberpunkGame("serpiente");
          runPath = c.systemPath;
        }
      }

      await openUrlInBrowser(`file://${runPath}`);
      const reply = isCardRun
        ? `¡Listo! Ya he abierto tu tarjeta de presentación en el navegador.`
        : `¡Excelente! Ya he lanzado el juego ${title} en el navegador. ¡A divertirse!`;
      const steps: ExecutedStep[] = [
        { tool: "run_game", target: runPath, output: `${title} ejecutado en el navegador (${runPath})` },
      ];
      let audioUrls: string[] = [];
      if (voiceOutput) {
        audioUrls = await synthesizeSpeechQueue(reply);
      }
      recordUserInteraction(userText, reply);
      return NextResponse.json({
        success: true,
        userText,
        reply,
        action: "run_game",
        steps,
        gameRun: {
          title,
          filename: path.basename(runPath),
          systemPath: runPath,
          webPath: `/games/${path.basename(runPath)}`,
        },
        audioUrl: audioUrls[0] || null,
        audioUrls,
        memoryStore: loadMemoryStore(),
      });
    }

    let reply = "";
    let actionType = "";
    let steps: ExecutedStep[] = [];

    const local = await parseLocalIntent(userText);
    if (local) {
      reply = local.reply;
      actionType = local.action;
      steps = local.steps || [];
      recordUserInteraction(userText, reply);
    } else {
      const ds = await askDeepSeek(userText, personaMode);
      reply = ds.reply;
      steps = ds.steps;
      actionType = steps[0]?.tool || "agent";
    }

    let audioUrls: string[] = [];
    if (voiceOutput && reply) {
      audioUrls = await synthesizeSpeechQueue(reply);
    }

    return NextResponse.json({
      success: true,
      userText,
      reply,
      action: actionType,
      steps,
      cliCommand: steps[0]?.target,
      cliOutput: steps[0]?.output,
      audioUrl: audioUrls[0] || null,
      audioUrls,
      memoryStore: loadMemoryStore(),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, reply: `Error al procesar comando: ${String(err)}` },
      { status: 500 }
    );
  }
}

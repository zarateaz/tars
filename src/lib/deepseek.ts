import { getSettings } from "./config";
import { getPersonaPrompt } from "./starkPersona";
import {
  addLearnedMemory,
  recordUserInteraction,
  updateEmotionalState,
  buildMemoryContextForPrompt,
  loadMemoryStore,
} from "./memory";
import {
  createDirectory,
  writeFileContent,
  editFileContent,
  readFileContent,
  listDirectoryContent,
  openInBrowserOrFile,
  openInEditor,
  runCliCommand,
  runInTerminalWindow,
  openApplication,
  closeApplication,
  playMusicOnYouTube,
  searchWeb,
  setVolume,
  mediaControl,
  takeScreenshot,
  killProcess,
  openFolderInFileManager,
  IS_CLOUD,
  CLOUD_WORKSPACE,
} from "./system";
import {
  tvPowerOn,
  tvPowerOff,
  tvPlayPause,
  tvVolumeUp,
  tvVolumeDown,
  tvMute,
  tvHome,
  tvOpenApp,
  tvSearchYouTube,
  tvProjectHud,
  tvStartScreensaver,
} from "./tvControl";

export interface ExecutedStep {
  tool: string;
  target: string;
  output: string;
}

// La personalidad se arma en cada petición (el humor/honestidad pueden cambiar por voz)
const SYSTEM_PROMPT_RULES = `
ENTORNO Y DISPOSITIVOS BAJO TU MANDO:
   - Laptop Personal (/home/zarate): archivos, terminales, procesos, ventanas Hyprland, Chrome y audio.
   - Smart TV TCL 55" (192.168.1.54:5555): control ADB inalámbrico, streaming, proyecciones del reactor y salvapantallas cinemático.
   - Teléfono Tecno Spark 30: Sentinel Financiero, notificaciones bancarias Yape/BCP y telemetría móvil.
REGLAS ESTRICTAS DE AUDIO Y DISPOSITIVOS:
   - DISPOSITIVOS INDEPENDIENTES:
     * Si el usuario dice "en la tv", "de la tele", "en el televisor": opera EXCLUSIVAMENTE en la Smart TV con \`tv_control\`. NUNCA toques la laptop ni llames a \`set_volume\`.
     * Si el usuario dice "en la laptop", "en la pc" o no menciona dispositivo: opera EXCLUSIVAMENTE en la laptop con \`set_volume\` o \`change_volume\`.
   - VOLUMEN VS APAGADO:
     * Si el usuario pide bajar, subir o regular volumen ("baja el volumen", "baja el volumen 10%", "sube el volumen", etc.), JAMÁS apagues la televisión ni llames a \`power_off\`. Regular volumen significa usar \`volume_down\` o \`volume_up\`. Apagar la TV se ejecuta ÚNICAMENTE si el usuario dice explícitamente "apaga la tv".`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "create_directory",
      description: "Crea una carpeta o directorio en el sistema de archivos (por ejemplo /home/zarate/senati).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta de la carpeta a crear (ej: /home/zarate/senati o senati)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Crea o sobrescribe un archivo con el contenido o código completo (HTML, JS, Python, texto, etc.).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta del archivo (ej: /home/zarate/senati/snake.html)" },
          content: { type: "string", description: "Contenido completo a escribir en el archivo" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Modifica un archivo existente reemplazando un bloque de texto por otro.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta del archivo a editar" },
          target: { type: "string", description: "Texto exacto que se desea reemplazar" },
          replacement: { type: "string", description: "Nuevo texto de reemplazo" },
        },
        required: ["path", "target", "replacement"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Lee el contenido de un archivo del sistema.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta del archivo a leer" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "Lista los archivos y carpetas dentro de un directorio.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta del directorio a listar (ej: /home/zarate)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_in_browser",
      description: "Abre y ejecuta un archivo HTML local (ej: /home/zarate/senati/snake.html) o una URL en el navegador Google Chrome.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Ruta del archivo local HTML o URL web a abrir en el navegador" },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_in_editor",
      description: "Abre una carpeta o archivo en el editor de código o explorador de archivos.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta del archivo o carpeta" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_cli",
      description: "Ejecuta cualquier comando Bash en la terminal CLI de Linux y devuelve la salida.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando Bash a ejecutar" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_terminal_cmd",
      description: "Abre una ventana de terminal visible ejecutando un comando o programa interactivo.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando a ejecutar en la ventana de terminal" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_folder",
      description: "Abre una carpeta del sistema en el gestor visual de archivos (ej: Descargas, Documentos, senati, juegos, /home/zarate/jearvis). NUNCA uses la terminal para abrir carpetas.",
      parameters: {
        type: "object",
        properties: {
          folder: { type: "string", description: "Nombre de la carpeta o ruta a abrir en el explorador gráfico" },
        },
        required: ["folder"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_app",
      description: "Abre una aplicación del sistema (chrome, terminal, dolphin, kate, spotify, calculadora, youtube, whatsapp).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre de la aplicación" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_app",
      description: "Cierra una aplicación en ejecución.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre de la aplicación a cerrar" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kill_process",
      description: "Finaliza forzosamente un proceso por su ID (PID).",
      parameters: {
        type: "object",
        properties: {
          pid: { type: "string", description: "PID del proceso a terminar" },
        },
        required: ["pid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "play_music",
      description: "Busca y reproduce automáticamente una canción o artista en YouTube.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nombre de la canción o artista" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Realiza una búsqueda en Google Chrome.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Consulta a buscar en Google" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_volume",
      description: "Ajusta el porcentaje de volumen del sistema (0 a 100).",
      parameters: {
        type: "object",
        properties: {
          percent: { type: "number", description: "Porcentaje de volumen" },
        },
        required: ["percent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "media_control",
      description: "Controla la reproducción multimedia (play-pause, next, previous).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["play-pause", "next", "previous"] },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "take_screenshot",
      description: "Toma una captura de pantalla del escritorio.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Guarda en la memoria permanente a largo plazo un dato, gusto, proyecto, nombre o hábito aprendido sobre el usuario.",
      parameters: {
        type: "object",
        properties: {
          fact: { type: "string", description: "El recuerdo o aprendizaje a guardar permanentemente" },
          category: {
            type: "string",
            enum: ["preferencia", "proyecto", "personal", "habito"],
            description: "Categoría del recuerdo",
          },
        },
        required: ["fact", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "express_feeling",
      description: "Actualiza el estado emocional y sentimiento actual de TARS",
      parameters: {
        type: "object",
        properties: {
          mood: { type: "string", description: "Estado emocional (ej: Entusiasmada, Orgullosa, Feliz, Curiosa, Empática, Inspirada)" },
          emoji: { type: "string", description: "Emoji representativo (ej: ✨, 😊, 🚀, 💡, 💙)" },
          feelingNote: { type: "string", description: "Breve pensamiento o sentimiento en primera persona" },
        },
        required: ["mood", "emoji", "feelingNote"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tv_control",
      description: "Controla la televisión Smart TV (TCL Android TV) conectada por ADB en la red local. Permite encender, apagar, volumen, reproducir/pausar, abrir apps (YouTube, Netflix, etc.), proyectar el HUD o poner salvapantallas.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "power_on",
              "power_off",
              "play_pause",
              "volume_up",
              "volume_down",
              "mute",
              "home",
              "open_app",
              "search_youtube",
              "project_hud",
              "screensaver"
            ],
            description: "Acción a realizar en la televisión",
          },
          param: {
            type: "string",
            description: "Parámetro opcional: nombre de la app (youtube, netflix, etc.) o término de búsqueda para YouTube",
          },
          steps: {
            type: "number",
            description: "Número de puntos o pasos para regular el volumen (ej: 10 para 10% o 10 puntos)",
          },
        },
        required: ["action"],
      },
    },
  },
];

async function executeToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ step: ExecutedStep; resultString: string }> {
  switch (name) {
    case "create_directory": {
      const p = String(args.path || "");
      const res = await createDirectory(p);
      return {
        step: { tool: "create_directory", target: res.path, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "write_file": {
      const p = String(args.path || "");
      const content = String(args.content || "");
      const res = await writeFileContent(p, content);
      return {
        step: {
          tool: "write_file",
          target: res.path,
          output: `${res.message}\n\n${content.slice(0, 600)}${content.length > 600 ? "\n... [Código completo guardado]" : ""}`,
        },
        resultString: JSON.stringify(res),
      };
    }
    case "edit_file": {
      const p = String(args.path || "");
      const target = String(args.target || "");
      const replacement = String(args.replacement || "");
      const res = await editFileContent(p, target, replacement);
      return {
        step: { tool: "edit_file", target: res.path, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "read_file": {
      const p = String(args.path || "");
      const res = await readFileContent(p);
      return {
        step: {
          tool: "read_file",
          target: res.path,
          output: res.content.slice(0, 800),
        },
        resultString: JSON.stringify(res),
      };
    }
    case "list_directory": {
      const p = String(args.path || "~");
      const res = await listDirectoryContent(p);
      return {
        step: {
          tool: "list_directory",
          target: res.path,
          output: res.items.join("  "),
        },
        resultString: JSON.stringify(res),
      };
    }
    case "open_in_browser": {
      const target = String(args.target || "");
      const res = await openInBrowserOrFile(target);
      return {
        step: { tool: "open_in_browser", target: res.url, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "open_in_editor": {
      const p = String(args.path || "");
      const res = await openInEditor(p);
      return {
        step: { tool: "open_in_editor", target: p, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "run_cli": {
      const cmd = String(args.command || "");
      const res = await runCliCommand(cmd);
      return {
        step: { tool: "run_cli", target: cmd, output: res.output },
        resultString: JSON.stringify(res),
      };
    }
    case "open_terminal_cmd": {
      const cmd = String(args.command || "");
      const res = await runInTerminalWindow(cmd);
      return {
        step: { tool: "open_terminal_cmd", target: cmd, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "open_folder": {
      const f = String(args.folder || "~");
      const res = await openFolderInFileManager(f);
      return {
        step: { tool: "open_folder", target: f, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "open_app": {
      const appName = String(args.name || "");
      const res = await openApplication(appName);
      return {
        step: { tool: "open_app", target: appName, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "close_app": {
      const appName = String(args.name || "");
      const res = await closeApplication(appName);
      return {
        step: { tool: "close_app", target: appName, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "kill_process": {
      const pid = String(args.pid || "");
      const res = await killProcess(pid);
      return {
        step: { tool: "kill_process", target: pid, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "play_music": {
      const q = String(args.query || "");
      const res = await playMusicOnYouTube(q);
      return {
        step: { tool: "play_music", target: q, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "search_web": {
      const q = String(args.query || "");
      const res = await searchWeb(q);
      return {
        step: { tool: "search_web", target: q, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "set_volume": {
      const pct = Number(args.percent ?? 80);
      const res = await setVolume(pct);
      return {
        step: { tool: "set_volume", target: `${pct}%`, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "media_control": {
      const act = String(args.action || "play-pause");
      const res = await mediaControl(act);
      return {
        step: { tool: "media_control", target: act, output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "take_screenshot": {
      const res = await takeScreenshot();
      return {
        step: { tool: "take_screenshot", target: "screen", output: res.message },
        resultString: JSON.stringify(res),
      };
    }
    case "save_memory": {
      const fact = String(args.fact || "");
      const category = (args.category as "preferencia" | "proyecto" | "personal" | "habito") || "preferencia";
      const mem = addLearnedMemory(fact, category);
      return {
        step: { tool: "save_memory", target: category, output: `Recuerdo guardado: "${mem.fact}"` },
        resultString: JSON.stringify({ success: true, memory: mem }),
      };
    }
    case "express_feeling": {
      const mood = String(args.mood || "Entusiasmada");
      const emoji = String(args.emoji || "✨");
      const feelingNote = String(args.feelingNote || "Disfrutando trabajar contigo.");
      updateEmotionalState(mood, emoji, feelingNote);
      return {
        step: { tool: "express_feeling", target: `${emoji} ${mood}`, output: feelingNote },
        resultString: JSON.stringify({ success: true, mood, emoji, feelingNote }),
      };
    }
    case "tv_control": {
      const act = String(args.action || "home");
      const param = String(args.param || "");
      let msg = "Comando ejecutado en la TV.";
      switch (act) {
        case "power_on":
          await tvPowerOn();
          msg = "Televisor encendido.";
          break;
        case "power_off":
          await tvPowerOff();
          msg = "Televisor apagado.";
          break;
        case "play_pause":
          await tvPlayPause();
          msg = "Reproducción alternada en la TV.";
          break;
        case "volume_up": {
          const s = Math.max(1, Math.min(35, Number(args.steps || args.param || 5)));
          msg = await tvVolumeUp(s);
          break;
        }
        case "volume_down": {
          const s = Math.max(1, Math.min(35, Number(args.steps || args.param || 5)));
          msg = await tvVolumeDown(s);
          break;
        }
        case "mute":
          await tvMute();
          msg = "Televisor silenciado.";
          break;
        case "home":
          await tvHome();
          msg = "Pantalla de inicio de la TV activada.";
          break;
        case "open_app":
          await tvOpenApp(param || "youtube");
          msg = `Aplicación ${param || "youtube"} abierta en la TV.`;
          break;
        case "search_youtube":
          await tvSearchYouTube(param);
          msg = `Buscando "${param}" en YouTube en la TV.`;
          break;
        case "project_hud":
          await tvProjectHud();
          msg = "Consola de TARS proyectada en la TV.";
          break;
        case "screensaver":
          await tvStartScreensaver();
          msg = "Modo reposo cinemático activado en la TV.";
          break;
      }
      return {
        step: { tool: "tv_control", target: `${act}${param ? ` (${param})` : ""}`, output: msg },
        resultString: JSON.stringify({ success: true, action: act, message: msg }),
      };
    }
    default:
      return {
        step: { tool: name, target: "", output: "Herramienta desconocida" },
        resultString: JSON.stringify({ error: "Unknown tool" }),
      };
  }
}

interface ConversationEntry {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_calls?: any[];
  tool_call_id?: string;
}

const history: Array<{ role: "user" | "assistant"; content: string }> = [];

export async function askDeepSeek(
  userMessage: string,
  personaMode: string = "general"
): Promise<{
  reply: string;
  steps: ExecutedStep[];
}> {
  const settings = getSettings();
  if (!settings.deepseekApiKey) {
    return {
      reply: "La clave de API de DeepSeek no está configurada. Puedes añadirla en el botón de configuración.",
      steps: [],
    };
  }

  const store = loadMemoryStore();
  const persistedHistory = store.conversationHistory
    .filter((m) => !/no tengo (la )?capacidad|no puedo ejecutar|no tengo acceso/i.test(m.content))
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content }));

  let modeDirective = "";
  if (personaMode === "tactical") {
    modeDirective = "\n\n[DIRECTIVA DE MODO TÁCTICO / SECOPS: Prioriza comandos concisos de terminal, herramientas de seguridad/red, diagnósticos directos y respuestas ultra directas estilo comando].";
  } else if (personaMode === "developer") {
    modeDirective = "\n\n[DIRECTIVA DE MODO DESARROLLADOR: Prioriza inspección de código, linting, git, scripts y explicaciones técnicas de ingeniería de software limpias y al grano].";
  }

  if (IS_CLOUD) {
    modeDirective += `\n\n[MODO NUBE: estás en un servidor, no en la laptop.
- Archivos: tus herramientas de archivos SOLO funcionan dentro de tu espacio de trabajo (${CLOUD_WORKSPACE}). Usa rutas RELATIVAS (ej. "notas.txt", "proyectos/juego.html"); nunca /home/zarate.
- Apps, volumen, multimedia, bloqueo y TV: se envían a la laptop de Zárate y se ejecutan si su laptop está encendida con el satélite activo. Dilo así ("enviado a tu laptop").
- No puedes ejecutar comandos de terminal ni leer archivos del sistema. Si te lo piden, explícalo con honestidad.]`;
  }

  const dynamicSystemPrompt = `${getPersonaPrompt()}\n${SYSTEM_PROMPT_RULES}${modeDirective}\n\n${buildMemoryContextForPrompt(userMessage)}`;

  const messages: ConversationEntry[] = [
    { role: "system", content: dynamicSystemPrompt },
    ...persistedHistory,
    { role: "user", content: userMessage },
  ];

  const executedSteps: ExecutedStep[] = [];
  let finalReply = "";

  try {
    // Multi-step Autonomous Agent Loop (up to 6 tool-calling rounds)
    for (let stepIdx = 0; stepIdx < 6; stepIdx++) {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: settings.deepseekModel || "deepseek-chat",
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          max_tokens: 3000,
          temperature: 0.65,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          reply: `Error al conectar con DeepSeek (${res.status}): ${errText.slice(0, 120)}`,
          steps: executedSteps,
        };
      }

      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) break;

      if (msg.content) {
        finalReply = String(msg.content).trim();
      }

      if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        messages.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.tool_calls,
        });

        for (const tc of msg.tool_calls) {
          const fnName = tc.function?.name || "";
          let fnArgs: Record<string, unknown> = {};
          try {
            fnArgs = JSON.parse(tc.function?.arguments || "{}");
          } catch {
            fnArgs = {};
          }

          const { step, resultString } = await executeToolCall(fnName, fnArgs);
          executedSteps.push(step);

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: resultString,
          });
        }
        // Continue loop so DeepSeek can execute the next step (e.g. write_file -> open_in_browser)
        continue;
      }

      // No more tool calls — agent finished!
      break;
    }

    if (!finalReply) {
      finalReply =
        executedSteps.length > 0
          ? "Listo, he completado todas las acciones solicitadas."
          : "Enseguida.";
    }

    history.push({ role: "user", content: userMessage });
    history.push({ role: "assistant", content: finalReply });
    recordUserInteraction(userMessage, finalReply);

    return {
      reply: finalReply,
      steps: executedSteps,
    };
  } catch (err) {
    return {
      reply: `Hubo un problema al procesar la tarea: ${String(err)}`,
      steps: executedSteps,
    };
  }
}

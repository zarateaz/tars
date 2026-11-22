"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import NeuralOrb, { OrbState } from "@/components/NeuralOrb";
import AudioVisualizer from "@/components/AudioVisualizer";
import CyberParticles from "@/components/CyberParticles";
import CommandPalette from "@/components/CommandPalette";
import TaskManagerModal from "@/components/TaskManagerModal";
import TerminalDrawer, { TerminalEntry } from "@/components/TerminalDrawer";
import { playUiSound, isSoundFxMuted, setSoundFxMuted } from "@/lib/soundFx";
import { GameInfo } from "@/lib/gameGenerator";
import {
  Mic,
  MicOff,
  Send,
  Settings,
  Globe,
  Terminal,
  FolderOpen,
  Code2,
  Music,
  Camera,
  Volume2,
  VolumeX,
  Play,
  Square,
  SkipBack,
  SkipForward,
  Cpu,
  HardDrive,
  Activity,
  Sparkles,
  Search,
  X,
  CheckCircle2,
  Brain,
  Heart,
  Trash2,
  Plus,
  Radio,
  Tv,
  Shield,
  Laptop,
  Copy,
  Check,
  Wifi,
  CloudSun,
  LayoutGrid,
  MessageSquare,
  Compass,
  Keyboard,
  Gamepad2,
} from "lucide-react";

interface LearnedMemory {
  id: string;
  fact: string;
  category: string;
  createdAt: string;
}

interface FrequentPattern {
  pattern: string;
  count: number;
  lastUsed: string;
}

interface EmotionalState {
  mood: string;
  emoji: string;
  affinity: number;
  feelingNote: string;
}

interface ExecutedStep {
  tool: string;
  target: string;
  output: string;
}

interface ChatMessage {
  id: string;
  sender: "user" | "jarvis";
  text: string;
  time: string;
  steps?: ExecutedStep[];
  audioUrls?: string[];
}

interface SystemStats {
  cpuPercent: number;
  ramPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskPercent: number;
  diskUsedGb: number;
  diskTotalGb: number;
  uptime: string;
  topProcesses: Array<{ pid: string; name: string; cpu: string; mem: string }>;
  network?: {
    localIp?: string;
    pingMs?: string | null;
    weather?: string;
  };
}

function parseNumberFromSigned(str: string, fallback: number): number {
  const m = String(str || "").match(/([+-]?\d+)/);
  return m ? parseInt(m[1], 10) : fallback;
}

export default function JarvisDashboard() {
  const [orbState, setOrbState] = useState<OrbState>("IDLE");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "jarvis",
      text: "¡Hola! Qué gusto tenerte aquí... ¿Qué vamos a crear o explorar hoy?",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [musicQuery, setMusicQuery] = useState("");
  const [liveTranscript, setLiveTranscript] = useState(
    "Haz clic en la esfera o en el micrófono para conversar en vivo"
  );
  const [stats, setStats] = useState<SystemStats>({
    cpuPercent: 12,
    ramPercent: 45,
    ramUsedGb: 3.5,
    ramTotalGb: 8.0,
    diskPercent: 16,
    diskUsedGb: 78,
    diskTotalGb: 476,
    uptime: "Activo",
    topProcesses: [],
  });
  const [volume, setVolume] = useState(85);
  const [clock, setClock] = useState("");

  // Settings & Voice Realism Controls
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [newMemoryText, setNewMemoryText] = useState("");
  const [memories, setMemories] = useState<LearnedMemory[]>([]);
  const [frequentPatterns, setFrequentPatterns] = useState<FrequentPattern[]>([]);
  const [emotion, setEmotion] = useState<EmotionalState>({
    mood: "Entusiasmada y Curiosa",
    emoji: "✨",
    affinity: 25,
    feelingNote: "Me siento feliz de aprender contigo y ayudarte a construir tus ideas.",
  });
  const [deepseekConfigured, setDeepseekConfigured] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [maskedKey, setMaskedKey] = useState("");
  const [model, setModel] = useState("deepseek-chat");
  const [voice, setVoice] = useState("es-CO-SalomeNeural");
  const [rateNum, setRateNum] = useState<number>(2);
  const [pitchNum, setPitchNum] = useState<number>(0);
  const [emotionalProsody, setEmotionalProsody] = useState<boolean>(true);
  const [continuousMode, setContinuousMode] = useState<boolean>(true);
  const [continuousSessionActive, setContinuousSessionActive] = useState<boolean>(false);
  const [elevenlabsKeyInput, setElevenlabsKeyInput] = useState("");
  const [elevenlabsMasked, setElevenlabsMasked] = useState("");
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState("21m00Tcm4TlvDq8ikWAM");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Pro UX, Persona Modes & HUD State
  const [hudView, setHudView] = useState<"cinema" | "cockpit">("cinema");
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [showTelemetryDrawer, setShowTelemetryDrawer] = useState(false);
  const [personaMode, setPersonaMode] = useState<"general" | "tactical" | "developer">("general");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [taskManagerOpen, setTaskManagerOpen] = useState(false);
  const [terminalDrawerOpen, setTerminalDrawerOpen] = useState(false);
  const [showTvModal, setShowTvModal] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Cyberpunk Game Creation, Progress & Run Modal States
  const [gameCreation, setGameCreation] = useState<{
    isCreating: boolean;
    progress: number;
    statusText: string;
    gameInfo: GameInfo | null;
  }>({
    isCreating: false,
    progress: 0,
    statusText: "",
    gameInfo: null,
  });
  const [activeGameModalUrl, setActiveGameModalUrl] = useState<string | null>(null);
  const [showInputBar, setShowInputBar] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const orbStateRef = useRef<OrbState>(orbState);
  const isMicActiveRef = useRef<boolean>(false);
  const currentSpeechTextRef = useRef<string>("");
  const recordMicAbortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isAckPlayingRef = useRef<boolean>(false);
  const isProcessingCommandRef = useRef<boolean>(false);
  const continuousSessionRef = useRef<boolean>(false);
  const continuousModeRef = useRef<boolean>(true);
  const personaModeRef = useRef<"general" | "tactical" | "developer">("general");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const interimDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const startListeningRef = useRef<() => void>(() => {});

  useEffect(() => {
    orbStateRef.current = orbState;
  }, [orbState]);

  useEffect(() => {
    continuousSessionRef.current = continuousSessionActive;
  }, [continuousSessionActive]);

  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  useEffect(() => {
    personaModeRef.current = personaMode;
  }, [personaMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("jarvis_mode") as "general" | "tactical" | "developer" | null;
      if (saved) {
        setPersonaMode(saved);
        personaModeRef.current = saved;
      }
      setSoundMuted(isSoundFxMuted());
    }
  }, []);

  const handleSetPersonaMode = (mode: "general" | "tactical" | "developer") => {
    setPersonaMode(mode);
    personaModeRef.current = mode;
    if (typeof window !== "undefined") {
      localStorage.setItem("jarvis_mode", mode);
    }
  };

  const handleToggleSoundFx = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    setSoundFxMuted(next);
    if (!next) {
      playUiSound("click");
    }
  };

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Digital Clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString("es-PE", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll System Telemetry
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/system");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch {
        // ignore
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  // Load Settings
  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setDeepseekConfigured(data.deepseekConfigured);
        setMaskedKey(data.deepseekKeyMasked || "");
        setModel(data.deepseekModel || "deepseek-chat");
        setVoice(
          data.voice && !String(data.voice).startsWith("en-")
            ? data.voice
            : "es-CO-SalomeNeural"
        );
        setRateNum(parseNumberFromSigned(data.voiceRate || "+2%", 2));
        setPitchNum(parseNumberFromSigned(data.voicePitch || "+0Hz", 0));
        setEmotionalProsody(data.emotionalProsody !== false);
        setContinuousMode(data.continuousMode !== false);
        setElevenlabsMasked(data.elevenlabsKeyMasked || "");
        if (data.elevenlabsVoiceId) setElevenlabsVoiceId(data.elevenlabsVoiceId);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const loadMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/memory");
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
        setFrequentPatterns(data.frequentPatterns || []);
        if (data.emotionalState) setEmotion(data.emotionalState);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // Stop any current speech immediately (Barge-In support)
  const stopSpeaking = useCallback(() => {
    audioQueueRef.current = [];
    isAckPlayingRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  // Handle transitions between sentences in the audio queue and continuous hands-free mode
  const handleAudioEnded = useCallback(() => {
    if (audioQueueRef.current.length > 0 && audioRef.current) {
      const nextUrl = audioQueueRef.current.shift()!;
      // Natural 110ms human breath between sentences
      setTimeout(() => {
        if (!audioRef.current) return;
        audioRef.current.src = `${nextUrl}?t=${Date.now()}`;
        setOrbState("SPEAKING");
        audioRef.current.play().catch(() => {
          fetch(nextUrl, { method: "POST" })
            .catch(() => {})
            .finally(() => {
              handleAudioEnded();
            });
        });
      }, 110);
      return;
    }

    // If an Ack filler just finished while the main command is still processing, return to PROCESSING state
    if (isAckPlayingRef.current && isProcessingCommandRef.current) {
      isAckPlayingRef.current = false;
      setOrbState("PROCESSING");
      return;
    }

    isAckPlayingRef.current = false;
    setOrbState("IDLE");

    // If continuous hands-free conversation is active, automatically re-open the mic!
    if (continuousModeRef.current && continuousSessionRef.current && !isProcessingCommandRef.current) {
      setTimeout(() => {
        if (continuousSessionRef.current && !isProcessingCommandRef.current) {
          startListeningRef.current();
        }
      }, 360);
    }
  }, []);

  // Play an array of sentence audio chunks sequentially with natural human breath pauses
  const playAudioQueue = useCallback(
    (urls: string[], isAck = false) => {
      const valid = urls.filter(Boolean);
      if (valid.length === 0 || !audioRef.current) {
        if (!isProcessingCommandRef.current) {
          handleAudioEnded();
        }
        return;
      }

      isAckPlayingRef.current = isAck;
      audioQueueRef.current = valid.slice(1);
      audioRef.current.src = `${valid[0]}?t=${Date.now()}`;
      setOrbState("SPEAKING");
      audioRef.current.play().catch(() => {
        // Fallback nativo por altavoces del sistema si el navegador bloquea autoplay sin clic previo
        fetch(valid[0], { method: "POST" })
          .catch(() => {})
          .finally(() => {
            if (!isProcessingCommandRef.current) {
              handleAudioEnded();
            }
          });
      });
    },
    [handleAudioEnded]
  );

  const isCommandExecutingRef = useRef<boolean>(false);
  const lastCommandTimeRef = useRef<{ text: string; time: number }>({ text: "", time: 0 });

  // Execute voice or text command
  const sendCommand = useCallback(
    async (rawText: string) => {
      const clean = rawText.trim();
      if (!clean) return;

      const now = Date.now();
      // Prevención de envíos duplicados por eventos continuos de voz
      if (
        isCommandExecutingRef.current ||
        (lastCommandTimeRef.current.text === clean && now - lastCommandTimeRef.current.time < 1800)
      ) {
        return;
      }
      isCommandExecutingRef.current = true;
      lastCommandTimeRef.current = { text: clean, time: now };

      stopSpeaking();
      isProcessingCommandRef.current = true;

      const isGameCreationIntent =
        /\b(crea|crear|haz|hacer|arma|armar|desarrolla|dise[ñn]a|construye|programa)\b.*\b(juego|game|tetris|teriz|serpiente|serpinet|serpinete|serpientes|snake|snak|culebra|culebrita|vibora|v[ií]bora|pong)\b/i.test(clean) ||
        /\b(crea|haz|arma|programa)\b.*\b(tetris|teriz|serpiente|serpinet|serpinete|serpientes|snake|snak|culebra|culebrita|vibora|v[ií]bora|pong)\b/i.test(clean);

      let progressInterval: NodeJS.Timeout | null = null;
      if (isGameCreationIntent) {
        setGameCreation({
          isCreating: true,
          progress: 18,
          statusText: "⚡ Inicializando arquitectura y loop de juego...",
          gameInfo: null,
        });

        let currentP = 18;
        progressInterval = setInterval(() => {
          currentP += Math.floor(Math.random() * 15) + 10;
          if (currentP >= 92) {
            currentP = 92;
            if (progressInterval) clearInterval(progressInterval);
          }
          setGameCreation((prev) => ({
            ...prev,
            progress: currentP,
            statusText:
              currentP < 45
                ? "🎮 Generando motor de renderizado Canvas y controles..."
                : currentP < 75
                ? "✨ Inyectando paleta Cyberpunk, efectos de sonido y puntuación..."
                : "💾 Compilando código fuente ejecutable...",
          }));
        }, 300);
      }

      const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-u`, sender: "user", text: clean, time: nowStr },
      ]);
      setOrbState("PROCESSING");
      setLiveTranscript(`Procesando: "${clean}"...`);

      // Disparar micro-respuesta ("Ack") en paralelo para tareas pesadas del agente DeepSeek
      fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ack", text: clean }),
      })
        .then((r) => r.json())
        .then((ackData) => {
          if (
            ackData.audioUrl &&
            isProcessingCommandRef.current &&
            orbStateRef.current === "PROCESSING"
          ) {
            playAudioQueue([ackData.audioUrl], true);
          }
        })
        .catch(() => {});

      try {
        const res = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: clean,
            voiceOutput: true,
            personaMode: personaModeRef.current,
          }),
        });
        isProcessingCommandRef.current = false;
        isCommandExecutingRef.current = false;

        const data = await res.json();
        if (progressInterval) clearInterval(progressInterval);

        if (data.gameCreated) {
          setGameCreation({
            isCreating: true,
            progress: 100,
            statusText: "✅ ¡Juego compilado con éxito al 100%!",
            gameInfo: data.gameCreated,
          });
        } else if (isGameCreationIntent) {
          setGameCreation((prev) => ({
            ...prev,
            progress: 100,
            statusText: "✅ ¡Juego compilado con éxito al 100%!",
          }));
        }

        if (data.gameRun) {
          setActiveGameModalUrl(data.gameRun.webPath);
        }

        const reply = data.reply || "Listo.";
        const urls: string[] =
          Array.isArray(data.audioUrls) && data.audioUrls.length > 0
            ? data.audioUrls
            : data.audioUrl
            ? [data.audioUrl]
            : [];

        // Record CLI command executions into live terminal history
        if (data.steps && Array.isArray(data.steps) && data.steps.length > 0) {
          const cliSteps = data.steps.filter(
            (s: ExecutedStep) => s.tool === "run_cli" || s.tool === "open_terminal_cmd"
          );
          if (cliSteps.length > 0) {
            setTerminalEntries((prev) => [
              ...prev,
              ...cliSteps.map((st: ExecutedStep, idx: number) => ({
                id: `${Date.now()}-${idx}`,
                command: st.target,
                output: st.output,
                timestamp: nowStr,
                success: true,
              })),
            ]);
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-j`,
            sender: "jarvis",
            text: reply,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            steps: data.steps || [],
            audioUrls: urls,
          },
        ]);
        setLiveTranscript(reply);
        playUiSound("success");
        if (data.memoryStore) {
          setMemories(data.memoryStore.memories || []);
          setFrequentPatterns(data.memoryStore.frequentPatterns || []);
          if (data.memoryStore.emotionalState) setEmotion(data.memoryStore.emotionalState);
        }

        if (urls.length > 0) {
          stopSpeaking();
          playAudioQueue(urls, false);
        } else {
          setOrbState("IDLE");
        }
      } catch {
        if (progressInterval) clearInterval(progressInterval);
        isProcessingCommandRef.current = false;
        isCommandExecutingRef.current = false;
        playUiSound("alert");
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-err`,
            sender: "jarvis",
            text: "Ocurrió un error al procesar la solicitud.",
            time: nowStr,
          },
        ]);
        setOrbState("IDLE");
      } finally {
        isProcessingCommandRef.current = false;
        isCommandExecutingRef.current = false;
      }
    },
    [playAudioQueue, stopSpeaking, playUiSound]
  );

  // Stop and submit speech immediately (or deactivate cleanly if empty)
  const stopAndSubmitSpeech = useCallback(
    (textOverride?: string) => {
      if (interimDebounceRef.current) {
        clearTimeout(interimDebounceRef.current);
        interimDebounceRef.current = null;
      }

      const textToProcess = (
        textOverride !== undefined ? textOverride : currentSpeechTextRef.current
      ).trim();
      currentSpeechTextRef.current = "";

      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }

      if (textToProcess) {
        isMicActiveRef.current = false;
        if (recordMicAbortControllerRef.current) {
          try {
            recordMicAbortControllerRef.current.abort();
          } catch {
            // ignore
          }
          recordMicAbortControllerRef.current = null;
        }
        setOrbState("PROCESSING");
        sendCommand(textToProcess);
        return;
      }

      // Si está grabando con el motor nativo (/api/record-mic), hacer flush inmediato para transcribir lo hablado
      if (recordMicAbortControllerRef.current) {
        setContinuousSessionActive(false);
        continuousSessionRef.current = false;
        setLiveTranscript("Procesando lo que dijiste...");
        fetch("/api/record-mic", { method: "PUT" }).catch(() => {});
        return;
      }

      isMicActiveRef.current = false;
      setOrbState("IDLE");
      setLiveTranscript("Micrófono desactivado — Presiona [ESPACIO] para hablar");
      playUiSound("listen_stop");
    },
    [sendCommand, playUiSound]
  );

  // Stop and completely cancel the microphone immediately
  const deactivateMicrophone = useCallback(() => {
    isMicActiveRef.current = false;
    setContinuousSessionActive(false);
    continuousSessionRef.current = false;
    currentSpeechTextRef.current = "";

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (recordMicAbortControllerRef.current) {
      fetch("/api/record-mic", { method: "PUT" }).catch(() => {});
      try {
        recordMicAbortControllerRef.current.abort();
      } catch {
        // ignore
      }
      recordMicAbortControllerRef.current = null;
    }

    if (interimDebounceRef.current) {
      clearTimeout(interimDebounceRef.current);
      interimDebounceRef.current = null;
    }

    setOrbState("IDLE");
    setLiveTranscript("Micrófono desactivado — Presiona [ESPACIO] para activar");
    playUiSound("listen_stop");
  }, [playUiSound]);

  // Direct Smart VAD system microphone fallback using local Linux audio stream
  // duck=true: activación manual -> pausa la música de la TV mientras hablas y la reanuda al terminar
  const runSmartVadFallback = useCallback(async (duck: boolean = false) => {
    if (
      isCommandExecutingRef.current ||
      orbStateRef.current === "PROCESSING" ||
      recordMicAbortControllerRef.current !== null
    ) {
      return;
    }
    isMicActiveRef.current = true;
    currentSpeechTextRef.current = "";
    orbStateRef.current = "LISTENING";
    setOrbState("LISTENING");
    setLiveTranscript("Escuchando... Habla ahora — [ESPACIO] para enviar o silenciar");
    const abortCtrl = new AbortController();
    recordMicAbortControllerRef.current = abortCtrl;

    try {
      const r = await fetch(duck ? "/api/record-mic?duck=1" : "/api/record-mic", {
        method: "POST",
        signal: abortCtrl.signal,
      });
      const d = await r.json();
      recordMicAbortControllerRef.current = null;

      if (!isMicActiveRef.current) return;

      if (d.success && d.text && d.text.trim()) {
        isMicActiveRef.current = false;
        if (continuousModeRef.current) {
          setContinuousSessionActive(true);
          continuousSessionRef.current = true;
        }
        sendCommand(d.text.trim());
      } else {
        // En modo continuo, si terminó una ventana sin voz, seguir escuchando fluidamente
        if (continuousSessionRef.current && isMicActiveRef.current && !isCommandExecutingRef.current) {
          setTimeout(() => {
            if (continuousSessionRef.current && isMicActiveRef.current && !isCommandExecutingRef.current) {
              runSmartVadFallback();
            }
          }, 150);
        } else {
          isMicActiveRef.current = false;
          setOrbState("IDLE");
          setLiveTranscript("Micrófono en espera — Presiona [ESPACIO] para hablar");
        }
      }
    } catch (err: unknown) {
      recordMicAbortControllerRef.current = null;
      isMicActiveRef.current = false;
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setOrbState("IDLE");
      setLiveTranscript("Micrófono en espera — Presiona [ESPACIO] para hablar");
    }
  }, [sendCommand]);

  // Start listening from microphone (Local Smart VAD or Browser Web Speech API)
  const startVoiceListening = useCallback(async (duck: boolean = false) => {
    // Barge-In: if TARS is currently speaking, interrupt her immediately!
    if (orbStateRef.current === "SPEAKING") {
      stopSpeaking();
    }

    // Usar directamente el motor de captura de alta fidelidad nativo (0 latencia, 48kHz, español es-PE/es-419)
    // Se evita webkitSpeechRecognition en Chrome/Linux ya que Google depreció los endpoints GCM (DEPRECATED_ENDPOINT)
    await runSmartVadFallback(duck);
  }, [stopSpeaking, runSmartVadFallback]);

  useEffect(() => {
    startListeningRef.current = startVoiceListening;
  }, [startVoiceListening]);

  // Activate microphone cleanly
  const activateMicrophone = useCallback(async (userInitiated: boolean = false) => {
    if (orbStateRef.current === "SPEAKING") {
      stopSpeaking();
    }

    playUiSound("listen_start");
    if (continuousModeRef.current) {
      setContinuousSessionActive(true);
      continuousSessionRef.current = true;
    }
    isMicActiveRef.current = true;
    currentSpeechTextRef.current = "";
    orbStateRef.current = "LISTENING";
    setOrbState("LISTENING");
    setLiveTranscript("Escuchando... Habla ahora — [ESPACIO] para silenciar");
    await startVoiceListening(userInitiated);
  }, [stopSpeaking, startVoiceListening, playUiSound]);

  // Auto-activación manos libres al iniciar la aplicación
  useEffect(() => {
    const timer = setTimeout(() => {
      if (continuousModeRef.current && !isMicActiveRef.current && orbStateRef.current === "IDLE") {
        activateMicrophone();
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [activateMicrophone]);

  // Unified Toggle: Activar y Parar el micrófono / voz (Space o Clic)
  const toggleVoiceListening = useCallback(async () => {
    if (orbStateRef.current === "SPEAKING") {
      stopSpeaking();
      setOrbState("IDLE");
      setLiveTranscript("Voz silenciada — Presiona [ESPACIO] para activar micro");
      playUiSound("listen_stop");
    } else if (isMicActiveRef.current || orbStateRef.current === "LISTENING") {
      stopAndSubmitSpeech();
    } else {
      await activateMicrophone(true);
    }
  }, [stopAndSubmitSpeech, activateMicrophone, stopSpeaking, playUiSound]);

  // Direct CLI Terminal Command Execution Callback
  const handleExecuteTerminalCommand = async (
    cmd: string
  ): Promise<{ success: boolean; output: string }> => {
    const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `$ ${cmd}`,
          voiceOutput: false,
          personaMode: personaModeRef.current,
        }),
      });
      const data = await res.json();
      const out =
        data.steps?.[0]?.output || data.cliOutput || data.reply || "Comando ejecutado.";
      setTerminalEntries((prev) => [
        ...prev,
        {
          id: `${Date.now()}-cli`,
          command: cmd,
          output: out,
          timestamp: nowStr,
          success: data.success !== false,
        },
      ]);
      return { success: data.success !== false, output: out };
    } catch (err) {
      const errOut = `Error: ${String(err)}`;
      setTerminalEntries((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          command: cmd,
          output: errOut,
          timestamp: nowStr,
          success: false,
        },
      ]);
      return { success: false, output: errOut };
    }
  };

  const activateMicRef = useRef(activateMicrophone);
  activateMicRef.current = activateMicrophone;

  const stopAndSubmitRef = useRef(stopAndSubmitSpeech);
  stopAndSubmitRef.current = stopAndSubmitSpeech;

  const stopSpeakingRef = useRef(stopSpeaking);
  stopSpeakingRef.current = stopSpeaking;

  const deactivateMicRef = useRef(deactivateMicrophone);
  deactivateMicRef.current = deactivateMicrophone;

  // Global Keyboard Shortcuts (Spacebar to Activate/Stop Mic, Esc, Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isSpaceKey =
        e.code === "Space" ||
        e.key === " " ||
        e.key === "Spacebar" ||
        e.keyCode === 32 ||
        e.which === 32;

      // Escape: Close all modals/drawers or stop speech/listening
      if (e.key === "Escape") {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (taskManagerOpen) {
          setTaskManagerOpen(false);
          return;
        }
        if (terminalDrawerOpen) {
          setTerminalDrawerOpen(false);
          return;
        }
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (memoryOpen) {
          setMemoryOpen(false);
          return;
        }
        if (showChatDrawer) {
          setShowChatDrawer(false);
          return;
        }
        if (showTelemetryDrawer) {
          setShowTelemetryDrawer(false);
          return;
        }
        if (activeGameModalUrl) {
          setActiveGameModalUrl(null);
          return;
        }
        if (orbStateRef.current === "SPEAKING") {
          stopSpeakingRef.current();
          setOrbState("IDLE");
          setLiveTranscript("Voz silenciada — Presiona [ESPACIO] para activar micro");
          playUiSound("alert");
          return;
        }
        if (isMicActiveRef.current || orbStateRef.current === "LISTENING") {
          deactivateMicRef.current();
          return;
        }
      }

      // Command Palette: Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Spacebar Activation & Deactivation (Zero Latency & 0 Margin of Error)
      if (isSpaceKey) {
        // Prevent key repeat flood when user holds space down
        if (e.repeat) {
          e.preventDefault();
          return;
        }

        const activeEl = document.activeElement as HTMLElement | null;
        const isInputActive =
          activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            activeEl.isContentEditable);

        // Never intercept space if typing in text fields
        if (isInputActive) {
          return;
        }

        // If playing in game modal, let game receive space
        if (activeGameModalUrl) {
          return;
        }

        // Blur any focused button or link so space doesn't activate it
        if (activeEl && (activeEl.tagName === "BUTTON" || activeEl.tagName === "A")) {
          activeEl.blur();
        }

        e.preventDefault();
        setIsSpacePressed(true);

        // TOGGLE:
        // Si está hablando TARS -> CALLAR inmediatamente.
        // Si el micro está escuchando -> DETENER y procesar/enviar de inmediato (o cancelar si vacío).
        // Si no está escuchando ni procesando -> ACTIVAR inmediatamente.
        if (orbStateRef.current === "SPEAKING") {
          stopSpeakingRef.current();
          setOrbState("IDLE");
          setLiveTranscript("Voz silenciada — Presiona [ESPACIO] para hablar");
          playUiSound("listen_stop");
        } else if (isMicActiveRef.current || orbStateRef.current === "LISTENING") {
          stopAndSubmitRef.current();
        } else if (orbStateRef.current === "PROCESSING") {
          // Procesando cognición
        } else {
          activateMicRef.current();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const isSpaceKey =
        e.code === "Space" ||
        e.key === " " ||
        e.key === "Spacebar" ||
        e.keyCode === 32 ||
        e.which === 32;

      if (isSpaceKey) {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    commandPaletteOpen,
    taskManagerOpen,
    terminalDrawerOpen,
    settingsOpen,
    memoryOpen,
    showChatDrawer,
    showTelemetryDrawer,
    activeGameModalUrl,
    playUiSound,
  ]);

  const handleMusicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!musicQuery.trim()) return;
    sendCommand(`Pon música de ${musicQuery.trim()}`);
    setMusicQuery("");
  };

  const formattedRate = `${rateNum >= 0 ? "+" : ""}${rateNum}%`;
  const formattedPitch = `${pitchNum >= 0 ? "+" : ""}${pitchNum}Hz`;

  const handlePreviewVoice = async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "preview",
          voice,
          voiceRate: formattedRate,
          voicePitch: formattedPitch,
          text: "¡Hola! Oye, mira... así suena mi voz en vivo con esta configuración. ¿Te gusta qué tan natural y cercana se escucha?",
        }),
      });
      const data = await res.json();
      if (data.audioUrl) {
        stopSpeaking();
        playAudioQueue([data.audioUrl], false);
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deepseekApiKey: apiKeyInput.trim() || undefined,
        deepseekModel: model,
        voice,
        voiceRate: formattedRate,
        voicePitch: formattedPitch,
        emotionalProsody,
        continuousMode,
        elevenlabsApiKey: elevenlabsKeyInput.trim() || undefined,
        elevenlabsVoiceId: elevenlabsVoiceId.trim() || undefined,
      }),
    });
    setApiKeyInput("");
    setElevenlabsKeyInput("");
    setSettingsOpen(false);
    loadSettings();
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-slate-100 flex flex-col justify-between p-3 sm:p-5 select-none">
      {/* Fullscreen Floating Cyberpunk Blue Particles */}
      <CyberParticles state={orbState} />

      {/* Cinematic Sci-Fi Radial Ambient Glows */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-0">
        <div className="w-[750px] h-[750px] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/15 via-sky-500/5 to-transparent blur-[160px]" />
      </div>

      {/* TOP SCI-FI NAVIGATION & QUICK HUD CONTROLS */}
      <header className="relative z-30 flex items-center justify-between w-full px-2 py-1 sm:px-4">
        {/* Brand & Digital Clock */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 border border-cyan-500/40 backdrop-blur-md shadow-[0_0_15px_rgba(0,240,255,0.15)]">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-mono font-black text-xs tracking-wider text-cyan-300">TARS</span>
            {clock && <span className="font-mono text-[11px] text-zinc-400 pl-2 border-l border-zinc-800">{clock}</span>}
          </div>
        </div>

        {/* Top Right Quick HUD Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Sound FX Toggle */}
          <button
            onClick={handleToggleSoundFx}
            className={`p-2 rounded-xl border transition cursor-pointer backdrop-blur-md ${
              soundMuted ? "bg-black/60 border-zinc-800 text-zinc-500" : "bg-cyan-950/30 border-cyan-500/40 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.15)]"
            }`}
            title={soundMuted ? "Efectos de sonido silenciados" : "Efectos de sonido activos"}
          >
            {soundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Chat Drawer Toggle */}
          <button
            onClick={() => setShowChatDrawer((p) => !p)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono transition cursor-pointer backdrop-blur-md ${
              showChatDrawer ? "bg-cyan-500/25 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.25)]" : "bg-black/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            }`}
            title="Abrir historial de chat"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Chat</span>
          </button>

          {/* Telemetry Drawer */}
          <button
            onClick={() => setShowTelemetryDrawer((p) => !p)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono transition cursor-pointer backdrop-blur-md ${
              showTelemetryDrawer ? "bg-cyan-500/25 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.25)]" : "bg-black/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            }`}
            title="Ver telemetría del sistema"
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden md:inline">HUD</span>
          </button>

          {/* Terminal Drawer */}
          <button
            onClick={() => setTerminalDrawerOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/60 border border-zinc-800 text-xs font-mono text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/40 transition cursor-pointer backdrop-blur-md"
            title="Terminal CLI interactiva"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden md:inline">CLI</span>
          </button>

          {/* Smart TV Controller */}
          <button
            onClick={() => setShowTvModal((p) => !p)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono transition cursor-pointer backdrop-blur-md ${
              showTvModal ? "bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(0,240,255,0.4)]" : "bg-black/60 border-zinc-800 text-cyan-400 hover:text-white hover:border-cyan-500/40"
            }`}
            title="Centro de Control Smart TV"
          >
            <Tv className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">TV</span>
          </button>

          {/* Task Manager Modal */}
          <button
            onClick={() => setTaskManagerOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/60 border border-zinc-800 text-xs font-mono text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/40 transition cursor-pointer backdrop-blur-md"
            title="Monitor de Procesos Linux"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Procesos</span>
          </button>

          {/* Memory Modal */}
          <button
            onClick={() => setMemoryOpen(true)}
            className="p-2 rounded-xl bg-black/60 border border-zinc-800 text-zinc-400 hover:text-pink-300 hover:border-pink-500/40 transition cursor-pointer backdrop-blur-md"
            title="Memoria & Sentimientos"
          >
            <Brain className="w-3.5 h-3.5" />
          </button>

          {/* Settings Modal */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-xl bg-black/60 border border-zinc-800 text-zinc-400 hover:text-cyan-300 hover:border-cyan-400 transition cursor-pointer backdrop-blur-md"
            title="Ajustes de Voz & DeepSeek"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN VIEWPORT: PURE CYBERPUNK TARS NEURAL CORE (MINIMAL & EPIC)        */}
      {/* ========================================================================= */}
      <main className="relative z-10 flex-1 flex flex-col justify-between items-center min-h-0 w-full overflow-y-auto sm:overflow-hidden py-1 sm:py-2">
        {/* TOP STATUS HUD RETICLE & DEDICATED MICROPHONE STATUS */}
        <div className="flex flex-col items-center gap-2 z-20 pt-1 sm:pt-2">
          <div className="flex items-center gap-3 text-[10px] sm:text-[11px] font-mono tracking-widest text-cyan-400 uppercase">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  orbState === "LISTENING"
                    ? "bg-rose-400 animate-ping"
                    : orbState === "SPEAKING"
                    ? "bg-cyan-400 animate-ping"
                    : "bg-emerald-400"
                }`}
              />
              QUANTUM AI CORE // MK-VII
            </span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-400">AUDIO DSP 48.0 KHZ</span>
            <span className="text-zinc-700">|</span>
            <span className="text-cyan-300 font-semibold">{personaMode.toUpperCase()}</span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap justify-center">
            <span
              className={`px-6 py-1.5 rounded-full text-xs font-bold tracking-widest border transition-all duration-300 shadow-2xl backdrop-blur-md ${
                orbState === "LISTENING"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-pulse scale-105"
                  : orbState === "PROCESSING"
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.3)] animate-pulse"
                  : orbState === "SPEAKING"
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_25px_rgba(0,240,255,0.4)] animate-pulse scale-105"
                  : "bg-black/80 text-cyan-400 border-cyan-500/40 shadow-[0_0_20px_rgba(0,240,255,0.15)]"
              }`}
            >
              {orbState === "LISTENING"
                ? "● ESCUCHANDO VOZ EN VIVO"
                : orbState === "PROCESSING"
                ? "✦ PROCESANDO COGNITIVAMENTE..."
                : orbState === "SPEAKING"
                ? "▲ HABLANDO (CLIC O ESPACIO PARA CALLAR)"
                : "◈ TARS EN ESPERA"}
            </span>

            {/* DEDICATED MICROPHONE STATUS INDICATOR & TOGGLE */}
            <button
              onClick={toggleVoiceListening}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-mono font-bold tracking-wider transition-all duration-300 cursor-pointer shadow-lg backdrop-blur-md ${
                orbState === "LISTENING"
                  ? "bg-rose-500/25 border-rose-500 text-rose-300 shadow-[0_0_25px_rgba(244,63,94,0.5)] animate-pulse"
                  : "bg-black/80 border-cyan-500/30 text-cyan-400/80 hover:border-cyan-400 hover:text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.12)]"
              }`}
              title={orbState === "LISTENING" ? "Micrófono ACTIVO (clic o ESPACIO para parar)" : "Micrófono DESACTIVADO (clic o ESPACIO para activar)"}
            >
              {orbState === "LISTENING" ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                  <Mic className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
                  <span className="text-[10px] tracking-widest text-rose-300 font-black uppercase">
                    MIC ACTIVO
                  </span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
                  <MicOff className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-[10px] tracking-widest text-zinc-400 uppercase">
                    MIC DESACTIVADO
                  </span>
                </>
              )}
            </button>

            {/* DEDICATED SPACEBAR HOTKEY STATUS BADGE */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-mono font-bold tracking-wider transition-all duration-200 backdrop-blur-md cursor-pointer ${
                isSpacePressed
                  ? "bg-cyan-400 text-black border-cyan-300 scale-105 shadow-[0_0_25px_#00f0ff]"
                  : orbState === "LISTENING"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse"
                  : orbState === "SPEAKING"
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/50"
                  : "bg-black/80 text-cyan-400/80 border-cyan-500/30 hover:border-cyan-400"
              }`}
              onClick={toggleVoiceListening}
              title="Presiona la tecla ESPACIO en tu teclado para activar o parar el micrófono"
            >
              <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-current text-[10px] font-bold">
                ESPACIO
              </kbd>
              <span className="text-[10px] uppercase font-black">
                {orbState === "LISTENING" ? "Parar" : orbState === "SPEAKING" ? "Silenciar" : "Activar"}
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================= */}
        {/* CYBERPUNK 0% -> 100% GAME CREATION PROGRESS & CONFIRMATION */}
        {/* ======================================================= */}
        {gameCreation.isCreating && (
          <div className="w-full max-w-lg mx-auto my-2 p-4 rounded-2xl bg-black/90 border border-cyan-400 shadow-[0_0_35px_rgba(0,240,255,0.35)] backdrop-blur-2xl z-30 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className="text-cyan-400 flex items-center gap-1.5 font-bold">
                <Sparkles className="w-4 h-4 animate-spin text-cyan-300" />
                {gameCreation.progress === 100 ? "COMPILACIÓN FINALIZADA" : "DESARROLLANDO JUEGO..."}
              </span>
              <span className="text-cyan-300 font-mono font-black text-sm">{gameCreation.progress}%</span>
            </div>

            {/* Glowing Neon Cyberpunk Progress Bar */}
            <div className="w-full h-3 rounded-full bg-zinc-950 border border-cyan-500/40 p-0.5 overflow-hidden shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 shadow-[0_0_15px_#00f0ff] transition-all duration-300 ease-out"
                style={{ width: `${gameCreation.progress}%` }}
              />
            </div>

            <p className="text-[11px] font-mono text-cyan-200/80 mt-2 text-center">
              {gameCreation.statusText}
            </p>

            {/* Confirmation Modal Card when 100% */}
            {gameCreation.progress === 100 && gameCreation.gameInfo && (
              <div className="mt-4 pt-3 border-t border-cyan-500/30 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-2 text-white font-black text-sm tracking-wide">
                  <Gamepad2 className="w-4 h-4 text-cyan-400" />
                  <span>{gameCreation.gameInfo.title}</span>
                </div>
                <div className="text-xs text-cyan-300 font-mono text-center">
                  ¿Deseas ejecutar o correr el juego ahora?
                </div>
                <div className="flex items-center gap-2.5 w-full mt-1">
                  <button
                    onClick={() => {
                      sendCommand("ejecútalo");
                      if (gameCreation.gameInfo) {
                        setActiveGameModalUrl(gameCreation.gameInfo.webPath);
                      }
                      setGameCreation((prev) => ({ ...prev, isCreating: false }));
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-black text-xs tracking-wider uppercase transition shadow-[0_0_20px_rgba(0,240,255,0.6)] cursor-pointer hover:scale-102"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Ejecutar / Jugar Ahora</span>
                  </button>
                  <button
                    onClick={() => setGameCreation((prev) => ({ ...prev, isCreating: false }))}
                    className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold transition cursor-pointer"
                  >
                    Ahora No
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================= */}
        {/* THE CENTRAL KING: TARS ARC REACTOR & SHOCKWAVE SYSTEM */}
        {/* ======================================================= */}
        <div className="relative my-auto flex flex-col items-center justify-center w-full z-10 py-2 sm:py-4">
          <NeuralOrb
            state={orbState}
            audioElement={audioRef.current}
            onClick={toggleVoiceListening}
          />

          {/* Real-time Frequency Spectrum Visualizer */}
          <div className="w-full max-w-sm mt-3 flex justify-center">
            <AudioVisualizer state={orbState} audioElement={audioRef.current} />
          </div>
        </div>

        {/* BOTTOM CONTROLS & ULTRA-CLEAN INTERACTION DOCK */}
        <div className="w-full max-w-2xl flex flex-col items-center gap-3 z-20 pb-2">
          {/* Main Voice Activation Trigger Bar */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleVoiceListening}
              className={`flex items-center gap-2.5 sm:gap-3 px-6 sm:px-8 py-3.5 rounded-2xl font-black text-xs sm:text-sm tracking-widest uppercase transition-all duration-200 shadow-2xl cursor-pointer ${
                isSpacePressed
                  ? "scale-95 ring-2 ring-cyan-300 shadow-[0_0_40px_rgba(0,240,255,0.8)]"
                  : ""
              } ${
                orbState === "LISTENING"
                  ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/50 scale-103 animate-pulse"
                  : orbState === "SPEAKING"
                  ? "bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 text-white shadow-[0_0_35px_rgba(0,240,255,0.5)] scale-102"
                  : "bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-[0_0_30px_rgba(0,240,255,0.35)] hover:scale-102"
              }`}
            >
              {orbState === "LISTENING" ? (
                <>
                  <MicOff className="w-5 h-5 animate-pulse" />
                  <span>Detener Escucha</span>
                  <kbd className="ml-1 px-2 py-0.5 rounded-md bg-black/50 border border-white/30 text-[10px] font-mono font-black tracking-widest text-rose-100">
                    ESPACIO
                  </kbd>
                </>
              ) : orbState === "SPEAKING" ? (
                <>
                  <Square className="w-5 h-5 fill-current" />
                  <span>Silenciar Voz</span>
                  <kbd className="ml-1 px-2 py-0.5 rounded-md bg-black/50 border border-white/30 text-[10px] font-mono font-black tracking-widest text-cyan-100">
                    ESPACIO
                  </kbd>
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  <span>Hablar con TARS</span>
                  <kbd className="ml-1 px-2 py-0.5 rounded-md bg-black/50 border border-white/30 text-[10px] font-mono font-black tracking-widest text-cyan-100">
                    ESPACIO
                  </kbd>
                </>
              )}
            </button>

            {orbState === "SPEAKING" && (
              <button
                onClick={() => {
                  stopSpeaking();
                  setOrbState("IDLE");
                  playUiSound("alert");
                }}
                className="p-3.5 rounded-2xl bg-black/80 hover:bg-rose-500/20 border border-zinc-800 hover:border-rose-500/40 text-zinc-300 hover:text-rose-300 transition cursor-pointer"
                title="Callar voz actual"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            )}

            <button
              onClick={() => {
                const next = !continuousMode;
                setContinuousMode(next);
                if (!next) setContinuousSessionActive(false);
              }}
              className={`flex items-center gap-2 px-5 py-3.5 rounded-2xl border text-xs font-bold transition cursor-pointer backdrop-blur-md ${
                continuousMode
                  ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                  : "bg-black/80 border-cyan-500/30 text-cyan-400/80 hover:border-cyan-500/60"
              }`}
              title="Modo Manos Libres continuo"
            >
              <Radio className={`w-4 h-4 ${continuousSessionActive ? "animate-ping text-emerald-400" : ""}`} />
              <span className="hidden sm:inline">
                {continuousMode ? "Manos Libres ON" : "Manos Libres OFF"}
              </span>
            </button>

            {/* Quick Micro Status Indicator Button */}
            <button
              onClick={toggleVoiceListening}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                orbState === "LISTENING"
                  ? "bg-rose-500/25 border-rose-500 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.4)]"
                  : "bg-black/80 border-cyan-500/30 text-cyan-400/80 hover:border-cyan-400 hover:text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.12)]"
              }`}
              title={orbState === "LISTENING" ? "Micrófono ACTIVO (clic para silenciar)" : "Micrófono INACTIVO (clic para hablar)"}
            >
              {orbState === "LISTENING" ? <Mic className="w-4 h-4 text-rose-400 animate-pulse" /> : <MicOff className="w-4 h-4" />}
            </button>

            {/* Optional Keyboard Input Drawer Toggle */}
            <button
              onClick={() => setShowInputBar((prev) => !prev)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                showInputBar
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                  : "bg-black/80 border-cyan-500/30 text-cyan-400/80 hover:border-cyan-500 hover:text-cyan-300"
              }`}
              title="Abrir o cerrar entrada de texto"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>

          {/* Toggleable Clean Command Input Box */}
          {showInputBar && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!inputText.trim()) return;
                sendCommand(inputText);
                setInputText("");
              }}
              className="w-full flex items-center gap-2.5 p-2 px-4 rounded-2xl bg-black/85 backdrop-blur-2xl border border-cyan-500/40 focus-within:border-cyan-400 focus-within:shadow-[0_0_30px_rgba(0,240,255,0.25)] transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <Search className="w-4 h-4 text-cyan-400 ml-1 shrink-0" />
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Escribe una orden para TARS (ej: 'Crea el juego del tetris', '$ uptime')..."
                className="flex-1 bg-transparent text-xs sm:text-sm text-cyan-100 placeholder-zinc-500 focus:outline-none font-mono"
                autoFocus
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black transition cursor-pointer shrink-0 shadow-[0_0_15px_rgba(0,240,255,0.4)]"
                title="Enviar orden"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>

        {/* ========================================================================= */}
        {/* FLOATING HOLOGRAPHIC GLASS CHAT DRAWER (DOES NOT OBSTRUCT THE CORE)       */}
        {/* ========================================================================= */}
        {showChatDrawer && (
          <aside className="absolute right-4 top-20 bottom-24 w-80 sm:w-96 rounded-2xl bg-slate-950/90 backdrop-blur-3xl border border-sky-500/30 shadow-2xl flex flex-col z-40 overflow-hidden animate-in slide-in-from-right duration-200 hud-bracket">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Historial de Chat
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setMessages([]);
                    playUiSound("click");
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                  title="Vaciar chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowChatDrawer(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-3 font-sans text-xs">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      m.sender === "user"
                        ? "bg-sky-500 text-slate-950 font-medium rounded-br-xs shadow-md"
                        : "bg-slate-900/90 text-slate-100 border border-slate-800 rounded-bl-xs"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span>{m.text}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(m.text);
                            setCopiedMsgId(m.id);
                            playUiSound("click");
                            setTimeout(() => setCopiedMsgId(null), 2000);
                          }}
                          className="text-slate-400 hover:text-white p-0.5"
                          title="Copiar texto"
                        >
                          {copiedMsgId === m.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 px-1 font-mono">{m.time}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </aside>
        )}

        {/* ========================================================================= */}
        {/* FLOATING HOLOGRAPHIC TELEMETRY DRAWER                                     */}
        {/* ========================================================================= */}
        {showTelemetryDrawer && (
          <aside className="absolute left-4 top-20 bottom-24 w-80 rounded-2xl bg-slate-950/90 backdrop-blur-3xl border border-sky-500/30 shadow-2xl flex flex-col z-40 overflow-hidden animate-in slide-in-from-left duration-200 hud-bracket">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Telemetría HUD
                </span>
              </div>
              <button
                onClick={() => setShowTelemetryDrawer(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs font-mono">
              {/* CPU */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">CPU</span>
                  <span className="text-sky-400 font-bold">{stats.cpuPercent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-sky-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, stats.cpuPercent)}%` }}
                  />
                </div>
              </div>

              {/* RAM */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">RAM</span>
                  <span className="text-white">
                    {stats.ramUsedGb} / {stats.ramTotalGb} GB ({stats.ramPercent}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, stats.ramPercent)}%` }}
                  />
                </div>
              </div>

              {/* Disk */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">NVMe</span>
                  <span className="text-white">
                    {stats.diskUsedGb} / {stats.diskTotalGb} GB ({stats.diskPercent}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, stats.diskPercent)}%` }}
                  />
                </div>
              </div>

              {/* Quick Launchers */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Acceso Rápido
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => sendCommand("Abre Google Chrome")}
                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 hover:text-white"
                  >
                    <Globe className="w-3.5 h-3.5 text-sky-400" />
                    <span>Chrome</span>
                  </button>
                  <button
                    onClick={() => sendCommand("Abre la terminal")}
                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 hover:text-white"
                  >
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Terminal</span>
                  </button>
                  <button
                    onClick={() => sendCommand("Abre archivos dolphin")}
                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 hover:text-white"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Archivos</span>
                  </button>
                  <button
                    onClick={() => sendCommand("Abre el editor")}
                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 hover:text-white"
                  >
                    <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Editor</span>
                  </button>
                </div>
              </div>
            </div>
          </aside>
        )}
      </main>

      {/* Hidden Audio Player with Queue & Studio WebAudio Chain */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onPlay={() => setOrbState("SPEAKING")}
        onEnded={handleAudioEnded}
      />

      {/* SETTINGS & HYPER-REALISTIC VOICE STUDIO MODAL */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-sky-400" />
                Estudio de Voz Hiper-Realista & IA
              </h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Voice Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Motor de Voz Neural Conversacional
                </label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-sky-500"
                >
                  <optgroup label="★ Voces de Mujer Latina (100% Naturales y Cálidas)">
                    <option value="es-CO-SalomeNeural">
                      Salomé (Colombiana — Dulce, Juvenil, Muy Natural y Fluida)
                    </option>
                    <option value="es-VE-PaolaNeural">
                      Paola (Venezolana — Cálida, Suave y Súper Femenina)
                    </option>
                    <option value="es-MX-DaliaNeural">
                      Dalia (Mexicana — Expresiva, Cercana y Humana)
                    </option>
                    <option value="es-PE-CamilaNeural">
                      Camila (Peruana — Clara, Melódica y Natural)
                    </option>
                    <option value="es-CR-MariaNeural">
                      María (Costarricense — Voz Limpia, Suave y Agradable)
                    </option>
                    <option value="es-AR-ElenaNeural">
                      Elena (Argentina — Carismática y Conversacional)
                    </option>
                    <option value="es-CL-CatalinaNeural">
                      Catalina (Chilena — Ágil y Juvenil)
                    </option>
                    <option value="es-US-PalomaNeural">
                      Paloma (Latina Neutra — Tono Cálido de Asistente)
                    </option>
                  </optgroup>
                  <optgroup label="Otras Voces en Español">
                    <option value="es-ES-XimenaNeural">
                      Ximena (España — Expresiva)
                    </option>
                    <option value="es-CO-GonzaloNeural">
                      Gonzalo (Latinoamérica — Masculina)
                    </option>
                  </optgroup>
                </select>
              </div>

              {/* Rate & Pitch Sliders + Live Voice Test Button */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Velocidad de Habla ({formattedRate})
                  </span>
                  <span className="text-[11px] text-sky-400 font-mono">
                    {rateNum === 0 ? "Normal" : rateNum > 0 ? "Ágil y Fluida" : "Pausada"}
                  </span>
                </div>
                <input
                  type="range"
                  min={-10}
                  max={16}
                  step={1}
                  value={rateNum}
                  onChange={(e) => setRateNum(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer h-1.5"
                />

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-medium text-slate-300">
                    Tono / Calidez Vocal ({formattedPitch})
                  </span>
                  <span className="text-[11px] text-sky-400 font-mono">
                    {pitchNum === 0 ? "Neutro" : pitchNum > 0 ? "Brillante" : "Profundo"}
                  </span>
                </div>
                <input
                  type="range"
                  min={-6}
                  max={8}
                  step={1}
                  value={pitchNum}
                  onChange={(e) => setPitchNum(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer h-1.5"
                />

                <div className="pt-2 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emotionalProsody}
                      onChange={(e) => setEmotionalProsody(e.target.checked)}
                      className="accent-sky-400 rounded cursor-pointer"
                    />
                    <span>Prosodia Emocional Dinámica (según humor y signos)</span>
                  </label>

                  <button
                    type="button"
                    onClick={handlePreviewVoice}
                    disabled={previewLoading}
                    className="px-3.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-xs font-semibold text-sky-300 flex items-center gap-1.5 transition cursor-pointer shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{previewLoading ? "Generando..." : "Probar Voz en Vivo"}</span>
                  </button>
                </div>
              </div>

              {/* Continuous Hands-Free Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div>
                  <p className="text-xs font-semibold text-white">
                    Modo Conversación Continua (Manos Libres)
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Escucha automáticamente al terminar cada respuesta y permite interrumpir (Barge-In)
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={continuousMode}
                  onChange={(e) => setContinuousMode(e.target.checked)}
                  className="w-4 h-4 accent-sky-400 cursor-pointer"
                />
              </div>

              {/* DeepSeek API & Model */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Clave API DeepSeek
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={maskedKey || "sk-..."}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                  {deepseekConfigured && (
                    <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Activa ({maskedKey})
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Modelo de IA
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="deepseek-chat">DeepSeek Chat (V3 — Rápido)</option>
                    <option value="deepseek-reasoner">DeepSeek Reasoner (R1)</option>
                  </select>
                </div>
              </div>

              {/* Optional ElevenLabs Ultra-Clone Integration */}
              <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Opcional: Clonación Vocal ElevenLabs Multilingual v2
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    value={elevenlabsKeyInput}
                    onChange={(e) => setElevenlabsKeyInput(e.target.value)}
                    placeholder={elevenlabsMasked || "ElevenLabs API Key (Opcional)"}
                    className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                  <input
                    type="text"
                    value={elevenlabsVoiceId}
                    onChange={(e) => setElevenlabsVoiceId(e.target.value)}
                    placeholder="Voice ID"
                    className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-950/60 border-t border-slate-800 flex justify-end gap-2.5">
              <button
                onClick={() => setSettingsOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition cursor-pointer"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MEMORY & EMOTIONS MODAL */}
      {memoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Brain className="w-4 h-4 text-sky-400" />
                Memoria a Largo Plazo & Sentimientos
              </h2>
              <button
                onClick={() => setMemoryOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Emotional State Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-sky-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 fill-sky-400/30" />
                    Estado Emocional Actual
                  </span>
                  <span className="text-xs font-mono text-emerald-400">
                    Afinidad: {emotion.affinity}%
                  </span>
                </div>
                <p className="text-sm font-semibold text-white">
                  {emotion.emoji} {emotion.mood}
                </p>
                <p className="text-xs text-slate-300 italic">&ldquo;{emotion.feelingNote}&rdquo;</p>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all"
                    style={{ width: `${Math.min(100, emotion.affinity)}%` }}
                  />
                </div>
              </div>

              {/* Add New Memory Manually */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newMemoryText.trim()) return;
                  const res = await fetch("/api/memory", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "add", fact: newMemoryText.trim() }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setMemories(data.store.memories || []);
                    setNewMemoryText("");
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={newMemoryText}
                  onChange={(e) => setNewMemoryText(e.target.value)}
                  placeholder="Enséñale algo para que lo recuerde siempre..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Guardar
                </button>
              </form>

              {/* Learned Facts List */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Recuerdos Aprendidos ({memories.length})
                </h3>
                {memories.length === 0 ? (
                  <p className="text-xs text-slate-500">Aún no hay recuerdos guardados.</p>
                ) : (
                  <div className="space-y-2">
                    {memories.map((mem) => (
                      <div
                        key={mem.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 text-[10px] font-mono uppercase">
                            {mem.category}
                          </span>
                          <span className="text-slate-200">{mem.fact}</span>
                        </div>
                        <button
                          onClick={async () => {
                            const res = await fetch("/api/memory", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "delete", id: mem.id }),
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setMemories(data.store.memories || []);
                            }
                          }}
                          className="text-slate-500 hover:text-rose-400 cursor-pointer p-1"
                          title="Olvidar este recuerdo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Frequent Requests */}
              {frequentPatterns.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Lo que pides frecuentemente
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {frequentPatterns.slice(0, 8).map((fp, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setMemoryOpen(false);
                          sendCommand(fp.pattern);
                        }}
                        className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-sky-500/20 border border-slate-700 text-[11px] text-slate-300 cursor-pointer"
                      >
                        {fp.pattern} <span className="text-sky-400">({fp.count}x)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* COMMAND PALETTE OVERLAY (Ctrl + K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onSendCommand={sendCommand}
        onSetPersonaMode={handleSetPersonaMode}
        currentMode={personaMode}
        onOpenTaskManager={() => setTaskManagerOpen(true)}
        onClearChat={() => setMessages([])}
      />

      {/* LINUX TASK MANAGER MODAL */}
      <TaskManagerModal
        isOpen={taskManagerOpen}
        onClose={() => setTaskManagerOpen(false)}
        processes={stats.topProcesses || []}
        onRefresh={async () => {
          try {
            const res = await fetch("/api/system");
            if (res.ok) {
              const d = await res.json();
              setStats(d);
            }
          } catch {
            // ignore
          }
        }}
      />

      {/* LIVE CLI TERMINAL DRAWER */}
      <TerminalDrawer
        isOpen={terminalDrawerOpen}
        onClose={() => setTerminalDrawerOpen(false)}
        entries={terminalEntries}
        onExecuteCommand={handleExecuteTerminalCommand}
        onClear={() => setTerminalEntries([])}
      />

      {/* SMART TV TARS INDUSTRIES CONTROL MODAL */}
      {showTvModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-150">
          <div className="relative w-full max-w-lg bg-zinc-950/95 border border-cyan-500/40 rounded-3xl p-5 shadow-[0_0_50px_rgba(0,240,255,0.2)] flex flex-col gap-4 text-zinc-100 font-sans">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/50 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.3)]">
                  <Tv className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-mono text-sm font-black tracking-widest text-cyan-300">
                    SMART TV // TARS INDUSTRIES
                  </h3>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>TCL TV (192.168.1.54:5555) • Conectada</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowTvModal(false)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Actions (Proyectar HUD, Teleport & Fondo Cyber) */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  sendCommand("proyecta el hud en la tv");
                  setShowTvModal(false);
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl bg-gradient-to-r from-cyan-950/50 to-blue-950/50 border border-cyan-500/40 text-cyan-200 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(0,240,255,0.3)] transition cursor-pointer text-xs font-mono font-bold"
              >
                <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" />
                <span>HUD TV</span>
              </button>
              <button
                onClick={() => {
                  fetch("/api/teleport", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "tv" }) });
                  setShowTvModal(false);
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl bg-gradient-to-r from-emerald-950/50 to-teal-950/50 border border-emerald-500/40 text-emerald-200 hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition cursor-pointer text-xs font-mono font-bold"
              >
                <Tv className="w-4 h-4 text-emerald-400" />
                <span>Teleport</span>
              </button>
              <button
                onClick={() => {
                  sendCommand("cambia el fondo de la tv");
                  setShowTvModal(false);
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl bg-gradient-to-r from-indigo-950/50 to-purple-950/50 border border-indigo-500/40 text-indigo-200 hover:border-indigo-400 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition cursor-pointer text-xs font-mono font-bold"
              >
                <Activity className="w-4 h-4 text-indigo-400" />
                <span>Fondo Cyber</span>
              </button>
            </div>

            {/* TV Power, Play/Pause, Home */}
            <div className="bg-black/40 border border-zinc-800/80 rounded-2xl p-3 flex flex-col gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Control Básico</span>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  onClick={() => sendCommand("enciende la tv")}
                  className="py-2 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/40 transition cursor-pointer text-xs font-mono font-semibold"
                >
                  Encender
                </button>
                <button
                  onClick={() => sendCommand("apaga la tv")}
                  className="py-2 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-300 hover:bg-rose-900/40 transition cursor-pointer text-xs font-mono font-semibold"
                >
                  Apagar
                </button>
                <button
                  onClick={() => sendCommand("pausa la tv")}
                  className="py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition cursor-pointer text-xs font-mono font-semibold"
                >
                  Play / Pausa
                </button>
                <button
                  onClick={() => sendCommand("ve al inicio en la tv")}
                  className="py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition cursor-pointer text-xs font-mono font-semibold"
                >
                  Inicio
                </button>
              </div>
            </div>

            {/* Audio Volume Controls */}
            <div className="bg-black/40 border border-zinc-800/80 rounded-2xl p-3 flex flex-col gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Audio TV</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => sendCommand("sube el volumen de la tv")}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-cyan-300 hover:border-cyan-500/50 transition cursor-pointer text-xs font-mono"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Volumen +</span>
                </button>
                <button
                  onClick={() => sendCommand("baja el volumen de la tv")}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition cursor-pointer text-xs font-mono"
                >
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Volumen -</span>
                </button>
                <button
                  onClick={() => sendCommand("silencia la tv")}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-amber-300 hover:border-amber-500/50 transition cursor-pointer text-xs font-mono"
                >
                  <span>Mute</span>
                </button>
              </div>
            </div>

            {/* Streaming Apps Launcher */}
            <div className="bg-black/40 border border-zinc-800/80 rounded-2xl p-3 flex flex-col gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Lanzar Streaming en TV</span>
              <div className="grid grid-cols-4 gap-1.5 text-xs font-mono">
                {[
                  { name: "YouTube", cmd: "abre youtube en la tv", color: "hover:border-rose-500/50 text-rose-300" },
                  { name: "Netflix", cmd: "abre netflix en la tv", color: "hover:border-red-500/50 text-red-400" },
                  { name: "Crunchyroll", cmd: "abre crunchyroll en la tv", color: "hover:border-amber-500/50 text-amber-300" },
                  { name: "Disney+", cmd: "abre disney en la tv", color: "hover:border-blue-500/50 text-blue-300" },
                  { name: "Prime Video", cmd: "abre prime en la tv", color: "hover:border-sky-500/50 text-sky-300" },
                  { name: "HBO Max", cmd: "abre max en la tv", color: "hover:border-purple-500/50 text-purple-300" },
                  { name: "Apple TV", cmd: "abre apple tv en la tv", color: "hover:border-zinc-400 text-zinc-300" },
                  { name: "Navegador", cmd: "abre navegador en la tv", color: "hover:border-cyan-400 text-cyan-300" },
                ].map((app) => (
                  <button
                    key={app.name}
                    onClick={() => {
                      sendCommand(app.cmd);
                      setShowTvModal(false);
                    }}
                    className={`py-2 px-1 rounded-xl bg-zinc-900/80 border border-zinc-800 text-[11px] font-semibold text-center transition cursor-pointer ${app.color}`}
                  >
                    {app.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PLAYABLE IN-APP CYBERPUNK GAME MODAL */}
      {activeGameModalUrl && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-3xl flex flex-col p-3 sm:p-5 animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-500/40">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-sm font-black tracking-widest">
              <Sparkles className="w-4 h-4 text-cyan-300 animate-spin" />
              <span>MODO JUEGO // TARS ARCADE</span>
            </div>
            <button
              onClick={() => setActiveGameModalUrl(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:bg-rose-500/20 hover:border-rose-500 text-zinc-300 hover:text-rose-300 transition cursor-pointer text-xs font-bold"
            >
              <X className="w-4 h-4" />
              <span>Cerrar Juego</span>
            </button>
          </div>
          <div className="flex-1 w-full mt-3 rounded-2xl overflow-hidden border border-cyan-500/40 bg-black shadow-[0_0_35px_rgba(0,240,255,0.25)]">
            <iframe src={activeGameModalUrl} className="w-full h-full border-none bg-black" />
          </div>
        </div>
      )}
    </div>
  );
}

import fs from "fs";
import path from "path";

const MEMORY_FILE = path.join(process.cwd(), "memory_store.json");

export interface LearnedMemory {
  id: string;
  fact: string;
  category: "preferencia" | "proyecto" | "personal" | "habito";
  createdAt: string;
}

export interface FrequentPattern {
  pattern: string;
  count: number;
  lastUsed: string;
}

export interface EmotionalState {
  mood: string;
  emoji: string;
  affinity: number; // 1 to 100
  feelingNote: string;
}

export interface LastGameCreated {
  gameType: "snake" | "tetris" | "pong" | "tarjeta" | "adivinanza" | string;
  filename: string;
  path: string;
  title: string;
  timestamp: string;
}

export interface MemoryStoreData {
  memories: LearnedMemory[];
  frequentPatterns: FrequentPattern[];
  emotionalState: EmotionalState;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string; timestamp: string }>;
  lastGameCreated?: LastGameCreated;
}

const DEFAULT_MEMORY: MemoryStoreData = {
  memories: [
    {
      id: "init-1",
      fact: "Trabaja en proyectos de código y juegos HTML en la carpeta /home/zarate/senati.",
      category: "proyecto",
      createdAt: new Date().toISOString(),
    },
  ],
  frequentPatterns: [],
  emotionalState: {
    mood: "Entusiasmada y Curiosa",
    emoji: "✨",
    affinity: 25,
    feelingNote: "Me siento feliz de aprender contigo y ayudarte a construir tus ideas.",
  },
  conversationHistory: [],
};

export function loadMemoryStore(): MemoryStoreData {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(DEFAULT_MEMORY, null, 2), "utf-8");
      return DEFAULT_MEMORY;
    }
    const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      memories: Array.isArray(parsed.memories) ? parsed.memories : DEFAULT_MEMORY.memories,
      frequentPatterns: Array.isArray(parsed.frequentPatterns) ? parsed.frequentPatterns : [],
      emotionalState: parsed.emotionalState || DEFAULT_MEMORY.emotionalState,
      conversationHistory: Array.isArray(parsed.conversationHistory) ? parsed.conversationHistory : [],
      lastGameCreated: parsed.lastGameCreated,
    };
  } catch {
    return DEFAULT_MEMORY;
  }
}

export function recordLastGameCreated(game: Omit<LastGameCreated, "timestamp">): void {
  const store = loadMemoryStore();
  store.lastGameCreated = {
    ...game,
    timestamp: new Date().toISOString(),
  };
  saveMemoryStore(store);
}

export function getLastGameCreated(): LastGameCreated | undefined {
  const store = loadMemoryStore();
  return store.lastGameCreated;
}

export function saveMemoryStore(data: MemoryStoreData): void {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save memory store:", err);
  }
}

function internalAddMemory(
  store: MemoryStoreData,
  fact: string,
  category: "preferencia" | "proyecto" | "personal" | "habito" = "preferencia"
): LearnedMemory {
  const cleanFact = fact.trim();

  // Avoid exact duplicates
  const existing = store.memories.find(
    (m) => m.fact.toLowerCase() === cleanFact.toLowerCase()
  );
  if (existing) return existing;

  const newMem: LearnedMemory = {
    id: `mem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    fact: cleanFact,
    category,
    createdAt: new Date().toISOString(),
  };

  store.memories.unshift(newMem);
  if (store.memories.length > 500) {
    store.memories = store.memories.slice(0, 500);
  }

  // Increase affinity when learning something new
  store.emotionalState.affinity = Math.min(100, (store.emotionalState.affinity || 20) + 3);
  return newMem;
}

export function addLearnedMemory(
  fact: string,
  category: "preferencia" | "proyecto" | "personal" | "habito" = "preferencia"
): LearnedMemory {
  const store = loadMemoryStore();
  const newMem = internalAddMemory(store, fact, category);
  saveMemoryStore(store);
  return newMem;
}

export function updateEmotionalState(
  mood: string,
  emoji: string,
  feelingNote: string
): EmotionalState {
  const store = loadMemoryStore();
  store.emotionalState.mood = mood;
  store.emotionalState.emoji = emoji;
  store.emotionalState.feelingNote = feelingNote;
  store.emotionalState.affinity = Math.min(100, (store.emotionalState.affinity || 20) + 1);
  saveMemoryStore(store);
  return store.emotionalState;
}

export function removeLearnedMemory(id: string): boolean {
  const store = loadMemoryStore();
  const before = store.memories.length;
  store.memories = store.memories.filter((m) => m.id !== id);
  saveMemoryStore(store);
  return store.memories.length < before;
}

export function recordUserInteraction(
  userText: string,
  assistantReply: string,
  moodUpdate?: { mood?: string; emoji?: string; feelingNote?: string }
): void {
  const store = loadMemoryStore();

  // 1. Track frequent command patterns
  const trimmedUser = userText.trim();
  const normalized = trimmedUser.toLowerCase();
  if (normalized.length > 3 && normalized.length < 120) {
    const existingPattern = store.frequentPatterns.find(
      (p) => p.pattern.toLowerCase() === normalized
    );
    if (existingPattern) {
      existingPattern.count += 1;
      existingPattern.lastUsed = new Date().toISOString();
    } else {
      store.frequentPatterns.push({
        pattern: trimmedUser,
        count: 1,
        lastUsed: new Date().toISOString(),
      });
    }
    store.frequentPatterns.sort((a, b) => b.count - a.count);
    store.frequentPatterns = store.frequentPatterns.slice(0, 20);
  }

  // 2. High-precision semantic fact extractor
  if (trimmedUser) {
    const nameMatch = trimmedUser.match(/\b(?:me llamo|mi nombre es)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,25})/i);
    if (nameMatch && nameMatch[1]) {
      internalAddMemory(store, `El nombre del usuario es ${nameMatch[1].trim()}.`, "personal");
    }

    const likeMatch = trimmedUser.match(/\b(?:me gusta(?:n)? mucho|mi favorito es|recuerda que|no olvides que|mi pasión es)\s+(.{4,90})/i);
    if (likeMatch && likeMatch[1]) {
      internalAddMemory(store, `Dato recordado: ${likeMatch[1].trim()}`, "preferencia");
    }

    const hateMatch = trimmedUser.match(/\b(?:odio|no soporto|no me gusta nada|detesto)\s+(.{4,80})/i);
    if (hateMatch && hateMatch[1]) {
      internalAddMemory(store, `Al usuario NO le agrada: ${hateMatch[1].trim()}`, "preferencia");
    }

    const studyMatch = trimmedUser.match(/\b(?:estudio|estudiando|curso|carrera|mi instituto es|mi universidad es|mi tesis es)\s+(.{4,90})/i);
    if (studyMatch && studyMatch[1]) {
      internalAddMemory(store, `Estudios/Tesis: ${studyMatch[1].trim()}`, "proyecto");
    }

    const familyMatch = trimmedUser.match(/\b(?:mi (?:madre|mam[aá]|pap[aá]|padre|hermano|hermana|novia|pareja|amigo|compañero) se llama)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,25})/i);
    if (familyMatch && familyMatch[1]) {
      internalAddMemory(store, `Círculo cercano: ${familyMatch[0].trim()}.`, "personal");
    }

    const habitMatch = trimmedUser.match(/\b(?:tengo que|debo|siempre a las|todos los d[ií]as)\s+(.{5,90})/i);
    if (habitMatch && habitMatch[1]) {
      internalAddMemory(store, `Hábito/Compromiso: ${habitMatch[0].trim()}`, "habito");
    }
  }

  // 3. Update emotional state naturally
  store.emotionalState.affinity = Math.min(100, (store.emotionalState.affinity || 20) + 1);
  if (moodUpdate?.mood) store.emotionalState.mood = moodUpdate.mood;
  if (moodUpdate?.emoji) store.emotionalState.emoji = moodUpdate.emoji;
  if (moodUpdate?.feelingNote) store.emotionalState.feelingNote = moodUpdate.feelingNote;

  // 4. Append to persistent conversation history (expanded to 60 exchanges)
  const trimmedReply = assistantReply.trim();
  if (trimmedUser && trimmedReply) {
    store.conversationHistory.push(
      { role: "user", content: trimmedUser, timestamp: new Date().toISOString() },
      { role: "assistant", content: trimmedReply, timestamp: new Date().toISOString() }
    );
    if (store.conversationHistory.length > 60) {
      store.conversationHistory = store.conversationHistory.slice(-60);
    }
  }

  saveMemoryStore(store);
}

export function buildMemoryContextForPrompt(query: string = ""): string {
  const store = loadMemoryStore();
  const qClean = query.toLowerCase().trim();
  const qTokens = qClean
    .split(/\s+/)
    .map((w) => w.replace(/[^a-záéíóúñ0-9]/gi, ""))
    .filter((w) => w.length >= 3);

  // Score each memory for semantic relevance to the current question
  const scored = store.memories.map((m) => {
    let score = 0;
    const factLower = m.fact.toLowerCase();

    // Priority core identity facts
    if (/propietario|zarate|spark\s*30|tcl|senati|tesis|garuda/i.test(factLower)) {
      score += 15;
    }

    // Keyword matching
    for (const tok of qTokens) {
      if (factLower.includes(tok)) {
        score += 25;
      }
    }

    // Category query affinity
    if (/código|archivo|juego|programa|proyecto|carpeta|web/i.test(qClean) && m.category === "proyecto") score += 10;
    if (/hora|recordar|alarma|clase|lavar|beber|agua/i.test(qClean) && m.category === "habito") score += 12;
    if (/gusta|música|tele|tv|pantalla|fondo/i.test(qClean) && m.category === "preferencia") score += 10;
    if (/amigo|nombre|celular|familia|quien/i.test(qClean) && m.category === "personal") score += 10;

    return { memory: m, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Take top 35 prioritized memories
  const topMemories = scored.slice(0, 35).map((s) => `- [${s.memory.category.toUpperCase()}] ${s.memory.fact}`);
  const topFreq = store.frequentPatterns
    .filter((p) => p.count >= 2)
    .slice(0, 8)
    .map((p) => `- "${p.pattern}" (pedido ${p.count} veces)`);

  return `
=== MEMORIA OMNISCIENTE A LARGO PLAZO DE TARS (TARS CORE) ===
Total recuerdos almacenados: ${store.memories.length} | Recuperados por relevancia: ${topMemories.length}
Conocimientos clave sobre Zárate:
${topMemories.length > 0 ? topMemories.join("\n") : "- Aprendiendo constantemente sobre Zárate."}

Comandos y patrones más frecuentes de Zárate:
${topFreq.length > 0 ? topFreq.join("\n") : "- Explorando nuevas tareas."}

Estado emocional y sintonía con Zárate:
- Humor: ${store.emotionalState.mood} (${store.emotionalState.emoji})
- Nivel de afinidad / complicidad: ${store.emotionalState.affinity}/100
- Conexión actual: "${store.emotionalState.feelingNote}"
========================================================================
`;
}

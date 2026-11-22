/**
 * TARS // Relé en vivo (modo nube)
 *
 * El VPS no tiene pantalla, webcam ni mouse. El teléfono pide imágenes y manda toques al VPS;
 * el satélite de la laptop ve qué fuentes se están pidiendo, captura y sube los fotogramas,
 * y ejecuta los toques. Todo en memoria (son datos efímeros).
 */
export interface LiveFrame {
  image: string; // data:image/jpeg;base64,...
  ts: number;
  width: number;
  height: number;
}

interface RelayState {
  frames: Map<string, LiveFrame>;
  status?: Map<string, { status: string; ts: number }>;
  wanted: Map<string, number>;
  lastInputAt: number;
}

// globalThis: un único estado aunque varias rutas importen el módulo
const g = globalThis as unknown as { __tarsRelay?: RelayState };
const state: RelayState =
  g.__tarsRelay || (g.__tarsRelay = { frames: new Map(), wanted: new Map(), lastInputAt: 0 });

export const LIVE_SOURCES = ["screen", "webcam", "tv"] as const;
const WANT_WINDOW_MS = 6000; // el teléfono pide fotogramas cada ~1 s; sin pedidos 6 s → se deja de capturar
const FRAME_MAX_AGE_MS = 15000;

/** El teléfono pide una fuente: se marca como deseada y se devuelve el último fotograma reciente. */
export function requestFrame(source: string): LiveFrame | null {
  if (!(LIVE_SOURCES as readonly string[]).includes(source)) return null;
  state.wanted.set(source, Date.now());
  const f = state.frames.get(source);
  return f && Date.now() - f.ts < FRAME_MAX_AGE_MS ? f : null;
}

export function wantedSources(): string[] {
  const now = Date.now();
  return [...state.wanted.entries()].filter(([, t]) => now - t < WANT_WINDOW_MS).map(([s]) => s);
}

export function storeFrame(source: string, image: string, width = 0, height = 0): boolean {
  if (!(LIVE_SOURCES as readonly string[]).includes(source)) return false;
  if (typeof image !== "string" || !image.startsWith("data:image/jpeg;base64,") || image.length > 3_000_000) return false;
  state.frames.set(source, { image, ts: Date.now(), width, height });
  return true;
}

/** Estado de la fuente reportado por la laptop: ok | tv_off | dark | error */
export function storeStatus(source: string, status: string): void {
  if (!(LIVE_SOURCES as readonly string[]).includes(source)) return;
  if (!state.status) state.status = new Map();
  state.status.set(source, { status: String(status).slice(0, 16), ts: Date.now() });
}

export function getStatus(source: string): string {
  const st = state.status?.get(source);
  return st && Date.now() - st.ts < 20000 ? st.status : "";
}

export function markInput(): void {
  state.lastInputAt = Date.now();
}

/** Con el trackpad o la vista en vivo abiertos, el satélite consulta mucho más seguido. */
export function isInteractive(): boolean {
  return Date.now() - state.lastInputAt < 20000 || wantedSources().length > 0;
}

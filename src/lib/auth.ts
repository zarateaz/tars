/**
 * TARS // Autenticación central
 *
 * Todo el tráfico (páginas y /api) pasa por src/middleware.ts, que usa estas
 * funciones. Se acepta el token por:
 *   - Cookie de sesión `stark_session` (navegador, tras /login)
 *   - Header `x-stark-token` o `Authorization: Bearer <token>` (APK, satélite, scripts)
 *   - Query `?token=` (solo para el primer acceso; el middleware lo cambia por cookie)
 */
import crypto from "crypto";
import { getSettings } from "./config";

export const SESSION_COOKIE = "stark_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

function sha256(v: string): Buffer {
  return crypto.createHash("sha256").update(v).digest();
}

function safeEqual(a: string, b: string): boolean {
  // Comparación en tiempo constante (sobre hashes de igual longitud)
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

export function getAuthToken(): string {
  return getSettings().starkAuthToken;
}

/** Valor de la cookie: derivado del token, nunca el token en claro. */
export function sessionValueFor(token: string): string {
  return crypto.createHmac("sha256", token).update("jearvis-session-v1").digest("hex");
}

function readCookie(req: Request, name: string): string {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return "";
}

export function isValidToken(candidate: string): boolean {
  const token = getAuthToken();
  if (!token || !candidate) return false;
  return safeEqual(candidate, token);
}

/** true si la petición trae credenciales válidas. Si no hay token configurado: SIEMPRE false. */
export function isAuthorized(req: Request): boolean {
  const token = getAuthToken();
  if (!token) return false;

  const header = req.headers.get("x-stark-token") || "";
  if (header && safeEqual(header, token)) return true;

  const authz = req.headers.get("authorization") || "";
  if (authz.startsWith("Bearer ") && safeEqual(authz.slice(7).trim(), token)) return true;

  const cookie = readCookie(req, SESSION_COOKIE);
  if (cookie && safeEqual(cookie, sessionValueFor(token))) return true;

  try {
    const q = new URL(req.url).searchParams.get("token");
    if (q && safeEqual(q, token)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

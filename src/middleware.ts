/**
 * TARS // Puerta de seguridad global
 *
 * Antes de esto, cualquier API (incluida la que ejecuta comandos bash) era pública:
 * no había STARK_AUTH_TOKEN, CORS estaba en "*" y el túnel de Cloudflare publicaba
 * el puerto 3000 en internet. Ahora TODO requiere token, salvo /login y /api/health.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized, isValidToken, getAuthToken, sessionValueFor, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const PUBLIC_PATHS = new Set(["/login", "/api/health", "/api/auth"]);

function allowedOrigins(): string[] {
  // "null" = la APK Android (WebView cargando file:///android_asset/hud.html)
  const extra = (process.env.JARVIS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ["null", ...extra];
}

function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get("origin");
  if (origin && allowedOrigins().includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-TARS-Token, X-Zarate-Node");
  }
  return res;
}

// Redirección con el host público real (Caddy/Cloudflare envían X-Forwarded-*),
// no con "localhost", que es lo que Next pondría por defecto.
function publicBase(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

function relativeRedirect(req: NextRequest, location: string, status = 307): NextResponse {
  return NextResponse.redirect(new URL(location, publicBase(req)), status);
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (req.method === "OPTIONS") {
    return withCors(req, new NextResponse(null, { status: 204 }));
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return withCors(req, NextResponse.next());
  }

  if (!getAuthToken()) {
    const msg = "STARK_AUTH_TOKEN no está configurado. TARS está bloqueado por seguridad.";
    return isApi
      ? NextResponse.json({ success: false, error: msg }, { status: 503 })
      : new NextResponse(msg, { status: 503 });
  }

  // Primer acceso con ?token=XXX en una página → cambiarlo por cookie y limpiar la URL
  const qToken = searchParams.get("token");
  if (!isApi && qToken && isValidToken(qToken)) {
    const params = new URLSearchParams(searchParams);
    params.delete("token");
    const qs = params.toString();
    const res = relativeRedirect(req, pathname + (qs ? `?${qs}` : ""));
    res.cookies.set(SESSION_COOKIE, sessionValueFor(getAuthToken()), {
      httpOnly: true,
      sameSite: "strict",
      secure: req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return res;
  }

  if (isAuthorized(req)) {
    return withCors(req, NextResponse.next());
  }

  if (isApi) {
    return withCors(req, NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }));
  }
  return relativeRedirect(req, `/login?next=${encodeURIComponent(pathname)}`);
}

import { NextResponse } from "next/server";
import { isValidToken, getAuthToken, sessionValueFor, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

// Freno simple contra fuerza bruta (por proceso)
const attempts = new Map<string, { n: number; until: number }>();

function clientKey(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "local"
  );
}

export async function POST(req: Request) {
  const key = clientKey(req);
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now) {
    return NextResponse.json({ success: false, error: "Demasiados intentos. Espera un minuto." }, { status: 429 });
  }

  let token = "";
  let next = "/";
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    token = String(body.token || "");
    next = String(body.next || "/");
  } else {
    const form = await req.formData().catch(() => null);
    token = String(form?.get("token") || "");
    next = String(form?.get("next") || "/");
  }
  if (!next.startsWith("/") || next.startsWith("//")) next = "/";

  if (!isValidToken(token)) {
    const n = (a?.n || 0) + 1;
    attempts.set(key, { n, until: n >= 5 ? now + 60_000 : 0 });
    if (ct.includes("application/json")) {
      return NextResponse.json({ success: false, error: "Token inválido" }, { status: 401 });
    }
    return new NextResponse(null, { status: 303, headers: { Location: `/login?error=1&next=${encodeURIComponent(next)}` } });
  }
  attempts.delete(key);

  const res = ct.includes("application/json")
    ? NextResponse.json({ success: true })
    : new NextResponse(null, { status: 303, headers: { Location: next } });
  res.cookies.set(SESSION_COOKIE, sessionValueFor(getAuthToken()), {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

import { NextResponse } from "next/server";

// Público: solo para healthchecks de Docker / monitor. No expone datos.
export async function GET() {
  return NextResponse.json({ ok: true, mode: process.env.JARVIS_MODE || "local" });
}

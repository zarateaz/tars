import { NextResponse } from "next/server";
import {
  loadMemoryStore,
  addLearnedMemory,
  removeLearnedMemory,
} from "@/lib/memory";

export async function GET() {
  const store = loadMemoryStore();
  return NextResponse.json(store);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "add" && body.fact) {
      const mem = addLearnedMemory(String(body.fact), body.category || "preferencia");
      return NextResponse.json({ success: true, memory: mem, store: loadMemoryStore() });
    }
    if (body.action === "delete" && body.id) {
      removeLearnedMemory(String(body.id));
      return NextResponse.json({ success: true, store: loadMemoryStore() });
    }
    return NextResponse.json({ success: false, message: "Acción no válida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}

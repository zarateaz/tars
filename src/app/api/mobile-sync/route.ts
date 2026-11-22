import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { getSystemStats } from "@/lib/system";
import { loadMemoryStore, saveMemoryStore, LearnedMemory } from "@/lib/memory";
import {
  storeReminders,
  drainPhoneCommands,
  evaluateAutonomousPhoneTriggers,
  isProximityGuardianEnabled,
  setProximityGuardian,
} from "@/lib/phoneLink";
import { recordIncomingNotification, getWelcomeState } from "@/lib/concierge";
import { parseFinancialNotification } from "@/lib/financialSentinel";
import { verifyStarkAuth } from "@/lib/config";

const PHONE_TELEMETRY_FILE = path.join(process.cwd(), "phone_telemetry.json");

export interface PhoneTelemetry {
  device: string;
  battery: number;
  charging: boolean;
  tempC: number;
  ramFreeMb: number;
  ramTotalMb: number;
  torchOn: boolean;
  volumePct: number;
  lastSync: string;
}

function loadPhoneTelemetry(): PhoneTelemetry | null {
  try {
    if (fs.existsSync(PHONE_TELEMETRY_FILE)) {
      return JSON.parse(fs.readFileSync(PHONE_TELEMETRY_FILE, "utf-8"));
    }
  } catch {
    // ignore
  }
  return null;
}

function savePhoneTelemetry(data: PhoneTelemetry): void {
  try {
    fs.writeFileSync(PHONE_TELEMETRY_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

function getGlobalEndpoints(): { lanUrl: string; tailscaleUrl: string; cloudTunnelUrl: string } {
  let lanUrl = "http://192.168.1.35:3000";
  let tailscaleUrl = "";
  let cloudTunnelUrl = "";

  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const info of ifaces[name] || []) {
        if (info.family === "IPv4" && !info.internal) {
          if (info.address.startsWith("100.") && !tailscaleUrl) {
            tailscaleUrl = `http://${info.address}:3000`;
          } else if (info.address.startsWith("192.168.")) {
            lanUrl = `http://${info.address}:3000`;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync("/tmp/jearvis_tunnel.log")) {
      const log = fs.readFileSync("/tmp/jearvis_tunnel.log", "utf-8");
      const matches = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
      if (matches && matches.length > 0) {
        cloudTunnelUrl = matches[matches.length - 1];
      }
    }
  } catch {
    // ignore
  }

  return { lanUrl, tailscaleUrl, cloudTunnelUrl };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Zarate-Node",
    },
  });
}

export async function GET(req: Request) {
  if (!verifyStarkAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized: Invalid TARS Auth Token" }, { status: 401 });
  }
  try {
    const [laptopStats, memoryStore] = await Promise.all([
      getSystemStats(),
      Promise.resolve(loadMemoryStore()),
    ]);
    return NextResponse.json({
      success: true,
      node: "ZARATE-LAPTOP-CORE",
      serverTime: new Date().toISOString(),
      laptopStats,
      memoryStore,
      phoneTelemetry: loadPhoneTelemetry(),
      proximityGuardian: isProximityGuardianEnabled(),
      globalEndpoints: getGlobalEndpoints(),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!verifyStarkAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized: Invalid TARS Auth Token" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const store = loadMemoryStore();
    let changed = false;

    // 1. Save incoming Tecno Spark 30 live telemetry & evaluate proactive triggers
    if (body.phoneTelemetry && typeof body.phoneTelemetry === "object") {
      const prevTel = loadPhoneTelemetry();
      const newTel: PhoneTelemetry = {
        device: body.phoneTelemetry.device || "TECNO Spark 30 (KL6)",
        battery: Number(body.phoneTelemetry.battery ?? 100),
        charging: Boolean(body.phoneTelemetry.charging),
        tempC: Number(body.phoneTelemetry.tempC ?? 32),
        ramFreeMb: Number(body.phoneTelemetry.ramFreeMb ?? 4800),
        ramTotalMb: Number(body.phoneTelemetry.ramTotalMb ?? 8192),
        torchOn: Boolean(body.phoneTelemetry.torchOn),
        volumePct: Number(body.phoneTelemetry.volumePct ?? 70),
        lastSync: new Date().toISOString(),
      };
      savePhoneTelemetry(newTel);
      evaluateAutonomousPhoneTriggers(prevTel, newTel);
    }

    // 2. Merge new memories from mobile APK
    if (Array.isArray(body.memories)) {
      const existingFacts = new Set(store.memories.map((m) => m.fact.toLowerCase().trim()));
      for (const m of body.memories as LearnedMemory[]) {
        if (m && m.fact && !existingFacts.has(m.fact.toLowerCase().trim())) {
          store.memories.push({
            id: m.id || `mob-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fact: String(m.fact),
            category: m.category || "preferencia",
            createdAt: m.createdAt || new Date().toISOString(),
          });
          existingFacts.add(m.fact.toLowerCase().trim());
          changed = true;
        }
      }
    }

    // 3. Merge conversation history entries from mobile offline interactions
    if (Array.isArray(body.conversationHistory)) {
      const existingTs = new Set(store.conversationHistory.map((c) => `${c.role}:${c.content}`));
      for (const item of body.conversationHistory) {
        if (item && item.content && !existingTs.has(`${item.role}:${item.content}`)) {
          store.conversationHistory.push({
            role: item.role === "user" ? "user" : "assistant",
            content: String(item.content),
            timestamp: item.timestamp || new Date().toISOString(),
          });
          changed = true;
        }
      }
      // Orden cronológico ANTES de recortar: antes los mensajes viejos que el teléfono
      // reenviaba quedaban al final y desplazaban a los más recientes.
      store.conversationHistory.sort(
        (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
      );
      if (store.conversationHistory.length > 60) {
        store.conversationHistory = store.conversationHistory.slice(-60);
      }
    }

    // 4. Sync affinity boost if mobile affinity is higher
    if (body.emotionalState && typeof body.emotionalState.affinity === "number") {
      if (body.emotionalState.affinity > store.emotionalState.affinity) {
        store.emotionalState = {
          ...store.emotionalState,
          ...body.emotionalState,
        };
        changed = true;
      }
    }

    if (changed) {
      saveMemoryStore(store);
    }

    // 5. Mirror phone reminders so the laptop also announces them
    if (Array.isArray(body.reminders)) {
      storeReminders(body.reminders);
    }

    // 6. Relay incoming phone notification to inbox and Sentinel Financiero
    if (body.incomingNotification && typeof body.incomingNotification === "object") {
      const n = body.incomingNotification;
      const appName = String(n.app || "Móvil");
      const sender = String(n.sender || "");
      const notifText = String(n.text || "");
      recordIncomingNotification(appName, sender, notifText);
      parseFinancialNotification(appName, sender, notifText);
    }

    if (typeof body.proximityGuardian === "boolean") {
      setProximityGuardian(body.proximityGuardian);
    }

    const laptopStats = await getSystemStats();
    return NextResponse.json({
      success: true,
      node: "ZARATE-LAPTOP-CORE",
      serverTime: new Date().toISOString(),
      laptopStats,
      memoryStore: store,
      phoneTelemetry: loadPhoneTelemetry(),
      proximityGuardian: isProximityGuardianEnabled(),
      pendingPhoneCommands: drainPhoneCommands(),
      globalEndpoints: getGlobalEndpoints(),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

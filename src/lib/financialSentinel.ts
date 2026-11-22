import fs from "fs";
import path from "path";

export interface TransactionRecord {
  id: string;
  sourceApp: "yape" | "bcp" | "interbank" | "bbva" | "plin" | "otro";
  type: "ingreso" | "egreso" | "informativo";
  amount: number;
  currency: "PEN" | "USD";
  party: string;
  note: string;
  rawText: string;
  timestamp: string;
}

export interface FinancialLedger {
  transactions: TransactionRecord[];
  dailyBudgetLimit?: number;
  lastUpdated: string;
}

const LEDGER_FILE = path.join(process.cwd(), "financial_ledger.json");

export function loadFinancialLedger(): FinancialLedger {
  try {
    if (!fs.existsSync(LEDGER_FILE)) {
      const initLedger: FinancialLedger = {
        transactions: [],
        lastUpdated: new Date().toISOString(),
      };
      fs.writeFileSync(LEDGER_FILE, JSON.stringify(initLedger, null, 2), "utf-8");
      return initLedger;
    }
    const raw = fs.readFileSync(LEDGER_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      dailyBudgetLimit: parsed.dailyBudgetLimit,
      lastUpdated: parsed.lastUpdated || new Date().toISOString(),
    };
  } catch {
    return { transactions: [], lastUpdated: new Date().toISOString() };
  }
}

export function saveFinancialLedger(ledger: FinancialLedger): void {
  try {
    ledger.lastUpdated = new Date().toISOString();
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), "utf-8");
  } catch (err) {
    console.error("Error guardando financial_ledger.json:", err);
  }
}

export function parseFinancialNotification(packageName: string, title: string, text: string): TransactionRecord | null {
  const combined = `${title || ""} ${text || ""}`.trim();
  const lower = combined.toLowerCase();
  const pkgLower = (packageName || "").toLowerCase();

  let sourceApp: TransactionRecord["sourceApp"] = "otro";
  if (pkgLower.includes("yape")) sourceApp = "yape";
  else if (pkgLower.includes("bcp")) sourceApp = "bcp";
  else if (pkgLower.includes("interbank") || lower.includes("plin")) sourceApp = "interbank";
  else if (pkgLower.includes("bbva")) sourceApp = "bbva";
  else if (lower.includes("yape")) sourceApp = "yape";
  else if (lower.includes("plin")) sourceApp = "plin";

  // Match currency and amount e.g. S/ 50.00, S/50, S/. 15.50, $ 20.00
  const amountMatch = combined.match(/(?:S\/?\.?|\$)\s*([0-9]+(?:[.,][0-9]{1,2})?)/i);
  if (!amountMatch) return null;

  const rawNum = amountMatch[1].replace(",", ".");
  const amount = parseFloat(rawNum);
  if (isNaN(amount) || amount <= 0) return null;

  const isUsd = combined.includes("$");
  const currency: "PEN" | "USD" = isUsd ? "USD" : "PEN";

  let type: TransactionRecord["type"] = "ingreso";
  let party = "Contacto desconocido";

  // Detection logic for Peruvian Yape / BCP / Plin notifications
  if (/\b(?:te envi[oó]|te yape[oó]|recibiste|abono|ingreso|te transfiri[oó])\b/i.test(lower)) {
    type = "ingreso";
    const partyMatch = combined.match(/(?:te envi[oó]|te yape[oó]|de|abono de)\s+([A-Za-zÁÉÍÓÚñÑ\s]+?)(?: por|\.|$)/i);
    if (partyMatch && partyMatch[1]) party = partyMatch[1].trim();
  } else if (/\b(?:pagaste|yapeaste|enviaste|cargo|compra|transferiste)\b/i.test(lower)) {
    type = "egreso";
    const partyMatch = combined.match(/(?:pagaste a|yapeaste a|a|en)\s+([A-Za-zÁÉÍÓÚñÑ\s]+?)(?: por|\.|$)/i);
    if (partyMatch && partyMatch[1]) party = partyMatch[1].trim();
  }

  const record: TransactionRecord = {
    id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sourceApp,
    type,
    amount,
    currency,
    party,
    note: combined,
    rawText: combined,
    timestamp: new Date().toISOString(),
  };

  const ledger = loadFinancialLedger();
  ledger.transactions.unshift(record);
  if (ledger.transactions.length > 500) ledger.transactions = ledger.transactions.slice(0, 500);
  saveFinancialLedger(ledger);

  return record;
}

export function getFinancialSummary(): {
  incomeToday: number;
  expenseToday: number;
  recentTransactions: TransactionRecord[];
  summaryText: string;
} {
  const ledger = loadFinancialLedger();
  const todayStr = new Date().toISOString().slice(0, 10);

  let incomeToday = 0;
  let expenseToday = 0;

  for (const tx of ledger.transactions) {
    if (tx.timestamp.startsWith(todayStr)) {
      if (tx.type === "ingreso") incomeToday += tx.amount;
      else if (tx.type === "egreso") expenseToday += tx.amount;
    }
  }

  const recent = ledger.transactions.slice(0, 5);
  const summaryText = `Hoy has recibido S/ ${incomeToday.toFixed(2)} y has realizado pagos por S/ ${expenseToday.toFixed(2)}. ${
    recent.length > 0 ? `Última transacción: ${recent[0].type.toUpperCase()} de S/ ${recent[0].amount.toFixed(2)} (${recent[0].party}).` : "Sin transacciones recientes registradas."
  }`;

  return {
    incomeToday,
    expenseToday,
    recentTransactions: recent,
    summaryText,
  };
}

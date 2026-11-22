"use client";

import React, { useState } from "react";
import { Cpu, HardDrive, X, RefreshCw, AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { playUiSound } from "@/lib/soundFx";

interface ProcessItem {
  pid: string;
  name: string;
  cpu: string;
  mem: string;
}

interface TaskManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  processes: ProcessItem[];
  onRefresh: () => void;
}

export default function TaskManagerModal({
  isOpen,
  onClose,
  processes,
  onRefresh,
}: TaskManagerModalProps) {
  const [filter, setFilter] = useState("");
  const [killingPid, setKillingPid] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const filtered = processes.filter(
    (p) =>
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.pid.includes(filter)
  );

  const handleKill = async (pid: string, name: string) => {
    if (!confirm(`¿Estás seguro de finalizar forzosamente el proceso "${name}" (PID: ${pid})?`)) {
      return;
    }
    setKillingPid(pid);
    playUiSound("alert");
    try {
      const res = await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "kill_process", target: pid, speak: false }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(`Proceso ${name} (PID ${pid}) terminado con éxito.`);
        playUiSound("success");
        onRefresh();
      } else {
        setFeedback(`Error: ${data.message}`);
      }
    } catch (err) {
      setFeedback(`Error al conectar: ${String(err)}`);
    } finally {
      setKillingPid(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-sky-400" />
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Administrador de Tareas Linux
              </h3>
              <p className="text-[11px] text-slate-400">
                Monitoreo de procesos en tiempo real y terminación de subprocesos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onRefresh();
                playUiSound("click");
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title="Actualizar lista de procesos"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className="px-4 py-2 bg-sky-500/10 border-b border-sky-500/30 flex items-center gap-2 text-xs text-sky-300">
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Search Bar */}
        <div className="p-3 border-b border-slate-800 bg-slate-950/30">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por nombre o PID (ej: 'chrome', 'python', 'node')..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
          />
        </div>

        {/* Process Table */}
        <div className="flex-1 overflow-y-auto p-3">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800 uppercase text-[10px] tracking-wider">
                <th className="pb-2 px-2">PID</th>
                <th className="pb-2 px-2">Nombre del Proceso</th>
                <th className="pb-2 px-2 text-right">CPU %</th>
                <th className="pb-2 px-2 text-right">RAM %</th>
                <th className="pb-2 px-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.length > 0 ? (
                filtered.map((proc) => {
                  const cpuNum = parseFloat(proc.cpu) || 0;
                  const memNum = parseFloat(proc.mem) || 0;
                  return (
                    <tr
                      key={proc.pid}
                      className="hover:bg-slate-800/40 text-slate-300 transition"
                    >
                      <td className="py-2.5 px-2 text-slate-400 font-semibold">{proc.pid}</td>
                      <td className="py-2.5 px-2 font-medium text-white truncate max-w-[200px]">
                        {proc.name}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            cpuNum > 20
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : "text-sky-300"
                          }`}
                        >
                          {proc.cpu}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            memNum > 15
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "text-slate-400"
                          }`}
                        >
                          {proc.mem}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <button
                          onClick={() => handleKill(proc.pid, proc.name)}
                          disabled={killingPid === proc.pid}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{killingPid === proc.pid ? "Matando..." : "Finalizar"}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">
                    No se encontraron procesos activos coincidentes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span>Total mostrados: {filtered.length} procesos principales</span>
          <span className="text-slate-400">Garuda Linux / hyprland kernel</span>
        </div>
      </div>
    </div>
  );
}

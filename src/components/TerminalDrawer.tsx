"use client";

import React, { useState, useEffect, useRef } from "react";
import { Terminal, X, Copy, Trash2, Play, Check } from "lucide-react";
import { playUiSound } from "@/lib/soundFx";

export interface TerminalEntry {
  id: string;
  command: string;
  output: string;
  timestamp: string;
  success?: boolean;
}

interface TerminalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entries: TerminalEntry[];
  onExecuteCommand: (cmd: string) => Promise<{ success: boolean; output: string }>;
  onClear: () => void;
}

export default function TerminalDrawer({
  isOpen,
  onClose,
  entries,
  onExecuteCommand,
  onClear,
}: TerminalDrawerProps) {
  const [inputCmd, setInputCmd] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 100);
    }
  }, [isOpen, entries]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputCmd.trim();
    if (!clean || isRunning) return;

    setIsRunning(true);
    playUiSound("click");
    setInputCmd("");
    try {
      await onExecuteCommand(clean);
      playUiSound("success");
    } catch {
      playUiSound("alert");
    } finally {
      setIsRunning(false);
    }
  };

  const copyOutput = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    playUiSound("click");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-slate-950/95 border border-sky-500/30 shadow-2xl overflow-hidden flex flex-col h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Terminal Title Bar */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 mr-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <Terminal className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-mono font-semibold text-slate-300">
              zarate@jarvis-core: ~ (Terminal en Vivo)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClear();
                playUiSound("click");
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              title="Limpiar pantalla"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Terminal Logs View */}
        <div
          ref={scrollRef}
          className="flex-1 p-4 overflow-y-auto space-y-4 font-mono text-xs select-text"
        >
          {entries.length === 0 ? (
            <div className="text-slate-500 text-center py-12">
              <p>=== Terminal de Control de TARS Inicializada ===</p>
              <p className="mt-1 text-[11px]">Escribe cualquier comando Bash abajo para ejecutarlo directamente en tu sistema.</p>
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="space-y-1.5 group">
                <div className="flex items-center justify-between text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">zarate@jarvis:~$</span>
                    <span className="text-white font-semibold">{entry.command}</span>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                    <span className="text-[10px] text-slate-500">{entry.timestamp}</span>
                    <button
                      onClick={() => copyOutput(entry.id, entry.output)}
                      className="text-slate-400 hover:text-sky-300 p-1"
                      title="Copiar salida"
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
                {entry.output && (
                  <pre className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 text-emerald-300 whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {entry.output}
                  </pre>
                )}
              </div>
            ))
          )}
          {isRunning && (
            <div className="flex items-center gap-2 text-sky-400 animate-pulse font-mono text-xs">
              <span>zarate@jarvis:~$ ejecutando...</span>
            </div>
          )}
        </div>

        {/* Terminal Prompt Input Bar */}
        <form
          onSubmit={handleSubmit}
          className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
        >
          <span className="text-emerald-400 font-mono text-xs font-bold pl-2">
            zarate@jarvis:~$
          </span>
          <input
            ref={inputRef}
            type="text"
            value={inputCmd}
            onChange={(e) => setInputCmd(e.target.value)}
            disabled={isRunning}
            placeholder="ls -la, uname -a, df -h, curl wttr.in, ip a..."
            className="flex-1 bg-transparent text-xs font-mono text-white placeholder-slate-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputCmd.trim() || isRunning}
            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Ejecutar</span>
          </button>
        </form>
      </div>
    </div>
  );
}

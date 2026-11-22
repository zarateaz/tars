"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Terminal,
  Globe,
  FolderOpen,
  Code2,
  Music,
  Camera,
  Cpu,
  Shield,
  Laptop,
  Volume2,
  VolumeX,
  Trash2,
  Sparkles,
  X,
  CornerDownLeft,
} from "lucide-react";
import { playUiSound } from "@/lib/soundFx";

export interface PaletteItem {
  id: string;
  category: "apps" | "modes" | "system" | "commands";
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSendCommand: (command: string) => void;
  onSetPersonaMode: (mode: "general" | "tactical" | "developer") => void;
  currentMode: "general" | "tactical" | "developer";
  onOpenTaskManager: () => void;
  onClearChat: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onSendCommand,
  onSetPersonaMode,
  currentMode,
  onOpenTaskManager,
  onClearChat,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      playUiSound("whoosh");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const items: PaletteItem[] = [
    // Applications
    {
      id: "app-browser",
      category: "apps",
      title: "Abrir Navegador Chrome",
      subtitle: "Inicia Google Chrome o navega a una URL",
      icon: Globe,
      action: () => {
        onSendCommand("Abre Google Chrome");
        onClose();
      },
    },
    {
      id: "app-terminal",
      category: "apps",
      title: "Abrir Terminal Alacritty / Kitty",
      subtitle: "Abre una ventana de terminal interactiva",
      icon: Terminal,
      action: () => {
        onSendCommand("Abre la terminal");
        onClose();
      },
    },
    {
      id: "app-code",
      category: "apps",
      title: "Abrir Editor de Código",
      subtitle: "Abre VS Code o Kate en tu espacio de trabajo",
      icon: Code2,
      action: () => {
        onSendCommand("Abre el editor");
        onClose();
      },
    },
    {
      id: "app-files",
      category: "apps",
      title: "Explorador de Archivos",
      subtitle: "Abre Dolphin o Thunar en tu carpeta personal",
      icon: FolderOpen,
      action: () => {
        onSendCommand("Abre el explorador de archivos");
        onClose();
      },
    },
    {
      id: "app-spotify",
      category: "apps",
      title: "Abrir Spotify",
      subtitle: "Inicia el reproductor de música Spotify",
      icon: Music,
      action: () => {
        onSendCommand("Abre Spotify");
        onClose();
      },
    },
    {
      id: "app-screenshot",
      category: "apps",
      title: "Tomar Captura de Pantalla",
      subtitle: "Captura pantalla completa o ventana activa",
      icon: Camera,
      action: () => {
        onSendCommand("Toma una captura de pantalla");
        onClose();
      },
    },

    // Modes
    {
      id: "mode-general",
      category: "modes",
      title: "Activar Modo Asistente General",
      subtitle: `Equilibrado, creativo con humor inteligente al 40% ${currentMode === "general" ? "(Activo)" : ""}`,
      icon: Sparkles,
      action: () => {
        onSetPersonaMode("general");
        playUiSound("success");
        onClose();
      },
    },
    {
      id: "mode-tactical",
      category: "modes",
      title: "Activar Modo Táctico / SecOps",
      subtitle: `Comandos concisos, pentesting, red y auditoría directa ${currentMode === "tactical" ? "(Activo)" : ""}`,
      icon: Shield,
      action: () => {
        onSetPersonaMode("tactical");
        playUiSound("success");
        onClose();
      },
    },
    {
      id: "mode-dev",
      category: "modes",
      title: "Activar Modo Desarrollador",
      subtitle: `Ingeniería de software, refactor, git y scripts directos ${currentMode === "developer" ? "(Activo)" : ""}`,
      icon: Laptop,
      action: () => {
        onSetPersonaMode("developer");
        playUiSound("success");
        onClose();
      },
    },

    // System
    {
      id: "sys-task-manager",
      category: "system",
      title: "Administrador de Procesos (Task Manager)",
      subtitle: "Inspecciona el consumo de CPU/RAM y finaliza tareas",
      icon: Cpu,
      action: () => {
        onClose();
        onOpenTaskManager();
      },
    },
    {
      id: "sys-mute",
      category: "system",
      title: "Alternar Silencio (Mute/Unmute)",
      subtitle: "Silencia o reactiva el audio maestro del sistema",
      icon: VolumeX,
      action: () => {
        fetch("/api/system", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "toggle_mute", speak: false }),
        });
        playUiSound("click");
        onClose();
      },
    },
    {
      id: "sys-clear-chat",
      category: "system",
      title: "Limpiar Historial de Conversación",
      subtitle: "Borra los mensajes de la vista actual del dashboard",
      icon: Trash2,
      action: () => {
        onClearChat();
        playUiSound("click");
        onClose();
      },
    },
  ];

  const filtered = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0 && selectedIndex < filtered.length) {
        filtered[selectedIndex].action();
      } else if (query.trim()) {
        // Run query as freeform instruction or CLI
        onSendCommand(query.trim());
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-slate-900/95 border border-sky-500/30 shadow-2xl shadow-sky-500/10 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-950/40">
          <Search className="w-5 h-5 text-sky-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Escribe un comando, busca una app o instrucción (ej: 'Abre Spotify', '$ ls -la')..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 rounded-md text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400 border border-slate-700">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-[360px] overflow-y-auto p-2 space-y-1">
          {filtered.length > 0 ? (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition cursor-pointer ${
                    isSelected
                      ? "bg-sky-500/20 border border-sky-500/40 text-white"
                      : "hover:bg-slate-800/60 text-slate-300 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        isSelected ? "bg-sky-500 text-slate-950" : "bg-slate-800 text-sky-400"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{item.subtitle}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <CornerDownLeft className="w-3.5 h-3.5 text-sky-400 shrink-0 ml-2" />
                  )}
                </button>
              );
            })
          ) : query.trim() ? (
            <button
              onClick={() => {
                onSendCommand(query.trim());
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl bg-sky-500/20 border border-sky-500/40 text-left text-white cursor-pointer"
            >
              <Terminal className="w-4 h-4 text-sky-400 shrink-0" />
              <div className="truncate">
                <p className="text-xs font-semibold text-sky-300">
                  Enviar instrucción a TARS: &ldquo;{query}&rdquo;
                </p>
                <p className="text-[11px] text-slate-400">
                  Presiona Enter para procesar esta orden inmediatamente
                </p>
              </div>
            </button>
          ) : (
            <p className="text-center py-6 text-xs text-slate-500">
              No hay acciones coincidentes.
            </p>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>↑↓ para navegar</span>
            <span>↵ para ejecutar</span>
          </div>
          <span>Modo activo: <strong className="text-sky-400 uppercase">{currentMode}</strong></span>
        </div>
      </div>
    </div>
  );
}

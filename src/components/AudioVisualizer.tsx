"use client";

import React, { useEffect, useRef } from "react";
import { OrbState } from "./NeuralOrb";

interface AudioVisualizerProps {
  state: OrbState;
  audioElement: HTMLAudioElement | null;
}

export default function AudioVisualizer({ state }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<OrbState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let tick = 0;
    const numBars = 32;
    const barPeaks = new Array(numBars).fill(0);

    const render = () => {
      tick += 0.05;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const currentState = stateRef.current;
      const barWidth = (w - (numBars - 1) * 3) / numBars;

      // Extract frequency values depending on current assistant state
      const values: number[] = [];

      if (currentState === "LISTENING") {
        for (let i = 0; i < numBars; i++) {
          const wave = Math.sin(tick * 5 + i * 0.4) * 0.35 + 0.45;
          const jitter = Math.sin(tick * 8 + i * 1.2) * 0.15;
          values.push(Math.max(0.1, Math.min(1, wave + jitter)));
        }
      } else if (currentState === "SPEAKING") {
        for (let i = 0; i < numBars; i++) {
          // Dynamic simulated voice harmonics with formant peaks
          const envelope = Math.sin((i / numBars) * Math.PI);
          const noise = Math.sin(tick * 3 + i * 0.7) * 0.3 + 0.7;
          values.push(envelope * noise * 0.85);
        }
      } else if (currentState === "PROCESSING") {
        for (let i = 0; i < numBars; i++) {
          const scan = Math.sin(tick * 4 + (i / numBars) * Math.PI * 4);
          values.push(Math.max(0.1, (scan + 1) * 0.35));
        }
      } else {
        // IDLE: gentle rhythmic ambient cyber wave
        for (let i = 0; i < numBars; i++) {
          const pulse = Math.sin(tick * 1.5 + i * 0.25) * 0.15 + 0.18;
          values.push(pulse);
        }
      }

      // Draw frequency spectrum bars with glowing peaks
      for (let i = 0; i < numBars; i++) {
        const val = values[i];
        const barHeight = Math.max(4, val * (h - 8));
        const x = i * (barWidth + 3);
        const y = h - barHeight;

        // Peak hold decay
        if (barHeight > barPeaks[i]) {
          barPeaks[i] = barHeight;
        } else {
          barPeaks[i] = Math.max(0, barPeaks[i] - 0.8);
        }

        // Color gradients according to state
        const grad = ctx.createLinearGradient(0, y, 0, h);
        if (currentState === "LISTENING") {
          grad.addColorStop(0, "#38bdf8"); // Sky
          grad.addColorStop(0.5, "#06b6d4"); // Cyan
          grad.addColorStop(1, "rgba(6, 182, 212, 0.1)");
        } else if (currentState === "SPEAKING") {
          grad.addColorStop(0, "#00f0ff"); // Cyberpunk Neon Cyan
          grad.addColorStop(0.5, "#0284c7"); // Electric Blue
          grad.addColorStop(1, "rgba(0, 240, 255, 0.1)");
        } else if (currentState === "PROCESSING") {
          grad.addColorStop(0, "#38bdf8"); // Sky
          grad.addColorStop(0.5, "#6366f1"); // Indigo
          grad.addColorStop(1, "rgba(99, 102, 241, 0.1)");
        } else {
          grad.addColorStop(0, "#0284c7"); // Slate / Subtle Blue
          grad.addColorStop(0.5, "#0369a1");
          grad.addColorStop(1, "rgba(2, 132, 199, 0.05)");
        }

        ctx.fillStyle = grad;

        // Rounded bar top
        ctx.beginPath();
        const r = 2;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barWidth - r, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
        ctx.lineTo(x + barWidth, h);
        ctx.lineTo(x, h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();

        // Draw Peak Dot
        ctx.fillStyle = currentState === "SPEAKING" ? "#ffffff" : "#38bdf8";
        const peakY = Math.max(2, h - barPeaks[i] - 3);
        ctx.fillRect(x, peakY, barWidth, 2);
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="relative w-full flex flex-col items-center justify-center py-1">
      {/* Visualizer canvas */}
      <canvas
        ref={canvasRef}
        width={340}
        height={48}
        className="w-full max-w-[320px] sm:max-w-[360px] h-9 sm:h-11"
      />

      {/* Cyberpunk Frequency Scan Baseline Indicator */}
      <div className="w-full max-w-[320px] sm:max-w-[360px] flex items-center justify-between text-[9px] font-mono text-cyan-500/60 uppercase tracking-widest px-1 pt-0.5 border-t border-cyan-500/20">
        <span>20Hz</span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
          <span>NEURAL HARMONICS</span>
        </span>
        <span>20kHz</span>
      </div>
    </div>
  );
}

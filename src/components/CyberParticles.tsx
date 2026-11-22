"use client";

import React, { useEffect, useRef } from "react";
import { OrbState } from "./NeuralOrb";

interface CyberParticlesProps {
  state?: OrbState;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  alpha: number;
  pulseSpeed: number;
  pulsePhase: number;
  color: string;
}

export default function CyberParticles({ state = "IDLE" }: CyberParticlesProps) {
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
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Cyan / Electric Blue cyber particle palette
    const colors = [
      "#00f0ff", // pure neon cyan
      "#38bdf8", // laser sky blue
      "#0284c7", // electric azure
      "#60a5fa", // soft cyber blue
      "#06b6d4", // deep cyan
    ];

    // Generate floating particles (optimized for smooth 60 FPS)
    const particleCount = Math.min(36, Math.floor((width * height) / 38000));
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        size: Math.random() * 2.2 + 0.8,
        baseAlpha: Math.random() * 0.5 + 0.25,
        alpha: Math.random() * 0.5 + 0.25,
        pulseSpeed: Math.random() * 0.03 + 0.01,
        pulsePhase: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let time = 0;

    const render = () => {
      time += 0.02;
      ctx.clearRect(0, 0, width, height);

      const currentState = stateRef.current;
      const speedMultiplier =
        currentState === "SPEAKING" ? 1.9 : currentState === "LISTENING" ? 1.5 : 1.0;
      const connectionDist = currentState === "SPEAKING" ? 115 : 95;

      // Update & Draw Particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.x += p.vx * speedMultiplier;
        p.y += p.vy * speedMultiplier;

        // Wrap edges smoothly
        if (p.x < -10) p.x = width + 10;
        else if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        else if (p.y > height + 10) p.y = -10;

        // Pulsing alpha
        const pulse = Math.sin(time * p.pulseSpeed * 60 + p.pulsePhase);
        p.alpha = Math.max(0.1, Math.min(0.9, p.baseAlpha + pulse * 0.25));

        // Draw particle dot with crisp cyber glow (no expensive per-dot shadowBlur)
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();

        // Connect nearby particles with bounding-box fast rejection
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          if (dx > connectionDist || dx < -connectionDist) continue;
          const dy = p.y - p2.y;
          if (dy > connectionDist || dy < -connectionDist) continue;
          const dist = Math.hypot(dx, dy);

          if (dist < connectionDist) {
            const lineAlpha = (1 - dist / connectionDist) * 0.22 * Math.min(p.alpha, p2.alpha);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = lineAlpha;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1.0;

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 w-full h-full"
    />
  );
}

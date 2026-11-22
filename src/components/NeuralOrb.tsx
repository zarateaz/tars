"use client";

import React, { useEffect, useRef } from "react";

export type OrbState = "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING";

interface NeuralOrbProps {
  state: OrbState;
  audioElement: HTMLAudioElement | null;
  onClick?: () => void;
}

interface Shockwave {
  r: number;
  maxR: number;
  opacity: number;
  speed: number;
  lineWidth: number;
  color: string;
}

export default function NeuralOrb({ state, audioElement, onClick }: NeuralOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Live mic analyser for LISTENING state
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const stateRef = useRef<OrbState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Connect to audio element when SPEAKING (Note: Mic capture is handled exclusively by audio_daemon.py to avoid ALSA/PipeWire contention)
  useEffect(() => {
    if (!audioElement) return;
    const handlePlay = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      if (analyserRef.current) return;
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaElementSource(audioElement);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      } catch {
        // already connected
      }
    };
    audioElement.addEventListener("play", handlePlay);
    return () => audioElement.removeEventListener("play", handlePlay);
  }, [audioElement]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;
    let smoothedEnergy = 0;
    let lastWaveSpawn = 0;

    const shockwaves: Shockwave[] = [];

    // 3D Fibonacci Quantum Particles (Enhanced Neural Core)
    const numPoints = 260;
    const points: Array<{ x: number; y: number; z: number }> = [];
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    for (let i = 0; i < numPoints; i++) {
      const theta = (2 * Math.PI * i) / goldenRatio;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / numPoints);
      points.push({
        x: Math.cos(theta) * Math.sin(phi),
        y: Math.sin(theta) * Math.sin(phi),
        z: Math.cos(phi),
      });
    }

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      const currentState = stateRef.current;

      // Extract real audio energy
      let targetEnergy = 0;
      if (currentState === "SPEAKING") {
        if (analyserRef.current && dataArrayRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
          let sum = 0;
          const bins = Math.min(48, dataArrayRef.current.length);
          for (let i = 2; i < bins; i++) sum += dataArrayRef.current[i];
          targetEnergy = sum / Math.max(1, bins - 2) / 255;
        } else {
          targetEnergy = (Math.sin(time * 9) * 0.5 + 0.5) * 0.7;
        }
      } else if (currentState === "LISTENING") {
        if (micAnalyserRef.current && micDataRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          micAnalyserRef.current.getByteFrequencyData(micDataRef.current as any);
          let sum = 0;
          for (let i = 0; i < micDataRef.current.length; i++) sum += micDataRef.current[i];
          targetEnergy = sum / micDataRef.current.length / 255;
        } else {
          targetEnergy = (Math.sin(time * 6) * 0.5 + 0.5) * 0.45;
        }
      } else if (currentState === "PROCESSING") {
        targetEnergy = (Math.sin(time * 12) * 0.5 + 0.5) * 0.6;
      } else {
        targetEnergy = (Math.sin(time * 2) * 0.5 + 0.5) * 0.12;
      }

      smoothedEnergy += (targetEnergy - smoothedEnergy) * 0.25;
      const energy = smoothedEnergy;

      const speed =
        currentState === "PROCESSING"
          ? 0.04
          : currentState === "SPEAKING"
          ? 0.026 + energy * 0.035
          : currentState === "LISTENING"
          ? 0.03 + energy * 0.02
          : 0.012;

      time += speed;

      // Pure Cyberpunk Cyan & Electric Blue Palette
      let primaryColor = "#00f0ff"; // Pure Neon Cyberpunk Cyan
      let secondaryColor = "#38bdf8"; // Electric Sky
      let glowRgba = "rgba(0, 240, 255,";

      if (currentState === "LISTENING") {
        primaryColor = "#00f0ff";
        secondaryColor = "#38bdf8";
        glowRgba = "rgba(0, 240, 255,";
      } else if (currentState === "SPEAKING") {
        primaryColor = "#00f0ff";
        secondaryColor = "#0284c7";
        glowRgba = "rgba(0, 240, 255,";
      } else if (currentState === "PROCESSING") {
        primaryColor = "#38bdf8";
        secondaryColor = "#818cf8";
        glowRgba = "rgba(56, 189, 248,";
      } else {
        primaryColor = "#00f0ff";
        secondaryColor = "#0284c7";
        glowRgba = "rgba(0, 240, 255,";
      }

      // ==========================================
      // 1. EPIC EXPANDING ACOUSTIC SHOCKWAVES
      // ==========================================
      const now = performance.now();
      const waveInterval = currentState === "SPEAKING" ? 130 : currentState === "LISTENING" ? 210 : 550;

      if (now - lastWaveSpawn > waveInterval && (currentState !== "IDLE" || Math.random() < 0.25)) {
        lastWaveSpawn = now;
        shockwaves.push({
          r: 65 + energy * 30,
          maxR: 270 + energy * 45,
          opacity: currentState === "SPEAKING" ? 0.9 : 0.7,
          speed: currentState === "SPEAKING" ? 3.2 + energy * 3.5 : 2.0,
          lineWidth: currentState === "SPEAKING" ? 2.8 : 1.6,
          color: currentState === "SPEAKING" ? (Math.random() > 0.4 ? "#00f0ff" : "#38bdf8") : primaryColor,
        });
      }

      // Draw Shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.r += sw.speed;
        const progress = sw.r / sw.maxR;
        const currentOpacity = sw.opacity * (1 - progress);

        if (progress >= 1 || currentOpacity <= 0.01) {
          shockwaves.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, sw.r, 0, Math.PI * 2);
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = currentOpacity;
        ctx.lineWidth = sw.lineWidth * (1 - progress * 0.4);
        ctx.stroke();

        // Secondary harmonic echo ring
        if (progress < 0.65) {
          ctx.beginPath();
          ctx.arc(cx, cy, sw.r * 0.93, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0, 240, 255, ${currentOpacity * 0.5})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }

      // ==========================================
      // 2. OUTER CYBERPUNK HUD RETICLES & RINGS
      // ==========================================
      ctx.save();

      // Outer Ring 0: Far Technical Boundary with Cardinal Targeting Brackets
      const rOuter0 = 245 + Math.sin(time * 1.5) * 3;
      ctx.strokeStyle = `${glowRgba} 0.25)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([12, 10, 4, 10]);
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 4 Cardinal Cyber Brackets [ ]
      const bracketAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
      bracketAngles.forEach((ang) => {
        const rad = ang + time * 0.15;
        const bx = cx + Math.cos(rad) * rOuter0;
        const by = cy + Math.sin(rad) * rOuter0;

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(rad);
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(0, 0);
        ctx.lineTo(-6, 6);
        ctx.stroke();
        ctx.restore();
      });

      // Outer Ring 1: Technical Segments with Degree Ticks
      const rOuter1 = 215 + Math.sin(time * 2) * 2;
      ctx.strokeStyle = `${glowRgba} 0.45)`;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([8, 6, 2, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter1, time * 0.3, time * 0.3 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ring 1 Orbiting Data Nodes
      const orbitAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
      orbitAngles.forEach((ang) => {
        const rad = ang + time * 0.3;
        const nx = cx + Math.cos(rad) * rOuter1;
        const ny = cy + Math.sin(rad) * rOuter1;
        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.arc(nx, ny, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Outer Ring 2: Counter-Rotating Notched Arc Reactor Ring
      const rOuter2 = 185;
      ctx.strokeStyle = `${glowRgba} 0.65)`;
      ctx.lineWidth = 1.8;
      const numArcs = 6;
      for (let i = 0; i < numArcs; i++) {
        const start = -time * 0.6 + (i * Math.PI * 2) / numArcs;
        const arcLength = ((Math.PI * 2) / numArcs) * 0.55;
        ctx.beginPath();
        ctx.arc(cx, cy, rOuter2, start, start + arcLength);
        ctx.stroke();
      }

      // Outer Ring 2 High-Precision Reticle Ticks
      for (let i = 0; i < 36; i++) {
        const rad = (i * Math.PI * 2) / 36 - time * 0.6;
        const isMajor = i % 6 === 0;
        const len = isMajor ? 9 : 4;
        const x1 = cx + Math.cos(rad) * (rOuter2 - len);
        const y1 = cy + Math.sin(rad) * (rOuter2 - len);
        const x2 = cx + Math.cos(rad) * rOuter2;
        const y2 = cy + Math.sin(rad) * rOuter2;
        ctx.strokeStyle = isMajor ? primaryColor : `${glowRgba} 0.4)`;
        ctx.lineWidth = isMajor ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // ==========================================
      // 3. REAL-TIME OSCILLATING AUDIO WAVEFORM RING
      // ==========================================
      const rWaveBase = 152 + energy * 20;
      ctx.beginPath();
      const wavePoints = 140;
      for (let i = 0; i <= wavePoints; i++) {
        const theta = (i / wavePoints) * Math.PI * 2;
        const waveMod =
          Math.sin(theta * 8 + time * 6) * (5 + energy * 32) +
          Math.cos(theta * 14 - time * 4) * (3 + energy * 16) +
          Math.sin(theta * 24 + time * 8) * (1 + energy * 8);
        const r = rWaveBase + waveMod;
        const px = cx + Math.cos(theta) * r;
        const py = cy + Math.sin(theta) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 2.5 + energy * 2.5;
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 18 + energy * 25;
      ctx.stroke();

      // ==========================================
      // 4. INNER ROTATING POWER REACTOR BLADES
      // ==========================================
      const rInner = 118;
      const numBlades = 4;
      for (let b = 0; b < numBlades; b++) {
        const bladeAngle = time * 1.3 + (b * Math.PI * 2) / numBlades;
        ctx.strokeStyle = `rgba(0, 240, 255, 0.85)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, rInner, bladeAngle, bladeAngle + 0.55);
        ctx.stroke();
      }

      ctx.restore();

      // ==========================================
      // 5. 3D FIBONACCI QUANTUM PARTICLE SPHERE
      // ==========================================
      const rotX = time * 0.75;
      const rotY = time * 0.95;
      const rotZ = time * 0.4;

      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

      const baseSphereRadius = 78 + energy * 30;

      const projectedPoints: Array<{ x: number; y: number; z: number; size: number; alpha: number }> = [];

      points.forEach((p) => {
        // 3D Matrix Rotation
        const y1 = p.y * cosX - p.z * sinX;
        const z1 = p.y * sinX + p.z * cosX;
        const x2 = p.x * cosY + z1 * sinY;
        const z2 = -p.x * sinY + z1 * cosY;
        const x3 = x2 * cosZ - y1 * sinZ;
        const y3 = x2 * sinZ + y1 * cosZ;

        const pulse = 1 + energy * 0.48 + Math.sin(time * 3 + p.z * 4) * 0.08;
        const curR = baseSphereRadius * pulse;

        const screenX = cx + x3 * curR;
        const screenY = cy + y3 * curR;
        const depth = (z2 + 1) / 2; // 0 to 1

        projectedPoints.push({
          x: screenX,
          y: screenY,
          z: z2,
          size: 1.2 + depth * 2.4 + energy * 1.8,
          alpha: 0.2 + depth * 0.8,
        });
      });

      // Sort points back-to-front
      projectedPoints.sort((a, b) => a.z - b.z);

      // Render quantum particles with depth (zero per-particle shadowBlur to keep GPU usage < 5%)
      projectedPoints.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 240, 255, ${p.alpha})`;
        ctx.fill();
      });

      // Micro lightning spark discharges between close particles (Neural Synapses)
      if (projectedPoints.length > 30) {
        ctx.save();
        ctx.strokeStyle = "rgba(165, 243, 252, 0.7)";
        ctx.lineWidth = 1;
        const sparkCount = currentState === "SPEAKING" ? 10 : 6;
        for (let i = 0; i < sparkCount; i++) {
          const idx1 = Math.floor(Math.random() * projectedPoints.length);
          const idx2 = (idx1 + 7) % projectedPoints.length;
          const p1 = projectedPoints[idx1];
          const p2 = projectedPoints[idx2];
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (dist < 48) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo((p1.x + p2.x) / 2 + (Math.random() - 0.5) * 6, (p1.y + p2.y) / 2 + (Math.random() - 0.5) * 6);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // ==========================================
      // 6. SYNAPTIC ENERGY ARCS (CORE TO WAVE RING)
      // ==========================================
      if (currentState !== "IDLE" || Math.random() < 0.3) {
        ctx.save();
        const numArcsSparks = currentState === "SPEAKING" ? 4 : 2;
        ctx.strokeStyle = "rgba(0, 240, 255, 0.5)";
        ctx.lineWidth = 1.2;
        ctx.shadowColor = "#00f0ff";
        ctx.shadowBlur = 10;
        for (let s = 0; s < numArcsSparks; s++) {
          const sparkAngle = Math.random() * Math.PI * 2;
          const r1 = 25;
          const r2 = rWaveBase * 0.9;
          const midR = (r1 + r2) / 2 + (Math.random() - 0.5) * 20;
          const midA = sparkAngle + (Math.random() - 0.5) * 0.4;

          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(sparkAngle) * r1, cy + Math.sin(sparkAngle) * r1);
          ctx.quadraticCurveTo(
            cx + Math.cos(midA) * midR,
            cy + Math.sin(midA) * midR,
            cx + Math.cos(sparkAngle) * r2,
            cy + Math.sin(sparkAngle) * r2
          );
          ctx.stroke();
        }
        ctx.restore();
      }

      // ==========================================
      // 7. CENTRAL HYPER-LUMINOUS ARC REACTOR CORE
      // ==========================================
      const coreR = 38 + energy * 18;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      grad.addColorStop(0, "#ffffff"); // Pure white hot fusion core
      grad.addColorStop(0.35, primaryColor);
      grad.addColorStop(0.7, secondaryColor);
      grad.addColorStop(1, "rgba(2, 132, 199, 0)");

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 40 + energy * 35;
      ctx.fill();

      // Center Iris Ring
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 15 + energy * 6, 0, Math.PI * 2);
      ctx.stroke();

      // Holographic Core HUD Tag
      ctx.font = "9px monospace";
      ctx.fillStyle = "rgba(0, 240, 255, 0.85)";
      ctx.textAlign = "center";
      ctx.fillText(
        currentState === "SPEAKING"
          ? "VOX // ACTIVE"
          : currentState === "LISTENING"
          ? "EAR // LISTENING"
          : currentState === "PROCESSING"
          ? "DSP // COMPUTING"
          : "CORE // ONLINE",
        cx,
        cy + coreR + 25
      );

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center cursor-pointer group select-none transition-transform hover:scale-102"
      title="Haz clic para hablar o interactuar con TARS"
    >
      {/* Background radial plasma aura (pure GPU-friendly radial gradient instead of heavy CSS blur filter) */}
      <div
        className="absolute inset-0 m-auto w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(0,240,255,0.18) 0%, rgba(0,240,255,0.05) 45%, transparent 70%)",
        }}
      />
      <canvas
        ref={canvasRef}
        width={560}
        height={560}
        className="w-[280px] h-[280px] sm:w-[360px] sm:h-[360px] md:w-[420px] md:h-[420px] lg:w-[460px] lg:h-[460px] max-h-[50vh] max-w-[50vh] aspect-square relative z-10"
      />
    </div>
  );
}

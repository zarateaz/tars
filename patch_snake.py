# -*- coding: utf-8 -*-
import io, re, sys

path = "/home/zarate/Zárate 2208/snake.html"
with io.open(path, "r", encoding="utf-8") as f:
    html = f.read()

audio_block = r'''
  // ===== MOTOR DE AUDIO (Web Audio API) =====
  let audioCtx = null;
  function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Impacto: golpe grave + chispa metalica + brillo armonico. intensity 0..1
  function impactSound(intensity) {
    intensity = Math.max(0, Math.min(1, intensity || 0));
    const ac = getAudio();
    const now = ac.currentTime;

    // 1) Golpe grave (kick)
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const startFreq = 180 - intensity * 60;
    const endFreq   = 45 - intensity * 15;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + 0.18 + intensity * 0.12);
    const vol = 0.35 + intensity * 0.5;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22 + intensity * 0.25);
    osc.connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.5 + intensity * 0.3);

    // 2) Chispa metalica (ruido filtrado)
    const dur = 0.12 + intensity * 0.15;
    const bufferSize = Math.floor(ac.sampleRate * dur);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2.5);
    }
    const noise = ac.createBufferSource();
    noise.buffer = buffer;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + intensity * 2200;
    bp.Q.value = 1.2;
    const nGain = ac.createGain();
    nGain.gain.setValueAtTime(0.18 + intensity * 0.35, now);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    noise.connect(bp).connect(nGain).connect(ac.destination);
    noise.start(now);
    noise.stop(now + dur + 0.02);

    // 3) Brillo armonico extra en niveles altos
    if (intensity > 0.45) {
      const osc2 = ac.createOscillator();
      const g2 = ac.createGain();
      osc2.type = 'triangle';
      const f2 = 440 + intensity * 660;
      osc2.frequency.setValueAtTime(f2, now + 0.02);
      osc2.frequency.exponentialRampToValueAtTime(f2 * 1.5, now + 0.25);
      g2.gain.setValueAtTime(0.0001, now + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.12 + intensity * 0.18, now + 0.04);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc2.connect(g2).connect(ac.destination);
      osc2.start(now + 0.02);
      osc2.stop(now + 0.35);
    }
  }

  // Impacto al comer (crece con el nivel)
  function foodImpact() {
    const intensity = Math.min(1, (level - 1) / 9 + 0.15);
    impactSound(intensity);
  }

  // Impacto especial al subir de nivel (mas potente + rafaga de 3 golpes)
  function levelUpImpact(newLevel) {
    const base = Math.min(1, newLevel / 10);
    impactSound(Math.min(1, base + 0.35));
    setTimeout(() => impactSound(Math.min(1, base + 0.55)), 110);
    setTimeout(() => impactSound(Math.min(1, base + 0.75)), 230);
  }
'''

# 1) Insertar el bloque de audio despues de bestEl.textContent = best;
anchor = "  bestEl.textContent = best;\n"
if "MOTOR DE AUDIO" not in html:
    if anchor not in html:
        print("ANCHOR_NOT_FOUND")
        sys.exit(1)
    html = html.replace(anchor, anchor + audio_block, 1)

# 2) Llamar foodImpact() al comer
old_eat = """      score += 10;
      scoreEl.textContent = score;"""
new_eat = """      score += 10;
      scoreEl.textContent = score;
      foodImpact();"""
if "foodImpact();" not in html:
    if old_eat not in html:
        print("EAT_ANCHOR_NOT_FOUND")
        sys.exit(1)
    html = html.replace(old_eat, new_eat, 1)

# 3) Llamar levelUpImpact al subir nivel
old_lvl = "if (score % 50 === 0 && speed > 60) { level++; levelEl.textContent = level; speed -= 12; restartLoop(); }"
new_lvl = "if (score % 50 === 0 && speed > 60) { level++; levelEl.textContent = level; speed -= 12; levelUpImpact(level); restartLoop(); }"
if "levelUpImpact(level)" not in html:
    if old_lvl not in html:
        print("LVL_ANCHOR_NOT_FOUND")
        sys.exit(1)
    html = html.replace(old_lvl, new_lvl, 1)

# 4) Etiqueta visual
if "Impacto din" not in html:
    old_keys = '<div class="keys">Flechas / WASD · Espacio = pausa</div>'
    new_keys = old_keys + '\n  <div class="audioTag">Impacto dinamico - sube con cada nivel</div>'
    html = html.replace(old_keys, new_keys, 1)

with io.open(path, "w", encoding="utf-8") as f:
    f.write(html)

print("OK_PATCHED")

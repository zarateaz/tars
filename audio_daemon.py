#!/usr/bin/env python3
"""
J.E.A.R.V.I.S. — Ultra-Low-Latency Audio & Voice Daemon (Port 8001)
Eliminates cold process startup overhead for:
1. Microphone capture + Adaptive VAD + ALSA/PipeWire hardware gain calibration + Google STT.
2. Neural TTS synthesis in-memory via edge_tts.
"""

import asyncio
import ctypes
import ctypes.util
import io
import json
import os
import re
import subprocess
import threading
import time
import wave
from typing import Optional

import edge_tts
import httpx
import numpy as np
import sounddevice as sd
import speech_recognition as sr
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="JARVIS Audio Daemon")

FLUSH_FILE = "/tmp/jarvis_flush_mic"
TV_SERIAL = "192.168.1.54:5555"

# Persistent HTTP client for ultra-fast STT requests
http_client = httpx.Client(timeout=6.0)
recognizer = sr.Recognizer()
recognizer.operation_timeout = 5.0

# Load libasound once to calibrate hardware ALC257 Capture register without saturating ADC
_asound = None
try:
    lib_path = ctypes.util.find_library("asound")
    if lib_path:
        _asound = ctypes.CDLL(lib_path)
        _asound.snd_mixer_find_selem.restype = ctypes.c_void_p
        _asound.snd_mixer_find_selem.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        _asound.snd_mixer_selem_set_capture_volume_all.argtypes = [ctypes.c_void_p, ctypes.c_long]
except Exception:
    _asound = None


def calibrate_hardware_mic(alsa_capture_step: int = 44, wpctl_vol: str = "0.22"):
    """
    Calibrates both PipeWire source volume and hardware ALSA Capture register:
    - Internal Mic Boost = 0, Mic Boost = 0 (zero pre-amp hiss/clipping)
    - ALSA Capture = 44/63 (~+8.25 dB clean sweet spot, instead of 63/63 +30 dB saturated)
    - PipeWire volume = 0.22 (22%)
    """
    try:
        subprocess.run(
            ["wpctl", "set-mute", "@DEFAULT_AUDIO_SOURCE@", "0"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=0.4,
        )
        subprocess.run(
            ["wpctl", "set-volume", "@DEFAULT_AUDIO_SOURCE@", wpctl_vol],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=0.4,
        )
        subprocess.run(
            ["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "0"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=0.4,
        )
    except Exception:
        pass

    if _asound is not None:
        try:
            mixer = ctypes.c_void_p()
            if _asound.snd_mixer_open(ctypes.byref(mixer), 0) == 0:
                _asound.snd_mixer_attach(mixer, b"hw:0")
                _asound.snd_mixer_selem_register(mixer, None, None)
                _asound.snd_mixer_load(mixer)
                sid = ctypes.create_string_buffer(128)
                for name, val in [
                    (b"Capture", alsa_capture_step),
                    (b"Internal Mic Boost", 0),
                    (b"Mic Boost", 0),
                ]:
                    _asound.snd_mixer_selem_id_set_index(sid, 0)
                    _asound.snd_mixer_selem_id_set_name(sid, name)
                    elem = _asound.snd_mixer_find_selem(mixer, sid)
                    if elem:
                        _asound.snd_mixer_selem_set_capture_volume_all(elem, val)
                _asound.snd_mixer_close(mixer)
        except Exception:
            pass


# Calibrate immediately on daemon startup
calibrate_hardware_mic()

VERBS = re.compile(
    r"\b(enciende|encender|prende|prender|apaga|apagar|sube|subir|s[uú]bele|baja|bajar|b[aá]jale|silencia|silenciar|pausa|pausar|contin[uú]a|reanuda|pon|poner|abre|abrir|cierra|cerrar|busca|buscar|reproduce|reproducir|proyecta|proyectar|activa|activar|crea|crear|elimina|borrar)\b",
    re.I,
)
NOUNS = re.compile(
    r"\b(tele|tv|televisi[oó]n|televisor|volumen|sonido|m[uú]sica|youtube|netflix|crunchyroll|disney|prime|hbo|max|pantalla|salvapantallas|hud|interfaz|reactor|inicio|home|carpeta|archivo|navegador|chrome|hora|clima|juego|tetris|serpiente|snake|tarjeta|trivia)\b",
    re.I,
)


def energy_of(d: np.ndarray) -> float:
    mono = (
        d.mean(axis=1).astype(np.float32)
        if (d.ndim > 1 and d.shape[1] > 1)
        else d.reshape(-1).astype(np.float32)
    )
    m8k = mono.reshape(-1, 6).mean(axis=1)
    return float(np.sqrt(np.mean(np.diff(m8k) ** 2)))


def recognize_fast_https(audio_16k_bytes: bytes, lang: str = "es-PE"):
    """
    Sends 16kHz FLAC audio over persistent HTTPS connection to Google Speech API.
    """
    audio_data = sr.AudioData(audio_16k_bytes, 16000, 2)
    flac_data = audio_data.get_flac_data()
    url = (
        "https://www.google.com/speech-api/v2/recognize"
        f"?client=chromium&lang={lang}&key=AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw&pFilter=0"
    )
    resp = http_client.post(
        url,
        content=flac_data,
        headers={"Content-Type": "audio/x-flac; rate=16000"},
    )
    if resp.status_code != 200:
        return None
    for line in resp.text.split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            results = obj.get("result", [])
            if results and results[0].get("alternative"):
                return results[0]
        except Exception:
            continue
    return None


PIPER_BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".venv", "bin", "piper")
PIPER_MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "piper")

def _synthesize_piper(text: str, voice_key: str, output_path: str) -> bool:
    """
    Synthesize speech using local Piper ONNX model and convert directly to target (MP3/WAV).
    """
    if not os.path.exists(PIPER_BIN):
        return False

    model_name = "es_ES-davefx-medium.onnx"
    if "alan" in voice_key or "bettany" in voice_key or "en" in voice_key:
        model_name = "en_GB-alan-medium.onnx"

    model_path = os.path.join(PIPER_MODELS_DIR, model_name)
    if not os.path.exists(model_path):
        return False

    try:
        if output_path.endswith(".wav"):
            p = subprocess.Popen(
                [PIPER_BIN, "--model", model_path, "--output_file", output_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            p.communicate(input=text.encode("utf-8"), timeout=12)
            return os.path.exists(output_path) and os.path.getsize(output_path) > 100
        else:
            # Output directly to mp3 using ffmpeg pipe
            p1 = subprocess.Popen(
                [PIPER_BIN, "--model", model_path, "--output-raw"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
            p2 = subprocess.Popen(
                ["/usr/bin/ffmpeg", "-y", "-f", "s16le", "-ar", "22050", "-ac", "1", "-i", "-", "-b:a", "128k", output_path],
                stdin=p1.stdout,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            p1.stdout.close()
            p1.stdin.write(text.encode("utf-8"))
            p1.stdin.close()
            p2.communicate(timeout=12)
            p1.wait()
            return os.path.exists(output_path) and os.path.getsize(output_path) > 100
    except Exception as e:
        print(f"Piper synthesis error: {e}")
        return False


class TTSRequest(BaseModel):
    text: str
    voice: str = "es-MX-DaliaNeural"
    rate: str = "+0%"
    pitch: str = "+0Hz"
    output_path: str


@app.get("/health")
async def health():
    return {"status": "ok", "service": "jarvis_audio_daemon"}


@app.post("/tts")
async def synthesize_tts(req: TTSRequest):
    try:
        # Check if local Piper synthesis is requested
        is_piper = "piper" in req.voice.lower() or "bettany" in req.voice.lower() or "davefx" in req.voice.lower()
        if is_piper:
            success = _synthesize_piper(req.text, req.voice, req.output_path)
            if success:
                return {"success": True, "path": req.output_path, "engine": "piper"}

        comm = edge_tts.Communicate(
            req.text,
            req.voice,
            rate=req.rate,
            pitch=req.pitch,
        )
        await comm.save(req.output_path)
        return {"success": True, "path": req.output_path, "engine": "edge_tts"}
    except Exception as e:
        # Fallback to Piper if edge-tts fails (e.g. offline)
        try:
            success = _synthesize_piper(req.text, "es_ES-davefx-medium", req.output_path)
            if success:
                return {"success": True, "path": req.output_path, "engine": "piper_fallback"}
        except Exception:
            pass
        return {"success": False, "error": str(e)}


@app.post("/ flush")
@app.put("/record")
async def flush_mic():
    try:
        with open(FLUSH_FILE, "w") as f:
            f.write("1")
        return {"flushed": True}
    except Exception as e:
        return {"flushed": False, "error": str(e)}


def _capture_and_transcribe_sync(duck: bool = False) -> dict:
    try:
        if os.path.exists(FLUSH_FILE):
            os.remove(FLUSH_FILE)
    except Exception:
        pass

    sr_rate = 48000
    chunk = int(sr_rate * 0.1)  # 100 ms (4800 samples, divisible by 6 and 3)

    stream = None
    for ch in (2, 1):
        try:
            stream = sd.InputStream(
                samplerate=sr_rate, channels=ch, dtype="int16", blocksize=chunk
            )
            stream.start()
            break
        except Exception:
            stream = None

    if not stream:
        return {"text": "", "success": False, "error": "no_mic"}

    state = {
        "tv_playing": False,
        "paused_tv_by_jarvis": False,
        "paused_local_player": False,
    }

    def bg_setup():
        calibrate_hardware_mic()
        # 1. Duck local desktop media player (e.g. Chrome YouTube, Spotify) on manual mic activation
        if duck:
            try:
                r_pl = subprocess.run(
                    ["playerctl", "status"],
                    capture_output=True,
                    text=True,
                    timeout=0.5,
                )
                if "Playing" in r_pl.stdout:
                    subprocess.run(
                        ["playerctl", "pause"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=0.5,
                    )
                    state["paused_local_player"] = True
            except Exception:
                pass

        # 2. Check Smart TV only if already connected in `adb devices` (0ms fast check)
        try:
            r_devs = subprocess.run(
                ["adb", "devices"],
                capture_output=True,
                text=True,
                timeout=0.4,
            )
            if TV_SERIAL in r_devs.stdout and "\tdevice" in r_devs.stdout:
                r_tv = subprocess.run(
                    [
                        "adb",
                        "-s",
                        TV_SERIAL,
                        "shell",
                        "dumpsys media_session | grep -m3 'state=PlaybackState'",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=0.8,
                )
                if "state=PLAYING" in r_tv.stdout:
                    state["tv_playing"] = True
                    if duck:
                        subprocess.run(
                            ["adb", "-s", TV_SERIAL, "shell", "input keyevent 127"],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            timeout=0.8,
                        )
                        state["paused_tv_by_jarvis"] = True
        except Exception:
            pass

    bg_thread = threading.Thread(target=bg_setup, daemon=True)
    bg_thread.start()

    def resume_media():
        try:
            bg_thread.join(timeout=0.15)
        except Exception:
            pass
        if state["paused_local_player"]:
            try:
                subprocess.Popen(
                    ["playerctl", "play"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except Exception:
                pass
            state["paused_local_player"] = False
        if state["paused_tv_by_jarvis"]:
            try:
                subprocess.Popen(
                    ["adb", "-s", TV_SERIAL, "shell", "input keyevent 126"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except Exception:
                pass
            state["paused_tv_by_jarvis"] = False

    MAX_WAIT = 36        # 3.6 s waiting for voice start
    MAX_SPEECH = 65      # 6.5 s max per utterance
    END_SILENCE = 4      # 0.4 s of silence after speaking = snappy, natural cut
    PRE_ROLL = 5         # 0.5 s pre-roll so the first syllable is never clipped

    chunks, energies = [], []
    started, start_idx, speech_n, silence_n, peak = False, 0, 0, 0, 0.0
    floor = 85.0

    try:
        idx = 0
        while True:
            if os.path.exists(FLUSH_FILE):
                try:
                    os.remove(FLUSH_FILE)
                except Exception:
                    pass
                break
            data, _ = stream.read(chunk)
            d = data.copy()
            e = energy_of(d)
            chunks.append(d)
            energies.append(e)

            if not started:
                # Adaptive ambient floor estimation (works in quiet room OR with background music)
                recent = energies[-12:]
                if recent:
                    floor = min(750.0, max(45.0, float(np.percentile(recent, 35))))
            trigger = max(floor * 1.95, floor + 110.0)

            if not started:
                if e > trigger:
                    started = True
                    start_idx = max(0, idx - PRE_ROLL)
                    speech_n = idx - start_idx + 1
                    peak = e
                    silence_n = 0
                elif idx >= MAX_WAIT:
                    break
            else:
                speech_n += 1
                if e > peak:
                    peak = e
                stop_thr = max(floor * 1.45 + 35.0, min(peak * 0.25, 850.0))
                if e < stop_thr and speech_n >= 4:
                    silence_n += 1
                    if silence_n >= END_SILENCE:
                        break
                else:
                    silence_n = 0
                if speech_n >= MAX_SPEECH:
                    break
            idx += 1
    finally:
        try:
            stream.stop()
            stream.close()
        except Exception:
            pass
        resume_media()

    if not started:
        if duck and len(chunks) >= 4 and max(energies, default=0.0) > floor + 70.0:
            start_idx = 0
        else:
            return {"text": "", "success": False, "reason": "no_speech"}
    elif speech_n < 3 and not duck:
        return {"text": "", "success": False, "reason": "no_speech"}

    start_idx = max(0, start_idx - 3)
    rec = np.concatenate(chunks[start_idx:], axis=0)
    mono48 = (
        rec.mean(axis=1).astype(np.float32)
        if (rec.ndim > 1 and rec.shape[1] > 1)
        else rec.reshape(-1).astype(np.float32)
    )
    # Decimate 48kHz -> 16kHz (exact factor of 3) for 3x smaller FLAC payload and faster upload
    n16 = (len(mono48) // 3) * 3
    mono16 = mono48[:n16].reshape(-1, 3).mean(axis=1).astype(np.int16)

    alts, conf = [], None
    for lang in ("es-PE", "es-419"):
        try:
            res = recognize_fast_https(mono16.tobytes(), lang=lang)
        except Exception:
            res = None
        if isinstance(res, dict) and res.get("alternative"):
            alts = [
                a.get("transcript", "").strip()
                for a in res["alternative"]
                if a.get("transcript")
            ]
            conf = res["alternative"][0].get("confidence")
            break

    if not alts:
        return {"text": "", "success": False, "reason": "not_understood"}

    def score_alt(idx_alt):
        i, s = idx_alt
        sc = (len(alts) - i) * 0.25
        if VERBS.search(s):
            sc += 3.0
        if NOUNS.search(s):
            sc += 2.0
        return sc

    best_idx = max(range(len(alts)), key=lambda i: score_alt((i, alts[i])))
    text = alts[best_idx]

    text = re.sub(
        r"\b(yarvis|jarvi|jarbis|harvis|jervis|yervis|charvis|jardis|garvis|ella elvis|el jarvis|jearvis|jearcis|jarcis)\b",
        "Jarvis",
        text,
        flags=re.I,
    )

    has_wake = re.search(r"\bjarvis\b", text, re.I) is not None
    has_cmd = bool(VERBS.search(text) or NOUNS.search(text))

    if not duck:
        if state["tv_playing"] and not has_wake:
            return {
                "text": "",
                "success": False,
                "reason": "tv_audio_ignored",
                "heard": text,
            }
        if conf is not None and conf < 0.55 and not has_cmd:
            return {
                "text": "",
                "success": False,
                "reason": "low_confidence",
                "heard": text,
            }

    return {
        "text": text,
        "success": Boolean(text),
        "confidence": conf,
        "alternatives": alts[:4],
    }


def Boolean(v) -> bool:
    return bool(v and str(v).strip())


@app.post("/record")
async def record_mic(duck: int = 0):
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, _capture_and_transcribe_sync, bool(duck))
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="warning")

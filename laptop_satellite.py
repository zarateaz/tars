#!/usr/bin/env python3
"""
J.E.A.R.V.I.S. // GROUND SATELLITE (agente de la laptop)

El núcleo corre en el VPS (Docker) y no puede tocar tu laptop directamente.
Este agente corre EN la laptop, consulta al VPS cada ~1.5 s por HTTPS
(conexión saliente: no abre puertos en casa) y ejecuta SOLO acciones de una
lista blanca. Ya no existe la acción "bash" (era ejecución remota de código).

Configuración (.env de la laptop o variables de entorno):
  JEARVIS_SERVER_URL=https://jarvis.tudominio.com
  STARK_AUTH_TOKEN=<el mismo token del VPS>
  JEARVIS_TV_IP=192.168.1.54:5555         (opcional)
  JEARVIS_TV_BROADCAST=192.168.1.255      (opcional, para Wake-on-LAN)
"""

import json
import os
import shlex
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
ENV_FILE = PROJECT_DIR / ".env"


def load_env() -> dict:
    env_vars = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars


ENV = load_env()


def cfg(key: str, default: str = "") -> str:
    return os.environ.get(key) or ENV.get(key) or default


SERVER_URL = cfg("JEARVIS_SERVER_URL", "http://127.0.0.1:3000").rstrip("/")
AUTH_TOKEN = cfg("STARK_AUTH_TOKEN")
TV_IP = cfg("JEARVIS_TV_IP", "192.168.1.54:5555")
TV_BROADCAST = cfg("JEARVIS_TV_BROADCAST", "192.168.1.255")
POLL_SECONDS = float(cfg("JEARVIS_POLL_SECONDS", "1.5"))

# Lista blanca de aplicaciones que el VPS puede abrir/cerrar (alias → binarios candidatos)
APP_WHITELIST = {
    "chrome": ["google-chrome-stable", "google-chrome", "chromium"],
    "google chrome": ["google-chrome-stable", "google-chrome", "chromium"],
    "navegador": ["google-chrome-stable", "firedragon", "firefox", "chromium"],
    "browser": ["google-chrome-stable", "firedragon", "firefox"],
    "firedragon": ["firedragon"],
    "firefox": ["firefox"],
    "terminal": ["alacritty", "kitty", "konsole"],
    "consola": ["alacritty", "kitty", "konsole"],
    "archivos": ["thunar", "dolphin", "nemo", "nautilus"],
    "explorador": ["thunar", "dolphin", "nemo"],
    "editor": ["code", "cursor", "kate"],
    "codigo": ["code", "cursor", "kate"],
    "spotify": ["spotify"],
    "musica": ["spotify", "vlc", "mpv"],
    "vlc": ["vlc"],
    "calculadora": ["kcalc", "galculator", "gnome-calculator"],
    "obs": ["obs"],
    "discord": ["discord"],
}
MEDIA_ACTIONS = {"play", "pause", "play-pause", "next", "previous", "stop"}
ADB_SHELL_ALLOWED = {"input", "am", "monkey", "dumpsys", "cmd", "media", "settings", "pm"}

KNOWN_FOLDERS = {
    "descargas": "Descargas", "downloads": "Descargas", "documentos": "Documentos",
    "documents": "Documentos", "imagenes": "Imágenes", "imágenes": "Imágenes", "fotos": "Imágenes",
    "escritorio": "Escritorio", "desktop": "Escritorio", "videos": "Vídeos", "vídeos": "Vídeos",
    "musica": "Música", "música": "Música",
}


def log(msg: str) -> None:
    print(msg, flush=True)


def make_request(path: str, data=None) -> dict:
    headers = {"User-Agent": "Jarvis-Ground-Satellite/2.0", "Content-Type": "application/json"}
    if AUTH_TOKEN:
        headers["x-stark-token"] = AUTH_TOKEN
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(f"{SERVER_URL}{path}", data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            log("❌ 401: STARK_AUTH_TOKEN incorrecto para este servidor.")
        return {"success": False, "error": f"HTTP {e.code}"}
    except Exception as e:  # red caída, etc.
        return {"success": False, "error": str(e)}


def first_bin(candidates):
    for c in candidates:
        p = shutil.which(c)
        if p:
            return p
    return None


def detach(argv):
    subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("1.1.1.1", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "desconocida"


def get_system_telemetry() -> dict:
    ram_free = ram_total = 0
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemTotal:"):
                ram_total = int(line.split()[1]) // 1024
            elif line.startswith("MemAvailable:"):
                ram_free = int(line.split()[1]) // 1024
    except Exception:
        pass

    battery = None
    for b in Path("/sys/class/power_supply").glob("BAT*/capacity"):
        try:
            battery = int(b.read_text().strip())
        except Exception:
            pass

    load1 = os.getloadavg()[0] if hasattr(os, "getloadavg") else 0
    cpu_pct = min(100, round(load1 / max(1, os.cpu_count() or 1) * 100))

    tv_connected = False
    if shutil.which("adb"):
        try:
            res = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=2)
            tv_connected = any(l.startswith(TV_IP) and l.endswith("device") for l in res.stdout.splitlines())
        except Exception:
            pass

    return {
        "nodeName": "ZARATE-LAPTOP-GROUND",
        "hostname": socket.gethostname(),
        "ip": get_local_ip(),
        "os": "Linux",
        "desktop": os.environ.get("XDG_CURRENT_DESKTOP", "desconocido"),
        "cpuPct": cpu_pct,
        "ramFreeMb": ram_free,
        "ramTotalMb": ram_total,
        "batteryPct": battery,
        "tvConnected": tv_connected,
    }


def send_wol(mac: str) -> None:
    clean = mac.replace(":", "").replace("-", "")
    if len(clean) != 12:
        return
    packet = b"\xff" * 6 + bytes.fromhex(clean) * 16
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    for _ in range(3):
        for host, port in ((TV_BROADCAST, 9), (TV_BROADCAST, 7), ("255.255.255.255", 9)):
            try:
                s.sendto(packet, (host, port))
            except Exception:
                pass
        time.sleep(0.06)
    s.close()


def execute_local_command(cmd: dict) -> bool:
    action = str(cmd.get("action", ""))
    payload = cmd.get("payload") or {}
    log(f"⚡ [EJECUTANDO] {action} {payload}")

    if action in ("open_app", "close_app"):
        name = str(payload.get("app", "")).strip().lower()
        candidates = APP_WHITELIST.get(name)
        if not candidates:
            log(f"⛔ App fuera de la lista blanca: {name!r}")
            return False
        if action == "open_app":
            binary = first_bin(candidates)
            if not binary:
                return False
            detach([binary])
        else:
            for c in candidates:
                subprocess.run(["pkill", "-x", c], check=False)
        return True

    if action == "open_url":
        url = str(payload.get("url", ""))
        if not url.startswith(("http://", "https://")):
            log(f"⛔ URL rechazada: {url!r}")
            return False
        detach(["xdg-open", url])
        return True

    if action == "open_folder":
        key = str(payload.get("folder", "")).strip().lower()
        sub = KNOWN_FOLDERS.get(key)
        target = Path.home() / sub if sub else None
        if not target or not target.is_dir():
            log(f"⛔ Carpeta no permitida: {key!r}")
            return False
        detach(["xdg-open", str(target)])
        return True

    if action == "lock_screen":
        if shutil.which("hyprlock"):
            detach(["hyprlock"])
        elif shutil.which("loginctl"):
            subprocess.run(["loginctl", "lock-session"], check=False)
        return True

    if action in ("volume", "volume_delta", "mute"):
        if not shutil.which("pactl"):
            return False
        if action == "volume":
            level = max(0, min(150, int(payload.get("level", 50))))
            arg = f"{level}%"
        elif action == "volume_delta":
            d = max(-100, min(100, int(payload.get("delta", 0))))
            arg = f"{'+' if d >= 0 else '-'}{abs(d)}%"
        else:
            subprocess.run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", "toggle"], check=False)
            return True
        subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", arg], check=False)
        return True

    if action == "media":
        a = str(payload.get("action", ""))
        if a not in MEDIA_ACTIONS or not shutil.which("playerctl"):
            return False
        subprocess.run(["playerctl", a], check=False)
        return True

    if action == "screenshot":
        binary = first_bin(["grimblast", "spectacle", "flameshot"])
        if not binary:
            return False
        if binary.endswith("grimblast"):
            detach([binary, "save", "screen"])
        elif binary.endswith("spectacle"):
            detach([binary, "-b", "-f"])
        else:
            detach([binary, "full"])
        return True

    if action == "speak_local":
        audio_url = str(payload.get("audioUrl", ""))
        if audio_url.startswith("/"):
            audio_url = SERVER_URL + audio_url
        if audio_url.startswith(SERVER_URL) and shutil.which("mpv"):
            headers = f"x-stark-token: {AUTH_TOKEN}" if AUTH_TOKEN else ""
            detach(["mpv", "--no-video", "--really-quiet", f"--http-header-fields={headers}", audio_url])
            return True
        return False

    if action == "tv_wol":
        send_wol(str(payload.get("mac", "")))
        return True

    if action == "tv_adb":
        if not shutil.which("adb"):
            return False
        try:
            parts = shlex.split(str(payload.get("command", "")))
        except ValueError:
            return False
        # Solo "adb shell <herramienta> ..." con herramientas de la lista. Sin shell local.
        if len(parts) < 2 or parts[0] != "shell":
            log(f"⛔ Comando ADB rechazado: {parts!r}")
            return False
        inner = shlex.split(parts[1]) if len(parts) == 2 else parts[1:]
        if not inner or inner[0] not in ADB_SHELL_ALLOWED:
            log(f"⛔ Herramienta ADB no permitida: {inner[:1]!r}")
            return False
        subprocess.run(["adb", "connect", TV_IP], capture_output=True, timeout=3, check=False)
        subprocess.run(["adb", "-s", TV_IP, "shell", *inner], capture_output=True, timeout=6, check=False)
        return True

    log(f"⚠️ Acción no reconocida o no permitida: {action}")
    return False


def main() -> None:
    is_local = SERVER_URL.startswith(("http://127.0.0.1", "http://localhost"))
    if not AUTH_TOKEN:
        log("❌ Falta STARK_AUTH_TOKEN. El satélite no arranca sin token.")
        sys.exit(1)
    if not is_local and not SERVER_URL.startswith("https://"):
        log("❌ JEARVIS_SERVER_URL debe ser https:// para un servidor remoto (el token viaja en cada petición).")
        sys.exit(1)

    log(f"🛰️ Satélite conectado a {SERVER_URL}. Esperando órdenes...")
    last_telemetry = 0.0
    while True:
        try:
            now = time.time()
            if now - last_telemetry > 10:
                make_request("/api/satellite", {"telemetry": get_system_telemetry()})
                last_telemetry = now

            resp = make_request("/api/satellite")
            for cmd in resp.get("commands") or []:
                try:
                    execute_local_command(cmd)
                except Exception as e:
                    log(f"❌ Error ejecutando {cmd.get('action')}: {e}")
        except KeyboardInterrupt:
            log("\n🛑 Satélite detenido.")
            break
        except Exception:
            time.sleep(3)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()

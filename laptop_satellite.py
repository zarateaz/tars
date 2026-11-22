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

import base64
import json
import struct
import os
import threading
import re
import urllib.parse
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


# ---------- TV (ADB en la LAN de casa) ----------
def tv_device_state() -> str:
    try:
        r = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=4)
        for line in r.stdout.splitlines():
            if line.startswith(TV_IP):
                return line.split()[-1]  # device | offline | unauthorized
    except Exception:
        pass
    return "missing"


def tv_reachable(timeout: float = 1.5) -> bool:
    """¿La TV escucha en el puerto ADB? (Si está en reposo profundo, su Wi-Fi no responde.)"""
    host, _, port = TV_IP.partition(":")
    try:
        with socket.create_connection((host, int(port or 5555)), timeout=timeout):
            return True
    except OSError:
        return False


def tv_reconnect(force: bool = False) -> bool:
    """Si la TV quedó 'offline' (ADB colgado tras dormir), desconecta y vuelve a conectar."""
    try:
        st = tv_device_state()
        if st == "device" and not force:
            return True
        if not tv_reachable():
            return False
        subprocess.run(["adb", "disconnect", TV_IP], capture_output=True, timeout=4, check=False)
        subprocess.run(["adb", "connect", TV_IP], capture_output=True, timeout=6, check=False)
        time.sleep(0.4)
        return tv_device_state() == "device"
    except (subprocess.TimeoutExpired, OSError):
        return False


class _Failed:
    returncode = 1
    stdout = b""
    stderr = b""


def _tv_run(args, timeout, binary=False):
    try:
        return subprocess.run(["adb", "-s", TV_IP, *args], capture_output=True, text=not binary, timeout=timeout, check=False)
    except (subprocess.TimeoutExpired, OSError):
        f = _Failed()
        if not binary:
            f.stdout, f.stderr = "", "timeout"
        return f


def tv_adb(*shell_args, timeout=8):
    """Ejecuta `adb shell ...` en la TV, reconectando si está offline. Devuelve (ok, salida)."""
    if not shutil.which("adb"):
        return False, "adb no instalado"
    if not tv_reconnect():
        return False, "La TV no responde por red (apagada o en reposo)"
    try:
        r = _tv_run(["shell", *shell_args], timeout)
        out = (r.stdout or "") + (r.stderr or "")
        if r.returncode != 0 or "offline" in out or "not found" in out:
            tv_reconnect(force=True)
            r = _tv_run(["shell", *shell_args], timeout)
            out = (r.stdout or "") + (r.stderr or "")
        return r.returncode == 0, out
    except subprocess.TimeoutExpired:
        return False, "timeout"


def tv_is_awake():
    ok, out = tv_adb("dumpsys power | grep -m1 mWakefulness=")
    if not ok:
        return None
    if "Awake" in out:
        return True
    if "Asleep" in out or "Dozing" in out:
        return False
    return None


def tv_get_volume():
    ok, out = tv_adb("cmd media_session volume --stream 3 --get")
    m = re.search(r"volume is (\d+)", out or "", re.I)
    return int(m.group(1)) if (ok and m) else None


def tv_keys(code: int, count: int):
    count = max(1, min(50, int(count)))
    tv_adb(" && ".join([f"input keyevent {code}"] * count), timeout=20)


def tv_power(state: str, mac: str):
    if state == "on":
        ok, _ = tv_adb("input keyevent 224")  # WAKEUP: solo enciende
        if ok:
            return True
        log("📺 TV sin respuesta: enviando Wake-on-LAN...")
        for _ in range(8):  # hasta ~16 s para que el Wi-Fi de la TV despierte
            send_wol(mac or "44:0f:b4:12:fa:ee")
            time.sleep(2)
            if tv_reachable(1.0):
                ok, _ = tv_adb("input keyevent 224")
                if ok:
                    log("📺 TV encendida por Wake-on-LAN")
                    return True
        log("❌ La TV no respondió (ni ADB ni Wake-on-LAN)")
        return False
    awake = tv_is_awake()
    if awake is True:
        tv_adb("input keyevent 26")  # POWER: solo si está encendida, así nunca la enciende por error
    return awake is not None


# ---------- Vista en vivo (pantalla / webcam / TV) ----------
LIVE_MIN_INTERVAL = {"screen": 0.6, "webcam": 0.9, "tv": 1.2}
_wanted_sources = set()
_wanted_lock = threading.Lock()
_monitor_cache = {"t": 0.0, "mon": (0, 0, 1920, 1080)}


def capture_frame(source: str):
    try:
        if source == "screen":
            r = subprocess.run(["grim", "-s", "0.5", "-t", "jpeg", "-q", "55", "-"], capture_output=True, timeout=4)
            return r.stdout if r.returncode == 0 and r.stdout else None
        if source == "webcam":
            r = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "v4l2", "-video_size", "640x480", "-i", "/dev/video0",
                                "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-"], capture_output=True, timeout=6)
            return r.stdout if r.returncode == 0 and r.stdout else None
        if source == "tv":
            tv_reconnect()
            local_png = "/tmp/tars_tv_cap.png"
            if _tv_run(["shell", "screencap", "-p", "/sdcard/tars_cap.png"], 15).returncode != 0:
                return None
            if _tv_run(["pull", "/sdcard/tars_cap.png", local_png], 10).returncode != 0:
                return None
            r = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", local_png,
                                "-vf", "scale=640:-1", "-q:v", "6", "-f", "image2pipe", "-vcodec", "mjpeg", "-"],
                               capture_output=True, timeout=6)
            return r.stdout if r.returncode == 0 and r.stdout else None
    except Exception as e:
        log(f"⚠️ Captura {source} falló: {e}")
    return None


def vision_worker():
    """Hilo: mientras el teléfono mire una fuente, la captura y la sube al VPS."""
    last = {}
    while True:
        with _wanted_lock:
            sources = list(_wanted_sources)
        if not sources:
            time.sleep(0.3)
            continue
        for src in sources:
            if time.time() - last.get(src, 0) < LIVE_MIN_INTERVAL.get(src, 1.0):
                continue
            last[src] = time.time()
            data = capture_frame(src)
            if data:
                b64 = base64.b64encode(data).decode("ascii")
                make_request("/api/satellite", {"frame": {"source": src, "image": "data:image/jpeg;base64," + b64}})
        time.sleep(0.05)


class VirtualInput:
    """Mouse + teclado virtuales vía /dev/uinput (clics, rueda y teclas REALES; sin dependencias).
    Hyprland 0.57 no tiene un dispatcher que haga clic de verdad."""
    EV_SYN, EV_KEY, EV_REL = 0, 1, 2
    REL_WHEEL = 8
    BTN = {"left": 0x110, "right": 0x111, "middle": 0x112}
    KEYS = {"Return": 28, "Enter": 28, "KP_Enter": 96, "BackSpace": 14, "space": 57, "Escape": 1, "Tab": 15,
            "Up": 103, "Down": 108, "Left": 105, "Right": 106, "Delete": 111, "Home": 102, "End": 107,
            "Page_Up": 104, "Page_Down": 109, "ctrl": 29, "shift": 42, "alt": 56, "super": 125, "v": 47,
            "F5": 63, "F11": 87, "XF86AudioPlay": 164, "XF86AudioNext": 163, "XF86AudioPrev": 165}

    def __init__(self):
        self.fd = None

    def _ensure(self) -> bool:
        if self.fd is not None:
            return True
        try:
            import fcntl
            fd = os.open("/dev/uinput", os.O_WRONLY | os.O_NONBLOCK)
            fcntl.ioctl(fd, 0x40045564, self.EV_KEY)  # UI_SET_EVBIT
            fcntl.ioctl(fd, 0x40045564, self.EV_REL)
            fcntl.ioctl(fd, 0x40045566, self.REL_WHEEL)  # UI_SET_RELBIT
            for code in list(self.BTN.values()) + list(self.KEYS.values()):
                fcntl.ioctl(fd, 0x40045565, code)  # UI_SET_KEYBIT
            setup = struct.pack("HHHH80sI", 0x06, 0x7A25, 0x0001, 1, b"TARS virtual input", 0)
            fcntl.ioctl(fd, 0x405C5503, setup)  # UI_DEV_SETUP
            fcntl.ioctl(fd, 0x5501)  # UI_DEV_CREATE
            self.fd = fd
            time.sleep(0.8)  # que Hyprland registre el dispositivo nuevo
            log("🖱️ Mouse/teclado virtual TARS listo")
            return True
        except Exception as e:
            log(f"⚠️ /dev/uinput no disponible ({e}); clics y teclas desactivados")
            return False

    def _emit(self, etype, code, value):
        os.write(self.fd, struct.pack("llHHi", 0, 0, etype, code, value))

    def _sync(self):
        self._emit(self.EV_SYN, 0, 0)

    def click(self, button="left"):
        if not self._ensure():
            return False
        code = self.BTN.get(button, self.BTN["left"])
        self._emit(self.EV_KEY, code, 1); self._sync()
        time.sleep(0.03)
        self._emit(self.EV_KEY, code, 0); self._sync()
        return True

    def wheel(self, steps: int):
        if not self._ensure():
            return False
        self._emit(self.EV_REL, self.REL_WHEEL, max(-10, min(10, steps))); self._sync()
        return True

    def keys(self, *names):
        """Pulsa una combinación (ej. keys('ctrl','v')) y la suelta en orden inverso."""
        if not self._ensure():
            return False
        codes = [self.KEYS[n] for n in names if n in self.KEYS]
        if not codes:
            return False
        for c in codes:
            self._emit(self.EV_KEY, c, 1); self._sync()
        time.sleep(0.03)
        for c in reversed(codes):
            self._emit(self.EV_KEY, c, 0); self._sync()
        return True


VINPUT = VirtualInput()


def hypr(*args):
    return subprocess.run(["hyprctl", *args], capture_output=True, text=True, timeout=3, check=False)


def monitor_box():
    """(x, y, ancho, alto) del monitor enfocado (cache 30 s)."""
    if time.time() - _monitor_cache["t"] > 30:
        try:
            mons = json.loads(hypr("monitors", "-j").stdout or "[]")
            m = next((m for m in mons if m.get("focused")), mons[0] if mons else None)
            if m:
                sc = float(m.get("scale") or 1)
                _monitor_cache["mon"] = (int(m["x"]), int(m["y"]), int(m["width"] / sc), int(m["height"] / sc))
        except Exception:
            pass
        _monitor_cache["t"] = time.time()
    return _monitor_cache["mon"]


def pc_click(button: str = "left"):
    VINPUT.click("right" if button == "right" else "left")


def move_cursor_abs(x: int, y: int):
    # Hyprland 0.57+: dispatch en Lua. (La sintaxis vieja "movecursor X Y" ya no funciona.)
    r = hypr("dispatch", f"hl.dsp.cursor.move({{x={int(x)},y={int(y)}}})")
    if "error" in (r.stdout or "").lower():
        hypr("dispatch", "movecursor", f"{int(x)} {int(y)}")  # Hyprland < 0.57


TV_KEYS = {"up": 19, "down": 20, "left": 21, "right": 22, "center": 23, "enter": 23, "ok": 23, "select": 23,
           "back": 4, "home": 3, "menu": 82, "play": 85, "pause": 85, "mute": 164, "volup": 24, "voldown": 25}


def execute_input(p: dict) -> bool:
    act = str(p.get("action", ""))
    target = p.get("target", "pc")
    if target == "tv":
        if act in ("dpad", "key"):
            tv_adb(f"input keyevent {TV_KEYS.get(str(p.get('key', 'ok')).lower(), 23)}")
        elif act == "type":
            safe = re.sub(r"[^a-zA-Z0-9_\-\s.,@]", "", str(p.get("text", ""))).replace(" ", "%s")
            if safe:
                tv_adb("input text " + shlex.quote(safe))
        elif act in ("tap", "click"):
            x = max(0.0, min(1.0, float(p.get("xNorm", p.get("x", 0.5)) or 0.5)))
            y = max(0.0, min(1.0, float(p.get("yNorm", p.get("y", 0.5)) or 0.5)))
            tv_adb(f"input tap {int(x * 1279)} {int(y * 719)}")
        else:
            return False
        return True

    mx, my, mw, mh = monitor_box()
    if act == "move":
        dx, dy = int(p.get("dx", 0)), int(p.get("dy", 0))
        if dx or dy:
            try:
                cx, cy = [int(float(v)) for v in hypr("cursorpos").stdout.strip().split(",")]
            except Exception:
                cx, cy = mx + mw // 2, my + mh // 2
            nx = max(mx, min(mx + mw - 1, cx + dx))
            ny = max(my, min(my + mh - 1, cy + dy))
            move_cursor_abs(nx, ny)
    elif act == "click":
        pc_click("left")
    elif act == "rclick":
        pc_click("right")
    elif act == "scroll":
        dy = int(p.get("dy", 0))
        VINPUT.wheel(-1 if dy > 0 else 1)  # dy>0 = bajar
    elif act == "tap":
        x = max(0.0, min(1.0, float(p.get("xNorm", 0.5))))
        y = max(0.0, min(1.0, float(p.get("yNorm", 0.5))))
        move_cursor_abs(mx + int(x * (mw - 1)), my + int(y * (mh - 1)))
        time.sleep(0.03)
        pc_click(str(p.get("button", "left")))
    elif act == "type":
        text = str(p.get("text", ""))[:500]
        if text and shutil.which("wl-copy"):
            subprocess.run(["wl-copy", "--", text], timeout=3, check=False)
            time.sleep(0.05)
            VINPUT.keys("ctrl", "v")
    elif act == "key":
        key = str(p.get("key", ""))
        if key not in VirtualInput.KEYS:
            log(f"⛔ Tecla no soportada: {key!r}")
            return False
        VINPUT.keys(key)
    else:
        return False
    return True


def execute_local_command(cmd: dict) -> bool:
    action = str(cmd.get("action", ""))
    payload = cmd.get("payload") or {}
    if action != "input" or payload.get("action") not in ("move",):
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

    if action == "input":
        return execute_input(payload)

    if action == "tv_power":
        return tv_power(str(payload.get("state", "on")), str(payload.get("mac", "")))

    if action == "tv_set_volume":
        target = max(0, min(100, int(payload.get("level", 30))))
        cur = tv_get_volume()
        if cur is None:
            log("❌ No pude leer el volumen de la TV")
            return False
        diff = target - cur
        if diff:
            tv_keys(24 if diff > 0 else 25, abs(diff))
        log(f"📺 Volumen TV {cur} → {tv_get_volume()}")
        return True

    if action == "tv_volume_step":
        delta = max(-50, min(50, int(payload.get("delta", 5))))
        if delta:
            tv_keys(24 if delta > 0 else 25, abs(delta))
        return True

    if action == "tv_youtube":
        q = urllib.parse.quote(str(payload.get("query", ""))[:200])
        if not q:
            return False
        tv_adb("am start -a android.intent.action.VIEW -d " + shlex.quote(f"vnd.youtube://search?q={q}"))
        if payload.get("autoplay", True):
            time.sleep(float(payload.get("delaySec", 3.0)))  # esperar a que cargue YouTube
            tv_adb("input keyevent 23")  # OK = reproducir el primer resultado
        return True

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
    threading.Thread(target=vision_worker, daemon=True).start()
    last_telemetry = 0.0
    interactive = False
    while True:
        try:
            now = time.time()
            if now - last_telemetry > 10:
                make_request("/api/satellite", {"telemetry": get_system_telemetry()})
                last_telemetry = now

            resp = make_request("/api/satellite")
            with _wanted_lock:
                _wanted_sources.clear()
                _wanted_sources.update(s for s in (resp.get("vision") or []) if s in LIVE_MIN_INTERVAL)
            interactive = bool(resp.get("interactive"))
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
        # Trackpad / vista en vivo abiertos → consultar cada 0.15 s; en reposo, cada POLL_SECONDS
        time.sleep(0.15 if interactive else POLL_SECONDS)


if __name__ == "__main__":
    main()

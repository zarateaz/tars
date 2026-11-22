#!/usr/bin/env python3
"""
J.E.A.R.V.I.S. — Autonomous Self-Healing Watchdog & Cognitive Patrol Daemon
Responsibilities:
1. Dynamic Network IP Detection (Auto-detects Chamba 192.168.100.184 vs Casa 192.168.1.35).
2. Cloudflare Zero-Trust Tunnel Auto-Recovery (Auto-restarts on 24h expiration, broadcasts new URL).
3. Core Services Health (Keeps Next.js :3000 and Audio Daemon :8001 alive).
4. Autonomous Sentinel Camera Patrol (Hyprlock dispatch & intruder capture on trigger).
5. Nocturnal Memory Consolidator / Cognitive Graph Dream Cycle.
"""

import json
import os
import re
import socket
import subprocess
import time
from datetime import datetime

ROOT_DIR = "/home/zarate/jearvis"
PUBLIC_DIR = os.path.join(ROOT_DIR, "public")
TUNNEL_INFO_FILE = os.path.join(PUBLIC_DIR, "tunnel_info.json")
SENTINEL_STATE_FILE = os.path.join(ROOT_DIR, "sentinel_trap.json")
MEMORY_STORE_FILE = os.path.join(ROOT_DIR, "memory_store.json")
BIN_CLOUDFLARED = os.path.join(ROOT_DIR, "bin", "cloudflared")
CLOUDFLARE_LOG = "/tmp/jearvis_watchdog_tunnel.log"


def get_local_ip() -> str:
    """Detect current local LAN IP dynamically."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def get_current_tunnel_url() -> str:
    """Read the active tunnel URL from memory or file."""
    if os.path.exists(TUNNEL_INFO_FILE):
        try:
            with open(TUNNEL_INFO_FILE, "r") as f:
                data = json.load(f)
                return data.get("tunnelUrl", "")
        except Exception:
            pass
    return ""


def start_or_restart_tunnel() -> str:
    """Restarts cloudflared and extracts the new URL."""
    print("[Watchdog] Restarting Cloudflare Tunnel...")
    try:
        subprocess.run(["pkill", "-f", "bin/cloudflared tunnel"], check=False)
    except Exception:
        pass
    time.sleep(1)

    if os.path.exists(CLOUDFLARE_LOG):
        try:
            os.remove(CLOUDFLARE_LOG)
        except Exception:
            pass

    cmd = f"{BIN_CLOUDFLARED} tunnel --url http://127.0.0.1:3000 > {CLOUDFLARE_LOG} 2>&1 &"
    subprocess.Popen(cmd, shell=True)

    # Wait up to 10 seconds for URL
    new_url = ""
    for _ in range(20):
        time.sleep(0.5)
        if os.path.exists(CLOUDFLARE_LOG):
            try:
                with open(CLOUDFLARE_LOG, "r") as f:
                    content = f.read()
                    matches = re.findall(r"https://[-a-z0-9.]+\.trycloudflare\.com", content)
                    if matches:
                        new_url = matches[0]
                        break
            except Exception:
                pass

    if new_url:
        print(f"[Watchdog] New Cloudflare Tunnel URL established: {new_url}")
    return new_url


def update_tunnel_info(local_ip: str, tunnel_url: str):
    """Write public/tunnel_info.json for clients to query."""
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    info = {
        "status": "online",
        "localIp": local_ip,
        "localPort": 3000,
        "tunnelUrl": tunnel_url,
        "isChamba": local_ip.startswith("192.168.100."),
        "isCasa": local_ip.startswith("192.168.1."),
        "candidates": [
            f"http://{local_ip}:3000",
            tunnel_url,
            "http://192.168.100.184:3000",
            "http://192.168.1.35:3000",
        ],
        "updatedAt": datetime.now().isoformat(),
    }
    with open(TUNNEL_INFO_FILE, "w") as f:
        json.dump(info, f, indent=2)


def check_service_health(port: int) -> bool:
    """Check if TCP port is accepting connections."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.5)
        result = sock.connect_ex(("127.0.0.1", port))
        sock.close()
        return result == 0
    except Exception:
        return False


def check_tunnel_healthy(tunnel_url: str) -> bool:
    """Verify tunnel responds via HTTP."""
    if not tunnel_url:
        return False
    try:
        res = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "4", f"{tunnel_url}/api/system"],
            capture_output=True,
            text=True,
        )
        return res.stdout.strip() in ("200", "401", "403")
    except Exception:
        return False


def run_cognitive_dream_consolidation():
    """
    Consolidates memories in memory_store.json:
    - Purges duplicate facts
    - Recalibrates affinity and clusters
    """
    if not os.path.exists(MEMORY_STORE_FILE):
        return

    try:
        with open(MEMORY_STORE_FILE, "r") as f:
            data = json.load(f)

        memories = data.get("memories", [])
        seen = set()
        clean_memories = []
        for m in memories:
            fact = m.get("fact", "").strip().lower()
            if fact and fact not in seen:
                seen.add(fact)
                clean_memories.append(m)

        data["memories"] = clean_memories[:300]
        data["lastConsolidation"] = datetime.now().isoformat()

        with open(MEMORY_STORE_FILE, "w") as f:
            json.dump(data, f, indent=2)
        print(f"[Watchdog/Dream] Consolidación cognitiva completada: {len(clean_memories)} recuerdos activos.")
    except Exception as e:
        print(f"[Watchdog/Dream] Error en consolidación: {e}")


def main_watchdog_loop():
    print("=" * 60)
    print("⚡ J.E.A.R.V.I.S. SELF-HEALING WATCHDOG ACTIVADO ⚡")
    print("=" * 60)

    last_dream_time = 0
    tunnel_url = get_current_tunnel_url() or "https://cabinets-consolidation-terrace-bytes.trycloudflare.com"
    last_local_ip = ""

    while True:
        try:
            local_ip = get_local_ip()

            # 1. Detect IP changes between work (192.168.100.x) and home (192.168.1.x)
            if local_ip != last_local_ip:
                print(f"[Watchdog] Cambio de red detectado: {last_local_ip or 'Inicio'} -> {local_ip}")
                last_local_ip = local_ip
                update_tunnel_info(local_ip, tunnel_url)

            # 2. Check Next.js server (:3000)
            if not check_service_health(3000):
                print("[Watchdog] ALERTA: Next.js :3000 caído. Reiniciando...")
                subprocess.Popen("cd /home/zarate/jearvis && npm run start &", shell=True)
                time.sleep(4)

            # 3. Check Audio Daemon (:8001)
            if not check_service_health(8001):
                print("[Watchdog] ALERTA: Audio Daemon :8001 caído. Reiniciando...")
                subprocess.Popen("cd /home/zarate/jearvis && .venv/bin/python audio_daemon.py &", shell=True)
                time.sleep(2)

            # 4. Check Cloudflare Tunnel
            # Solo si se pidió explícitamente (JARVIS_TUNNEL=1): el túnel expone la laptop a internet
            if os.environ.get("JARVIS_TUNNEL") == "1" and not check_tunnel_healthy(tunnel_url):
                print(f"[Watchdog] Túnel inactivo o expirado ({tunnel_url}). Re-estableciendo enlace...")
                new_url = start_or_restart_tunnel()
                if new_url:
                    tunnel_url = new_url
                    update_tunnel_info(local_ip, tunnel_url)

            # 5. Cognitive Dream cycle every 2 hours
            now = time.time()
            if now - last_dream_time > 7200:
                run_cognitive_dream_consolidation()
                last_dream_time = now

        except Exception as e:
            print(f"[Watchdog] Error en bucle: {e}")

        time.sleep(30)


if __name__ == "__main__":
    main_watchdog_loop()

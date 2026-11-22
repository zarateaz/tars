#!/usr/bin/env bash

# ========================================================
# TARS — NEXT.JS FUTURISTIC AI OS
# ========================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================================"
echo "⚡ INICIANDO TARS (NEXT.JS + DEEPSEEK AI) ⚡"
echo "========================================================"

# --- Seguridad: garantizar STARK_AUTH_TOKEN (sin token, el middleware bloquea todo) ---
touch .env && chmod 600 .env
if ! grep -qE '^STARK_AUTH_TOKEN=.{24,}' .env; then
    sed -i '/^STARK_AUTH_TOKEN=/d' .env
    echo "STARK_AUTH_TOKEN=$(openssl rand -hex 32)" >> .env
    echo "🛡  Token de acceso generado en .env (STARK_AUTH_TOKEN)."
fi
STARK_TOKEN=$(grep -E '^STARK_AUTH_TOKEN=' .env | tail -1 | cut -d= -f2-)
export STARK_AUTH_TOKEN="$STARK_TOKEN"
APP_URL="http://localhost:3000/?token=${STARK_TOKEN}"

# Free ports 3000, 8000, and 8001 if any old instance is running
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 8001/tcp 2>/dev/null || true
sleep 0.4

# Auto-link Tecno Spark 30 via ADB USB tunnel if connected
adb reverse tcp:3000 tcp:3000 2>/dev/null || true
adb reverse tcp:8001 tcp:8001 2>/dev/null || true

# Auto-configure microphone and speaker in PipeWire & ALSA hardware registers
# Calibrates ALSA Capture to 44/63 (+8.25dB clean sweet-spot) and PipeWire to 22% (0.22) with zero Mic Boost clipping
echo "🎙 Calibrando micrófono (ALSA + PipeWire) y altavoces al 100% de fidelidad..."
pactl set-default-source alsa_input.pci-0000_00_1f.3.analog-stereo 2>/dev/null || true
pactl set-source-mute alsa_input.pci-0000_00_1f.3.analog-stereo 0 2>/dev/null || true
pactl set-source-volume alsa_input.pci-0000_00_1f.3.analog-stereo 22% 2>/dev/null || true
wpctl set-mute @DEFAULT_AUDIO_SOURCE@ 0 2>/dev/null || true
wpctl set-volume @DEFAULT_AUDIO_SOURCE@ 0.22 2>/dev/null || true
wpctl set-mute @DEFAULT_AUDIO_SINK@ 0 2>/dev/null || true
wpctl set-volume @DEFAULT_AUDIO_SINK@ 0.85 2>/dev/null || true
pactl set-sink-mute @DEFAULT_SINK@ 0 2>/dev/null || true
pactl set-sink-volume @DEFAULT_SINK@ 85% 2>/dev/null || true

# Túnel público de Cloudflare: ahora es OPCIONAL (JARVIS_TUNNEL=1 ./start_jarvis.sh).
# Antes se abría siempre y dejaba la laptop expuesta a internet.
TUNNEL_PID=""
if [ "${JARVIS_TUNNEL:-0}" = "1" ] && [ -x "./bin/cloudflared" ]; then
    pkill -f "[c]loudflared" 2>/dev/null || true
    rm -f /tmp/jearvis_tunnel.log
    ./bin/cloudflared tunnel --url http://127.0.0.1:3000 >/tmp/jearvis_tunnel.log 2>&1 &
    TUNNEL_PID=$!
fi

# Start Ultra-Low-Latency Audio & Voice Daemon on port 8001
echo "⚡ Iniciando Demonio de Voz y Captura Neural en memoria (127.0.0.1:8001)..."
if [ -f ".venv/bin/python" ]; then
    .venv/bin/python audio_daemon.py &
    DAEMON_PID=$!
else
    python3 audio_daemon.py &
    DAEMON_PID=$!
fi

# Start Autonomous Self-Healing Watchdog & Cognitive Daemon
echo "🛡 Iniciando Guardián Autónomo y Auto-Reparación..."
python3 watchdog_daemon.py &
WATCHDOG_PID=$!

echo "🚀 Levantando servidor Next.js en http://localhost:3000..."
if [ "$1" = "--dev" ]; then
    npm run dev &
else
    if [ ! -f ".next/BUILD_ID" ]; then
        echo "📦 Compilando versión optimizada de producción..."
        npm run build
    fi
    npm run start &
fi
SERVER_PID=$!

# Wait for Next.js server to be ready
echo "⏳ Preparando interfaz futurista..."
for i in {1..70}; do
    if curl -s http://localhost:3000/api/settings > /dev/null; then
        echo "✅ Servidor Next.js y Demonio de Audio en línea."
        break
    fi
    sleep 0.25
done

# Saludo de TARS con su voz (base neural + filtro robótico, igual que el servidor)
if [ -f ".venv/bin/edge-tts" ]; then
    VOICE_CFG=$(grep "^JARVIS_VOICE=" .env 2>/dev/null | cut -d'=' -f2); VOICE_CFG=${VOICE_CFG:-es-MX-JorgeNeural}
    RATE_CFG=$(grep "^JARVIS_VOICE_RATE=" .env 2>/dev/null | cut -d'=' -f2); RATE_CFG=${RATE_CFG:--6%}
    PITCH_CFG=$(grep "^JARVIS_VOICE_PITCH=" .env 2>/dev/null | cut -d'=' -f2); PITCH_CFG=${PITCH_CFG:--12Hz}
    TARS_FILTER="highpass=f=110,lowpass=f=6500,aecho=0.8:0.55:7|12:0.28|0.18,equalizer=f=220:t=q:w=1:g=3,equalizer=f=1900:t=q:w=1.4:g=3.5,acompressor=threshold=-20dB:ratio=4:attack=5:release=80:makeup=2,volume=1.3,alimiter=limit=0.89"
    WELCOME="/tmp/tars_welcome_${VOICE_CFG}_${PITCH_CFG}.mp3"
    (
        if [ ! -s "$WELCOME" ]; then
            .venv/bin/edge-tts --voice "$VOICE_CFG" --rate="$RATE_CFG" --pitch="$PITCH_CFG" --text "TARS en línea. Todos los sistemas operativos. Configuración de humor al setenta y cinco por ciento." --write-media /tmp/tars_welcome_raw.mp3 2>/dev/null \
              && ffmpeg -y -loglevel error -i /tmp/tars_welcome_raw.mp3 -af "$TARS_FILTER" "$WELCOME" 2>/dev/null \
              || cp /tmp/tars_welcome_raw.mp3 "$WELCOME" 2>/dev/null
        fi
        mpv --no-video --really-quiet "$WELCOME" 2>/dev/null
    ) &
fi

# Launch as Standalone Desktop Application Window (Ventana normal fluida, SIN pantalla completa)
echo "🖥 Abriendo aplicación de escritorio en ventana normal (sin pantalla completa)..."
if which google-chrome-stable >/dev/null 2>&1; then
    google-chrome-stable --user-data-dir=/tmp/jarvis_chrome_profile --disable-features=Vulkan --app="$APP_URL" --window-size=1600,920 --autoplay-policy=no-user-gesture-required &
elif [ -f ".venv/bin/python" ] && [ -f "launcher_app.py" ]; then
    .venv/bin/python launcher_app.py "$APP_URL" &
else
    xdg-open "$APP_URL" &
fi

echo ""
echo "========================================================"
echo "✨ TARS ACTIVO EN http://localhost:3000 ✨"
echo "Presiona CTRL+C para detener el servidor"
echo "========================================================"

trap "echo 'Apagando TARS..'; kill $SERVER_PID $DAEMON_PID $TUNNEL_PID $WATCHDOG_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait $SERVER_PID

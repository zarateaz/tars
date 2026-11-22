# ==============================================================================
# J.E.A.R.V.I.S. // NÚCLEO EN LA NUBE (imagen de producción)
#   - Next.js (HUD + API + agente DeepSeek)
#   - edge-tts (voz neural)
#   - Sin acceso al escritorio: las acciones físicas van al satélite de la laptop
# ==============================================================================

# ---------- 1. Build ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- 2. Runtime ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    JARVIS_MODE=cloud \
    JARVIS_ALLOW_CLI=false

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv ffmpeg curl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# Voz neural (tts.ts y speechQueue.ts buscan /app/.venv/bin/edge-tts)
RUN python3 -m venv /app/.venv \
 && /app/.venv/bin/pip install --no-cache-dir edge-tts

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Todo el estado vive en /app/data (volumen). El código usa rutas en /app,
# así que enlazamos cada archivo al volumen.
ENV JARVIS_STATE_FILES="memory_store.json financial_ledger.json inbox_notifications.json \
phone_telemetry.json phone_commands.json satellite_commands.json satellite_status.json \
reminders.json reminders_announced.json notif_announced.json home_welcome_state.json \
sentinel_trap.json autonomous_triggers.json"
RUN mkdir -p /app/data/audio_cache \
 && for f in $JARVIS_STATE_FILES; do ln -s /app/data/$f /app/$f; done \
 && ln -s /app/data/audio_cache /app/audio_cache \
 && ln -s /app/data/.env /app/.env \
 && chmod +x /usr/local/bin/docker-entrypoint.sh \
 && chown -R node:node /app/data /app/public /app/.next

USER node
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]

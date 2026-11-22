#!/bin/sh
set -e

if [ -z "$STARK_AUTH_TOKEN" ]; then
  echo "❌ STARK_AUTH_TOKEN vacío. Jarvis no arranca sin token en la nube." >&2
  echo "   Genera uno con:  openssl rand -hex 32" >&2
  exit 1
fi
if [ ${#STARK_AUTH_TOKEN} -lt 24 ]; then
  echo "❌ STARK_AUTH_TOKEN demasiado corto (mínimo 24 caracteres)." >&2
  exit 1
fi

mkdir -p /app/data/audio_cache

exec "$@"

#!/usr/bin/env bash
# ==============================================================================
# TARS // Instalación en un VPS que YA tiene nginx + certbot (ej. junto a otra web)
#
#   sudo bash deploy/vps_setup.sh [dominio]
#
# - Construye y levanta TARS en Docker escuchando SOLO en 127.0.0.1:${TARS_PORT:-3300}
# - Añade un server block de nginx SOLO para ese dominio (no toca los demás sitios)
# - Obtiene certificado HTTPS con certbot (webroot, sin modificar otras configs)
# Dominio por defecto: tars.<IP-con-guiones>.sslip.io (no requiere tocar DNS)
# ==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
[ "$EUID" -eq 0 ] || { echo "Ejecuta con sudo: sudo bash deploy/vps_setup.sh"; exit 1; }

[ -f .env ] || { echo "❌ Falta $APP_DIR/.env (DEEPSEEK_API_KEY y STARK_AUTH_TOKEN)"; exit 1; }
PORT=$(grep -E '^TARS_PORT=' .env | cut -d= -f2-); PORT=${PORT:-3300}
IP=$(curl -fsS -4 https://ifconfig.me 2>/dev/null || ip -4 route get 1.1.1.1 | awk '{print $7; exit}')
DOMAIN="${1:-tars.${IP//./-}.sslip.io}"
CONF="/etc/nginx/conf.d/tars.conf"
ACME="/var/www/tars-acme"

echo "⚡ TARS → https://$DOMAIN  (interno 127.0.0.1:$PORT)"

if ss -ltnH | grep -q ":$PORT "; then
  if ! docker ps --format '{{.Names}}' | grep -qx tars-core; then
    echo "❌ El puerto $PORT ya está en uso por otro servicio. Cambia TARS_PORT en .env"; exit 1
  fi
fi

echo "🐳 1/4 Construyendo y levantando el contenedor..."
docker compose up -d --build jearvis
for i in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null || { echo "❌ TARS no arrancó. Revisa: docker compose logs jearvis"; exit 1; }
echo "   ✅ Contenedor sano"

echo "🌐 2/4 nginx (solo HTTP para validar el certificado)..."
mkdir -p "$ACME"
cat > "$CONF" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root $ACME; }
    location / { return 301 https://\$host\$request_uri; }
}
NGINX
nginx -t && systemctl reload nginx

echo "🔒 3/4 Certificado HTTPS..."
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  certbot certonly --webroot -w "$ACME" -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
fi

echo "🌐 4/4 nginx HTTPS → 127.0.0.1:$PORT..."
cat > "$CONF" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root $ACME; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name $DOMAIN;
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    client_max_body_size 25m;          # fotos y notas de voz del teléfono
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header CF-Connecting-IP \$remote_addr;
        proxy_read_timeout 120s;      # la IA puede tardar
        proxy_buffering off;
    }
}
NGINX
if nginx -t; then
  systemctl reload nginx
else
  echo "❌ nginx -t falló; restaurando sin HTTPS"; rm -f "$CONF"; systemctl reload nginx; exit 1
fi

sleep 1
if curl -fsS "https://$DOMAIN/api/health" >/dev/null; then
  echo ""
  echo "✅ TARS ACTIVO: https://$DOMAIN"
  echo "   Token: el STARK_AUTH_TOKEN de $APP_DIR/.env"
  echo "   Teléfono: RED → Servidor principal = https://$DOMAIN"
else
  echo "⚠️ Instalado, pero https://$DOMAIN no respondió todavía. Revisa: nginx -t; docker compose logs jearvis"
fi

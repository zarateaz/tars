#!/usr/bin/env bash
# ==============================================================================
# J.E.A.R.V.I.S. // Despliegue en VPS con Docker
#   ./deploy_vps.sh            → núcleo en 127.0.0.1:3000
#   ./deploy_vps.sh https      → + Caddy (HTTPS automático, necesita JARVIS_DOMAIN)
#   ./deploy_vps.sh tunnel     → + Cloudflare Tunnel (necesita CLOUDFLARE_TUNNEL_TOKEN)
# ==============================================================================
set -euo pipefail
cd "$(dirname "$0")"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
SUDO=""; [ "$EUID" -ne 0 ] && SUDO="sudo"
PROFILE="${1:-}"

echo -e "${CYAN}⚡ Desplegando J.E.A.R.V.I.S. (núcleo en la nube)${NC}"

if ! command -v docker >/dev/null; then
  echo -e "${YELLOW}Instalando Docker...${NC}"
  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO systemctl enable --now docker
fi

# --- .env: nunca se guardan claves dentro de este script ---
[ -f .env ] || cp .env.example .env

get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- ; }
set_kv() {
  if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

if [ -z "$(get DEEPSEEK_API_KEY)" ]; then
  read -rsp "🔑 Pega tu DEEPSEEK_API_KEY: " KEY; echo
  set_kv DEEPSEEK_API_KEY "$KEY"
fi
if [ -z "$(get STARK_AUTH_TOKEN)" ]; then
  set_kv STARK_AUTH_TOKEN "$(openssl rand -hex 32)"
  echo -e "${GREEN}🛡  STARK_AUTH_TOKEN generado en .env${NC}"
fi
set_kv JARVIS_MODE cloud
chmod 600 .env

if [ "$PROFILE" = "https" ] && [ -z "$(get JARVIS_DOMAIN)" ]; then
  read -rp "🌐 Dominio (ej. jarvis.midominio.com): " DOM; set_kv JARVIS_DOMAIN "$DOM"
fi
if [ "$PROFILE" = "tunnel" ] && [ -z "$(get CLOUDFLARE_TUNNEL_TOKEN)" ]; then
  read -rsp "☁️  CLOUDFLARE_TUNNEL_TOKEN: " TT; echo; set_kv CLOUDFLARE_TUNNEL_TOKEN "$TT"
fi

ARGS=()
[ -n "$PROFILE" ] && ARGS=(--profile "$PROFILE")

$SUDO docker compose "${ARGS[@]}" up -d --build

echo -e "${YELLOW}⏳ Esperando al núcleo...${NC}"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$(get TARS_PORT || true)$( [ -z "$(get TARS_PORT)" ] && echo 3300)/api/health" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ J.E.A.R.V.I.S. activo.${NC}"
    case "$PROFILE" in
      https)  echo "🌐 https://$(get JARVIS_DOMAIN)" ;;
      tunnel) echo "🌐 La URL es el hostname que configuraste en Cloudflare." ;;
      *)      echo "🔒 Solo en 127.0.0.1:3300. Usa: ssh -L 3300:127.0.0.1:3300 usuario@vps" ;;
    esac
    echo "🔑 Inicia sesión con el STARK_AUTH_TOKEN de .env (no lo compartas)."
    exit 0
  fi
  sleep 2
done
echo -e "${RED}⚠️ No respondió. Revisa: docker compose logs -f jearvis${NC}"
exit 1

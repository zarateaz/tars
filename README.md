# ⚡ J.E.A.R.V.I.S. — asistente con voz, HUD y control de escritorio

Next.js 15 + DeepSeek (agente con herramientas) + edge-tts. Puede correr en la
**laptop** (control directo del escritorio) o en un **VPS con Docker**, con un
pequeño agente en la laptop que ejecuta las acciones físicas.

## Arquitectura

```
 Navegador / APK Android ──HTTPS + token──►  NÚCLEO (Next.js)
                                             ├─ src/app/page.tsx         HUD
                                             ├─ src/app/api/command      cerebro: intents locales → DeepSeek
                                             ├─ src/lib/deepseek.ts      agente con tools (run_cli, write_file, open_app, tv_control…)
                                             ├─ src/lib/system.ts        acciones del SO (pactl, apps, bloqueo, bash)
                                             ├─ src/lib/tvControl.ts     Smart TV por ADB + Wake-on-LAN
                                             ├─ src/lib/memory.ts        memoria persistente (memory_store.json)
                                             └─ src/middleware.ts        🔒 autenticación de TODO
                                                     │
                       JARVIS_MODE=cloud: acciones físicas → cola /api/satellite
                                                     ▼
                     laptop_satellite.py (en la laptop, conexión saliente, lista blanca)
                       → apps, volumen, multimedia, bloqueo, captura, TV por ADB/WoL
```

Demonios solo locales: `audio_daemon.py` (micrófono + STT, :8001) y `watchdog_daemon.py`.

## Seguridad (importante)

* **Todo** (páginas y `/api/*`) exige `STARK_AUTH_TOKEN`. Sin token configurado, Jarvis no responde.
  Se acepta como cookie (tras `/login`), header `x-stark-token`, `Authorization: Bearer` o `?token=` en el primer acceso.
* En la nube `JARVIS_ALLOW_CLI=false`: el agente no puede ejecutar bash.
* El satélite no tiene acción `bash`; solo una lista blanca de acciones.
* El túnel de Cloudflare en la laptop es opcional: `JARVIS_TUNNEL=1 ./start_jarvis.sh`.

## Uso local (laptop)

```bash
./start_jarvis.sh        # genera STARK_AUTH_TOKEN en .env si falta y abre el HUD ya autenticado
```

## Despliegue en VPS

```bash
# en el VPS
git clone <repo> jearvis && cd jearvis
./deploy_vps.sh https     # Caddy + HTTPS automático (DNS A del dominio → IP del VPS, puertos 80/443)
# o: ./deploy_vps.sh tunnel  (Cloudflare Tunnel con nombre, sin abrir puertos)
# o: ./deploy_vps.sh         (solo 127.0.0.1:3000, acceso por ssh -L 3000:127.0.0.1:3000)
```

Los datos (memoria, recordatorios, finanzas, audio) viven en el volumen Docker `jearvis-data`.
Copia de seguridad: `docker run --rm -v jearvis_jearvis-data:/d -v $PWD:/b alpine tar czf /b/jearvis-data.tgz -C /d .`

Para migrar tu memoria actual: `docker cp memory_store.json jearvis-core:/app/data/`.

## Satélite en la laptop

```bash
cp satellite.env.example satellite.env   # URL del VPS + mismo STARK_AUTH_TOKEN
mkdir -p ~/.config/systemd/user && cp deploy/jearvis-satellite.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now jearvis-satellite
journalctl --user -u jearvis-satellite -f
```

## APK Android

`python3 build_mobile_apk.py` (ya no incrusta la API key de DeepSeek). La primera vez que
el servidor responda 401, la app pide el token y lo guarda en el teléfono.

## Qué no funciona en el VPS

Micrófono del servidor (`/api/record-mic`), control del mouse por socket de Hyprland
(`/api/remote-input`), portapapeles y cámara de la laptop: dependen del escritorio local.
La voz en el navegador/teléfono sí funciona (el audio se genera en el servidor).

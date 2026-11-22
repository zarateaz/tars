#!/bin/bash
SERIAL="13283254CK001314"
APK="/home/zarate/jearvis/JearvisZarateMobile.apk"
LOG="/tmp/jearvis_apk_install.log"

echo "[$(date)] Watcher iniciado esperando $SERIAL..." >> "$LOG"

while true; do
  if adb devices | grep -E "^${SERIAL}\s+device" >/dev/null; then
    echo "[$(date)] $SERIAL detectado. Habilitando adb tcpip 5555..." >> "$LOG"
    adb -s "$SERIAL" tcpip 5555 >> "$LOG" 2>&1 || true
    echo "[$(date)] Instalando $APK..." >> "$LOG"
    adb -s "$SERIAL" install -r -g "$APK" >> "$LOG" 2>&1
    adb -s "$SERIAL" reverse tcp:3000 tcp:3000 >> "$LOG" 2>&1 || true
    adb -s "$SERIAL" shell am start -n com.zarate.jearvis/.MainActivity >> "$LOG" 2>&1 || true
    echo "[$(date)] APK instalada exitosamente en $SERIAL!" >> "$LOG"
    sleep 2
    adb connect 192.168.1.67:5555 >> "$LOG" 2>&1 || true
    break
  fi
  sleep 1
done

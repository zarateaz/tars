#!/usr/bin/env python3
"""
J.E.A.R.V.I.S. // ZARATE STARK MARK VIII — NATIVE ANDROID APK COMPILER
Compiles /home/zarate/jearvis/android-apk into /home/zarate/jearvis/JearvisZarateMobile.apk
using aapt2, javac, d8, zipalign, and apksigner.
"""

import os
import shutil
import subprocess

BASE_DIR = "/home/zarate/jearvis/android-apk"
BUILD_DIR = "/tmp/jearvis_apk_build"
OUT_APK = "/home/zarate/jearvis/JearvisZarateMobile.apk"
PUB_APK = "/home/zarate/jearvis/public/JearvisZarateMobile.apk"
ANDROID_JAR = "/opt/android-sdk/platforms/android-35/android.jar"
KEYSTORE = os.path.join(BASE_DIR, "zarate_jearvis.keystore")

# Read DeepSeek API key from /home/zarate/jearvis/.env for offline mobile autonomy
DEEPSEEK_KEY = ""
env_path = "/home/zarate/jearvis/.env"
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith("DEEPSEEK_API_KEY="):
                DEEPSEEK_KEY = line.strip().split("=", 1)[1].strip().strip('"').strip("'")

if os.path.exists(BUILD_DIR):
    shutil.rmtree(BUILD_DIR)

shutil.copytree(BASE_DIR, BUILD_DIR, ignore=shutil.ignore_patterns("*.bak", "*.keystore"))

# Inject DeepSeek key into staged hud.html only
staged_hud = os.path.join(BUILD_DIR, "assets", "hud.html")
with open(staged_hud, "r", encoding="utf-8") as f:
    hud_content = f.read()
# SEGURIDAD: ya NO se incrusta la API key de DeepSeek en la APK (cualquiera que
# descargue la APK podía extraerla). El teléfono habla con el servidor Jarvis.
hud_content = hud_content.replace("__DEEPSEEK_KEY__", "")
with open(staged_hud, "w", encoding="utf-8") as f:
    f.write(hud_content)

print("1. Compiling Android resources with aapt2...")
subprocess.run(["aapt2", "compile", "--dir", f"{BUILD_DIR}/res", "-o", f"{BUILD_DIR}/res.zip"], check=True)
subprocess.run([
    "aapt2", "link",
    "-o", f"{BUILD_DIR}/base.apk",
    "-I", ANDROID_JAR,
    "--manifest", f"{BUILD_DIR}/AndroidManifest.xml",
    "-A", f"{BUILD_DIR}/assets",
    "--java", f"{BUILD_DIR}/src",
    f"{BUILD_DIR}/res.zip",
], check=True)

print("2. Compiling Java classes with javac...")
os.makedirs(f"{BUILD_DIR}/classes", exist_ok=True)
java_files = []
for root, _, files in os.walk(f"{BUILD_DIR}/src"):
    for fn in files:
        if fn.endswith(".java"):
            java_files.append(os.path.join(root, fn))

subprocess.run([
    "javac",
    "-source", "11",
    "-target", "11",
    "-cp", ANDROID_JAR,
    "-d", f"{BUILD_DIR}/classes",
    *java_files,
], check=True)

print("3. Converting bytecode to DEX with d8...")
class_files = []
for root, _, files in os.walk(f"{BUILD_DIR}/classes"):
    for fn in files:
        if fn.endswith(".class"):
            class_files.append(os.path.join(root, fn))

subprocess.run([
    "d8",
    "--min-api", "29",
    "--lib", ANDROID_JAR,
    "--output", BUILD_DIR,
    *class_files,
], check=True)

subprocess.run(["zip", "-j", f"{BUILD_DIR}/base.apk", f"{BUILD_DIR}/classes.dex"], check=True)

if not os.path.exists(KEYSTORE):
    print("4. Creating persistent Zarate Stark keystore...")
    subprocess.run([
        "keytool", "-genkeypair",
        "-keystore", KEYSTORE,
        "-storepass", "android",
        "-keypass", "android",
        "-alias", "zaratekey",
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-dname", "CN=Zarate, OU=StarkCyberpunk, O=ZarateOS, L=Lima, ST=Lima, C=PE",
    ], check=True)

if os.path.exists(OUT_APK):
    os.remove(OUT_APK)

print("5. Zipaligning & signing APK...")
subprocess.run(["zipalign", "-p", "-f", "4", f"{BUILD_DIR}/base.apk", OUT_APK], check=True)
subprocess.run([
    "apksigner", "sign",
    "--ks", KEYSTORE,
    "--ks-pass", "pass:android",
    "--key-pass", "pass:android",
    "--v1-signing-enabled", "true",
    "--v2-signing-enabled", "true",
    "--v3-signing-enabled", "true",
    OUT_APK,
], check=True)

os.makedirs(os.path.dirname(PUB_APK), exist_ok=True)
shutil.copy2(OUT_APK, PUB_APK)
print("SUCCESS! Built:", OUT_APK, "Size:", os.path.getsize(OUT_APK), "bytes")

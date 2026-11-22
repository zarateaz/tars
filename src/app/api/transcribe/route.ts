import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function POST(req: Request) {
  const tmpInput = path.join("/tmp", `jarvis_in_${Date.now()}_${Math.random().toString(36).slice(2)}.webm`);
  const tmpWav = `${tmpInput}.wav`;

  try {
    const formData = await req.formData();
    const file = formData.get("audio") as Blob | null;

    if (!file) {
      return NextResponse.json({ success: false, text: "", error: "No audio file provided" });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 800) {
      return NextResponse.json({ success: false, text: "" });
    }

    fs.writeFileSync(tmpInput, buffer);

    // Convert to 16kHz mono WAV for high accuracy Speech Recognition
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      tmpInput,
      "-ar",
      "16000",
      "-ac",
      "1",
      tmpWav,
    ]);

    const venvPython = path.join(process.cwd(), ".venv", "bin", "python");
    const pyBin = fs.existsSync(venvPython) ? venvPython : "python3";

    const pyScript = `
import sys
import speech_recognition as sr

wav_path = sys.argv[1]
r = sr.Recognizer()
try:
    with sr.AudioFile(wav_path) as source:
        audio = r.record(source)
    # Recognize with Latin American Spanish priority
    for lang in ["es-PE", "es-419", "es-ES", "es-MX"]:
        try:
            print(r.recognize_google(audio, language=lang))
            sys.exit(0)
        except sr.UnknownValueError:
            continue
        except Exception:
            break
    print("")
except Exception:
    print("")
`;

    const { stdout } = await execFileAsync(pyBin, ["-c", pyScript, tmpWav], { timeout: 15000 });
    const text = stdout.trim();

    return NextResponse.json({ success: Boolean(text), text });
  } catch (err) {
    return NextResponse.json({ success: false, text: "", error: String(err) });
  } finally {
    try {
      if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
      if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav);
    } catch {
      // ignore cleanup
    }
  }
}

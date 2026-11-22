import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { savePhonePhoto, openOnLaptop } from "@/lib/phoneLink";
import { askDeepSeek } from "@/lib/deepseek";
import { synthesizeSpeechQueue } from "@/lib/tts";

const execFileAsync = promisify(execFile);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

async function runOcr(file: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/tesseract", [file, "stdout", "-l", "spa+eng"], {
      timeout: 15_000,
    });
    return stdout.trim();
  } catch {
    try {
      const { stdout } = await execFileAsync("/usr/bin/tesseract", [file, "stdout"], {
        timeout: 15_000,
      });
      return stdout.trim();
    } catch {
      return "";
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.image || typeof body.image !== "string") {
      return NextResponse.json({ success: false, error: "Sin imagen" }, { status: 400 });
    }
    const file = savePhonePhoto(body.image);
    if (body.open !== false && !body.analyze) {
      openOnLaptop(file);
    }

    if (body.analyze) {
      const ocrText = await runOcr(file);
      const userPrompt = String(
        body.prompt ||
          "Analiza esta imagen capturada desde mi cámara TARS, dime qué contiene o resuelve el problema que aparece."
      ).trim();

      const fullPrompt = ocrText
        ? `${userPrompt}\n\n[TEXTO DETECTADO POR VISOR ÓPTICO OCR]:\n"""\n${ocrText}\n"""`
        : `${userPrompt}\n\n[NOTA DEL VISOR ÓPTICO]: No se detectó texto legible claro mediante OCR en la captura; informa brevemente al usuario y pídele acercar o enfocar mejor si buscaba leer texto.`;

      const ds = await askDeepSeek(fullPrompt, "jarvis");
      const audioUrls = ds.reply ? await synthesizeSpeechQueue(ds.reply) : [];
      return NextResponse.json({
        success: true,
        path: file,
        ocrText,
        reply: ds.reply,
        audioUrls,
      });
    }

    return NextResponse.json({ success: true, path: file });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getSettings } from "@/lib/config";
import { openOnLaptop } from "@/lib/phoneLink";

const execFileAsync = promisify(execFile);

const AIRDROP_DIR = path.join(os.homedir(), "Descargas", "StarkAirDrop");

function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "apuntes-stark"
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawNotes = String(body.notes || body.text || "").trim();
    const topic = String(body.topic || body.course || "Clase Magistral SENATI").trim();

    if (!rawNotes && !body.topic) {
      return NextResponse.json({ success: false, error: "Contenido de apuntes vacío" }, { status: 400 });
    }

    const settings = getSettings();
    let structuredMarkdown = "";

    if (settings.deepseekApiKey) {
      try {
        const res = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.deepseekApiKey}`,
          },
          body: JSON.stringify({
            model: settings.deepseekModel || "deepseek-chat",
            messages: [
              {
                role: "system",
                content:
                  "Eres TARS SCRIBE, el transcriptor y sintetizador neuronal de TARS Transforma las notas o audios de clases en apuntes académicos de élite en español. Estructura con '## ' para subtítulos, '- ' para viñetas y conceptos clave, y '### ' para desgloses técnicos. NUNCA uses bloques de código con ```.",
              },
              {
                role: "user",
                content: `Organiza y profundiza los siguientes apuntes de clase sobre "${topic}":\n\n"""\n${rawNotes || topic}\n"""\n\nEstructura en: 1. Resumen Ejecutivo, 2. Conceptos Clave & Definiciones, 3. Procedimientos Técnicos / Fórmulas, 4. Puntos Críticos de Evaluación, 5. Conclusión.`,
              },
            ],
            max_tokens: 1600,
            temperature: 0.4,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          structuredMarkdown = String(data.choices?.[0]?.message?.content || "").trim();
        }
      } catch {
        /* fallback */
      }
    }

    if (!structuredMarkdown) {
      structuredMarkdown = [
        "## Resumen Ejecutivo de la Sesión",
        `Apuntes sintetizados sobre "${topic}" generados por el transcriptor neuronal TARS Scribe.`,
        "",
        "## Conceptos Clave & Fundamentos",
        rawNotes ? `- ${rawNotes}` : "- Fundamentos técnicos del curso analizados en sesión.",
        "- Aplicaciones prácticas en el entorno de ingeniería.",
        "",
        "## Procedimientos Técnicos",
        "- Metodología de ejecución paso a paso.",
        "- Verificación de tolerancias y parámetros operativos.",
        "",
        "## Puntos Críticos de Evaluación",
        "- Criterios de examen y aspectos prioritarios a recordar.",
        "",
        "## Conclusión",
        "Material de estudio listo para repaso y preparación académica.",
      ].join("\n");
    }

    if (!fs.existsSync(AIRDROP_DIR)) {
      fs.mkdirSync(AIRDROP_DIR, { recursive: true });
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const fileName = `apuntes_${slugify(topic)}_${stamp}.pdf`;
    const outPath = path.join(AIRDROP_DIR, fileName);
    const payloadPath = path.join(os.tmpdir(), `scribe_payload_${Date.now()}.json`);

    fs.writeFileSync(
      payloadPath,
      JSON.stringify(
        {
          title: `Apuntes Académicos: ${topic}`,
          topic,
          content: structuredMarkdown,
          author: "Zarate // TARS Scribe Academic",
          outPath,
        },
        null,
        2
      ),
      "utf-8"
    );

    const pyBin = fs.existsSync(path.join(process.cwd(), ".venv", "bin", "python"))
      ? path.join(process.cwd(), ".venv", "bin", "python")
      : "python3";

    await execFileAsync(pyBin, [path.join(process.cwd(), "render_stark_pdf.py"), payloadPath], {
      timeout: 15_000,
    });

    try {
      fs.unlinkSync(payloadPath);
    } catch {
      /* ignore */
    }

    if (body.openOnPc !== false) {
      openOnLaptop(outPath);
    }

    return NextResponse.json({
      success: true,
      fileName,
      filePath: outPath,
      downloadUrl: `/api/clipboard?download=${encodeURIComponent(fileName)}`,
      summary: `Apuntes '${fileName}' sintetizados y listos en TARS AirDrop.`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

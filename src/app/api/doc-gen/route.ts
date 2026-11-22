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
      .slice(0, 48) || "documento-stark"
  );
}

async function generateReportText(topic: string): Promise<string> {
  const settings = getSettings();
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
                "Eres un redactor técnico experto de TARS Redacta informes estructurados en español de 350 a 500 palabras. Usa subtítulos claros prefijados con '## ', viñetas con '- ', y una conclusión final. NO uses bloques de código ni delimitadores ```.",
            },
            {
              role: "user",
              content: `Genera un informe técnico profesional y bien estructurado en español sobre: "${topic}". Incluye introducción ejecutiva, puntos clave técnicos, recomendaciones prácticas y conclusión.`,
            },
          ],
          max_tokens: 1400,
          temperature: 0.5,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const content = String(data.choices?.[0]?.message?.content || "").trim();
        if (content) return content;
      }
    } catch {
      /* fallback below */
    }
  }

  return [
    "## Introducción Ejecutiva",
    `Este informe técnico resume los aspectos fundamentales sobre "${topic}", generado de forma autónoma por el núcleo TARS Mark X.`,
    "",
    "## Puntos Clave de Análisis",
    "- Definición del alcance, arquitectura y objetivos principales del tema solicitado.",
    "- Identificación de riesgos críticos, controles preventivos y mejores prácticas de ingeniería.",
    "- Monitoreo continuo e integración con herramientas de automatización.",
    "",
    "## Conclusión",
    "La implementación disciplinada de estos lineamientos garantiza alta disponibilidad, seguridad y trazabilidad en el entorno TARS.",
  ].join("\n");
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const topic = String(body.topic || "").trim();
    if (!topic) {
      return NextResponse.json({ success: false, error: "Tema del PDF vacío" }, { status: 400 });
    }

    if (!fs.existsSync(AIRDROP_DIR)) {
      fs.mkdirSync(AIRDROP_DIR, { recursive: true });
    }

    const content = await generateReportText(topic);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const fileName = `${slugify(topic)}_${stamp}.pdf`;
    const outPath = path.join(AIRDROP_DIR, fileName);
    const payloadPath = path.join(os.tmpdir(), `jarvis_doc_payload_${Date.now()}.json`);

    fs.writeFileSync(
      payloadPath,
      JSON.stringify(
        {
          title: topic.charAt(0).toUpperCase() + topic.slice(1),
          topic,
          content,
          author: "Zarate // TARS Mark X",
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
      summary: `Documento PDF '${fileName}' generado y listo en TARS AirDrop.`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

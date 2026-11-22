// Página de acceso mínima (HTML plano, sin depender del bundle del HUD).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = (url.searchParams.get("next") || "/").replace(/[^\w\-/.]/g, "");
  const error = url.searchParams.get("error") === "1";

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TARS // Acceso</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05080f;color:#cfefff;font-family:ui-monospace,monospace}
  form{width:min(360px,90vw);padding:28px;border:1px solid #0ff3;border-radius:14px;background:#0a1220;box-shadow:0 0 40px #0ff2}
  h1{font-size:15px;letter-spacing:.2em;margin:0 0 18px;color:#5ff}
  input{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #0ff4;background:#030610;color:#fff;font:inherit}
  button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:8px;background:#0cf;color:#012;font-weight:700;cursor:pointer}
  .err{color:#ff6b6b;font-size:13px;margin-top:10px}
</style></head>
<body><form method="post" action="/api/auth">
  <h1>⚡ TARS // ACCESO</h1>
  <input type="password" name="token" placeholder="Token TARS" autofocus autocomplete="current-password" required>
  <input type="hidden" name="next" value="${next}">
  <button type="submit">Entrar</button>
  ${error ? '<div class="err">Token incorrecto.</div>' : ""}
</form></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

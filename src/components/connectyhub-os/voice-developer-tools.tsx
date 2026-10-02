'use client';

import { useState } from "react";
import { Copy, Webhook } from "lucide-react";

// Developer tools per Voice project: signed webhooks for asynchronous operations and
// ready-to-run examples of the public API (single, streaming, timestamps, e-book, usage).

const field = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:outline-2 focus:outline-blue-500";
const small = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50";
const base = "https://www.connectyhub.com.br/api/v1/voice";

const examples: Record<string, { title: string; curl: string; js: string; python: string }> = {
  single: {
    title: "Gerar áudio (até 4.800 caracteres)",
    curl: `curl -X POST ${base}/generations \\\n  -H "Authorization: Bearer $CONNECTYHUB_VOICE_KEY" \\\n  -H "Idempotency-Key: pedido-123" -H "Content-Type: application/json" \\\n  -d '{"text":"Olá!","voice_id":"VOICE_ID","model_id":"eleven_flash_v2_5","output_format":"mp3_44100_128","voice_settings":{"speed":1.05}}'`,
    js: `const res = await fetch("${base}/generations", {\n  method: "POST",\n  headers: { Authorization: \`Bearer \${process.env.CONNECTYHUB_VOICE_KEY}\`, "Idempotency-Key": "pedido-123", "Content-Type": "application/json" },\n  body: JSON.stringify({ text: "Olá!", voice_id: "VOICE_ID", model_id: "eleven_flash_v2_5" }),\n});\nconst receipt = await res.json(); // receipt.audio.path`,
    python: `import os, requests\nr = requests.post("${base}/generations",\n  headers={"Authorization": f"Bearer {os.environ['CONNECTYHUB_VOICE_KEY']}", "Idempotency-Key": "pedido-123"},\n  json={"text": "Olá!", "voice_id": "VOICE_ID", "model_id": "eleven_flash_v2_5"})\nprint(r.json()["audio"])`,
  },
  stream: {
    title: "Streaming (o áudio começa antes de terminar)",
    curl: `curl -X POST ${base}/generations/stream \\\n  -H "Authorization: Bearer $CONNECTYHUB_VOICE_KEY" \\\n  -H "Idempotency-Key: fala-001" -H "Content-Type: application/json" \\\n  -d '{"text":"Olá, como posso ajudar?","voice_id":"VOICE_ID","model_id":"eleven_flash_v2_5","output_format":"ulaw_8000"}' \\\n  --output fala.ulaw`,
    js: `const res = await fetch("${base}/generations/stream", { method: "POST", headers: { Authorization: \`Bearer \${key}\`, "Idempotency-Key": "fala-001", "Content-Type": "application/json" },\n  body: JSON.stringify({ text: "Olá!", voice_id: "VOICE_ID", model_id: "eleven_flash_v2_5" }) });\nconst reader = res.body.getReader(); // toque cada pedaço assim que chegar\nconst generationId = res.headers.get("X-Generation-Id");`,
    python: `with requests.post("${base}/generations/stream", headers=headers, json=payload, stream=True) as r:\n    for chunk in r.iter_content(4096):\n        player.write(chunk)`,
  },
  timestamps: {
    title: "Áudio com marcação de tempo por caractere",
    curl: `curl -X POST ${base}/generations \\\n  -H "Authorization: Bearer $CONNECTYHUB_VOICE_KEY" -H "Idempotency-Key: legenda-1" -H "Content-Type: application/json" \\\n  -d '{"text":"Bem-vindo!","voice_id":"VOICE_ID","with_timestamps":true}'\n# depois: GET ${base}/generations/{id}/alignment`,
    js: `// with_timestamps: true -> receipt.alignment.path traz o JSON de alinhamento`,
    python: `# with_timestamps=True -> GET /generations/{id}/alignment`,
  },
  book: {
    title: "Texto longo / e-book (até 240.000 caracteres)",
    curl: `curl -X POST ${base}/operations/quote -H "Authorization: Bearer $CONNECTYHUB_VOICE_KEY" -H "Content-Type: application/json" \\\n  -d '{"operation":"long_tts","voice_id":"VOICE_ID","text":"..."}'\ncurl -X POST ${base}/operations -H "Authorization: Bearer $CONNECTYHUB_VOICE_KEY" \\\n  -H "Idempotency-Key: livro-1" -H "X-Max-Credits: 5000" -H "Content-Type: application/json" \\\n  -d '{"operation":"long_tts","voice_id":"VOICE_ID","text":"..."}'`,
    js: `// 1) /operations/quote  2) /operations (202)  3) aguarde o webhook ou GET /operations/{id}\n// 4) GET /operations/{id}/result -> um único MP3`,
    python: `# quote -> operations -> webhook voice.operation.completed -> /operations/{id}/result`,
  },
  usage: {
    title: "Uso e saldo",
    curl: `curl ${base}/usage?days=30 -H "Authorization: Bearer $CONNECTYHUB_VOICE_KEY"`,
    js: `const usage = await fetch("${base}/usage?days=30", { headers: { Authorization: \`Bearer \${key}\` } }).then(r => r.json());\n// usage.wallet.available_credits`,
    python: `requests.get("${base}/usage", params={"days": 30}, headers=headers).json()["wallet"]`,
  },
};

const verify = `// Conferir a assinatura do webhook (Node)\nimport crypto from "node:crypto";\nfunction valid(header, rawBody, secret) {\n  const parts = Object.fromEntries(header.split(",").map(p => p.split("=")));\n  const expected = crypto.createHmac("sha256", secret).update(\`\${parts.t}.\${rawBody}\`).digest("hex");\n  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300;\n  return fresh && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));\n}`;

export function VoiceDeveloperTools({ project, onChanged }: { project: { id: string; webhook_url?: string | null }; onChanged: () => void }) {
  const [url, setUrl] = useState(project.webhook_url ?? "");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [example, setExample] = useState("single");
  const [language, setLanguage] = useState<"curl" | "js" | "python">("curl");

  async function save(action: "set_webhook" | "remove_webhook") {
    setBusy(true); setMessage(""); setSecret("");
    try {
      const response = await fetch("/api/dashboard/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, project_id: project.id, url }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message ?? "Não foi possível salvar.");
      if (data.secret) setSecret(data.secret);
      if (action === "remove_webhook") setUrl("");
      setMessage(action === "set_webhook" ? "Webhook salvo." : "Webhook removido.");
      onChanged();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  const code = examples[example][language];
  return (
    <details className="mt-4 rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Ferramentas de desenvolvedor</summary>
      <div className="mt-3 space-y-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium"><Webhook size={14} />Webhook de operações</p>
          <p className="mt-1 text-xs text-slate-500">Avisamos seu servidor quando um e-book, dublagem ou transcrição terminar (voice.operation.completed ou voice.operation.failed), com assinatura no cabeçalho ConnectyHub-Signature.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className={`${field} flex-1`} placeholder="https://seu-sistema.com/webhooks/voz" value={url} onChange={event => setUrl(event.target.value)} aria-label="URL do webhook" />
            <button className={small} disabled={busy || !url} onClick={() => void save("set_webhook")} type="button">{project.webhook_url ? "Atualizar e gerar novo segredo" : "Salvar webhook"}</button>
            {project.webhook_url && <button className={small} disabled={busy} onClick={() => void save("remove_webhook")} type="button">Remover</button>}
          </div>
          {secret && <p className="mt-2 break-all rounded-lg bg-amber-50 p-2 font-mono text-xs text-amber-900">Segredo de assinatura (aparece só agora): {secret}</p>}
          {message && <p className="mt-1 text-xs text-slate-600">{message}</p>}
        </div>
        <div>
          <p className="text-sm font-medium">Exemplos prontos</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(examples).map(([key, item]) => <button key={key} type="button" className={`${small} ${example === key ? "border-blue-600 bg-blue-50" : ""}`} onClick={() => setExample(key)}>{item.title}</button>)}
          </div>
          <div className="mt-2 flex gap-2">
            {(["curl", "js", "python"] as const).map(item => <button key={item} type="button" className={`${small} ${language === item ? "border-blue-600 bg-blue-50" : ""}`} onClick={() => setLanguage(item)}>{item === "js" ? "JavaScript" : item === "python" ? "Python" : "curl"}</button>)}
          </div>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-100"><code>{code}</code></pre>
          <button type="button" className={`${small} mt-2`} onClick={() => void navigator.clipboard.writeText(code)}><Copy size={13} />Copiar</button>
          <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-100"><code>{verify}</code></pre>
        </div>
      </div>
    </details>
  );
}

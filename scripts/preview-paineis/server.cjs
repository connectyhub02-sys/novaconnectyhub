// Prévia local dos painéis: componentes reais, dados fictícios, APIs simuladas.
// Nunca conecta a produção. Uso: node scripts/preview-paineis/server.cjs [--build-only]
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");

const root = path.resolve(__dirname, "../..");
const out = path.join(root, "output", "preview-paineis");
const fontDir = path.join(root, "node_modules/next/dist/esm/next-devtools/server/font");
// Mesmas famílias que o layout carrega via next/font, servidas localmente.
const fontFaces = `<style>@font-face{font-family:"Geist";src:url(/__fonts/geist-latin.woff2) format("woff2");font-weight:100 900;font-display:swap}@font-face{font-family:"Geist";src:url(/__fonts/geist-latin-ext.woff2) format("woff2");font-weight:100 900;font-display:swap;unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}@font-face{font-family:"Geist Mono";src:url(/__fonts/geist-mono-latin.woff2) format("woff2");font-weight:100 900;font-display:swap}:root{--font-geist-sans:"Geist";--font-geist-mono:"Geist Mono"}</style>`;
const port = Number(process.env.PREVIEW_PORT || 8768);

function loadEsbuild() {
  const candidates = [process.env.ESBUILD_PATH, "esbuild"].filter(Boolean);
  const npxCache = path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
  if (fs.existsSync(npxCache)) {
    for (const dir of fs.readdirSync(npxCache)) candidates.push(path.join(npxCache, dir, "node_modules", "esbuild"));
  }
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* next */ }
  }
  throw new Error("esbuild não encontrado. Rode `npx esbuild --version` uma vez ou defina ESBUILD_PATH.");
}

async function build() {
  fs.mkdirSync(out, { recursive: true });
  const esbuild = loadEsbuild();
  await esbuild.build({
    entryPoints: [path.join(__dirname, "entry.jsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    outfile: path.join(out, "preview.js"),
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "warning",
    plugins: [{
      name: "local-preview-next",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (args) => ({ path: args.path, namespace: "preview" }));
        b.onLoad({ filter: /.*/, namespace: "preview" }, (args) => ({
          contents: args.path === "next/navigation"
            ? "export const usePathname=()=>location.pathname; export const useSearchParams=()=>new URLSearchParams(location.search); export const useRouter=()=>({refresh(){},prefetch(){},back(){history.back()},push(url){location.href=url},replace(url){location.replace(url)}});"
            : "import React from 'react';export default function Element({children,priority,fill,unoptimized,prefetch,quality,scroll,...props}){return React.createElement('" + (args.path === "next/image" ? "img" : "a") + "',props,children)}",
          loader: "js",
          resolveDir: root,
        }));
      },
    }],
  });
  const cssPath = path.join(root, "src/app/globals.css");
  const css = await postcss([tailwind({ base: path.join(root, "src") })]).process(fs.readFileSync(cssPath, "utf8"), { from: cssPath });
  fs.writeFileSync(path.join(out, "preview.css"), css.css);
}

const routes = [
  ["/dashboard", "Início do cliente"],
  ["/dashboard/atendimento", "Conversas do cliente"],
  ["/dashboard/automacoes", "Automações do cliente"],
  ["/dashboard/redes-sociais/contas", "Conexões sociais"],
  ["/admin", "Início do admin"],
  ["/admin/whatsapp/atendimento", "Atendimento do admin"],
  ["/admin/automacoes", "Automações da plataforma"],
  ["/paleta", "Tokens e componentes"],
];

async function main() {
  await build();
  if (process.argv.includes("--build-only")) return;
  const server = http.createServer(async (req, res) => {
    const name = new URL(req.url, "http://localhost").pathname;
    res.setHeader("Cache-Control", "no-store");
    if (name.startsWith("/api/")) {
      res.setHeader("content-type", "application/json");
      if (name === "/api/account/completion") return res.end(JSON.stringify({ accountCompletion: { isComplete: true, missingFields: [] } }));
      if (name.includes("/attendance/live")) { res.writeHead(204); return res.end(); }
      if (name === "/api/dashboard/attendance/history") return res.end(JSON.stringify({ messages: [], activities: [], trackingEvents: [], cursor: null }));
      if (name === "/api/dashboard/conversations/reply") {
        let body = "";
        for await (const part of req) body += part;
        const input = JSON.parse(body);
        // Envio simulado: "[erro]" exercita o caminho de falha sem WhatsApp.
        if (String(input.text).includes("[erro]")) { res.statusCode = 503; return res.end(JSON.stringify({ error: "Falha simulada. Seu rascunho foi preservado." })); }
        return res.end(JSON.stringify({ message: { id: "local-" + Date.now(), text: input.text, direction: "outbound", author: "human", authorLabel: "Você · simulação", channel: "whatsapp", type: "text", occurredAt: new Date().toISOString() } }));
      }
      res.statusCode = 401;
      return res.end("{}");
    }
    if (name.startsWith("/__fonts/")) {
      const file = path.join(fontDir, path.basename(name));
      if (fs.existsSync(file)) { res.setHeader("content-type", "font/woff2"); return res.end(fs.readFileSync(file)); }
    }
    if (name === "/preview.js" || name === "/preview.css") {
      res.setHeader("content-type", name.endsWith(".css") ? "text/css" : "text/javascript");
      return res.end(fs.readFileSync(path.join(out, name.slice(1))));
    }
    const asset = path.resolve(root, "public", "." + name);
    if (asset.startsWith(path.join(root, "public") + path.sep) && fs.existsSync(asset) && fs.statSync(asset).isFile()) return res.end(fs.readFileSync(asset));
    res.setHeader("content-type", "text/html; charset=utf-8");
    if (name === "/") {
      const links = routes.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("");
      return res.end(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia dos painéis</title><body style="font:16px system-ui;max-width:640px;margin:48px auto;padding:0 20px"><h1>Prévia dos painéis</h1><p>Componentes reais, dados fictícios. Envios simulados; nada conecta à produção. Escreva <code>[erro]</code> numa mensagem para simular falha.</p><ul>${links}</ul></body></html>`);
    }
    res.setHeader("Content-Security-Policy", "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:");
    const tema = new URL(req.url, "http://localhost").searchParams.get("tema");
    const temaAttr = tema && /^[a-z]+$/.test(tema) ? ` data-panel-theme="${tema}"` : "";
    res.end('<!doctype html><html lang="pt-BR"' + temaAttr + '><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Prévia local · dados fictícios</title><link rel="stylesheet" href="/preview.css">' + fontFaces + '</head><body><div id="root"></div><script src="/preview.js"></script></body></html>');
  });
  server.listen(port, "127.0.0.1", () => console.log(`Prévia local http://127.0.0.1:${port} · dados fictícios`));
}

main().catch((error) => { console.error(error); process.exit(1); });

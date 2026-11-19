// Captura as telas da prévia fictícia e verifica problemas básicos de layout.
// Uso: node scripts/preview-paineis/capture.mjs <pasta-de-saida> [largura,...]
// Requer a prévia rodando (node scripts/preview-paineis/server.cjs).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve(process.argv[2] || "output/redesign/captura");
const widths = (process.argv[3] || "375,768,1280,1440").split(",").map(Number);
const base = process.env.PREVIEW_URL || "http://127.0.0.1:8768";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  { name: "cliente-inicio", path: "/dashboard" },
  { name: "cliente-relatorios", path: "/dashboard", click: { text: "Indicadores e relatórios completos" }, fullPage: true },
  { name: "cliente-conversas", path: "/dashboard/atendimento" },
  { name: "cliente-conversa-aberta", path: "/dashboard/atendimento", click: { text: "Bruno · demonstração" } },
  { name: "cliente-menu-celular", path: "/dashboard", mobileOnly: true, click: { role: "button", name: /^(Menu|Mais)$/ } },
  { name: "cliente-automacoes", path: "/dashboard/automacoes" },
  { name: "admin-inicio", path: "/admin" },
  { name: "admin-relatorios", path: "/admin", click: { text: "Indicadores e relatórios completos" }, fullPage: true },
  { name: "admin-atendimento", path: "/admin/whatsapp/atendimento" },
];

const browser = await chromium.launch();
const report = [];
for (const width of widths) {
  const mobile = width < 768;
  const context = await browser.newContext({
    viewport: { width, height: mobile ? 812 : 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  for (const shot of shots) {
    if (shot.mobileOnly && !mobile) continue;
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    const tema = process.env.TEMA ? `?tema=${process.env.TEMA}` : "";
    await page.goto(base + shot.path + tema, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    if (shot.click) {
      const target = shot.click.text
        ? page.getByText(shot.click.text, { exact: true }).first()
        : page.getByRole(shot.click.role, { name: shot.click.name }).last();
      try { await target.click({ timeout: 3000 }); await page.waitForTimeout(800); }
      catch { errors.push(`não encontrou o alvo de clique ${JSON.stringify(String(shot.click.text ?? shot.click.name))}`); }
    }
    const checks = await page.evaluate((isMobile) => {
      const doc = document.documentElement;
      const overflowX = doc.scrollWidth - doc.clientWidth;
      const small = [];
      if (isMobile) {
        for (const el of document.querySelectorAll("a[href], button, [role=button], input, select, textarea")) {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (!r.width || !r.height || style.visibility === "hidden" || r.bottom < 0 || r.top > innerHeight) continue;
          if (r.width < 44 && r.height < 44) small.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30));
        }
      }
      const tiny = [...document.querySelectorAll("body *")].filter((el) => {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.top < innerHeight && parseFloat(getComputedStyle(el).fontSize) < 12;
      }).length;
      const inputsBelow16 = isMobile ? [...document.querySelectorAll("input, textarea, select")].filter((el) => el.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(el).fontSize) < 16).length : 0;
      return { overflowX, smallTargets: small.length, smallTargetSamples: small.slice(0, 6), textBelow12px: tiny, inputsBelow16 };
    }, mobile);
    const file = path.join(outDir, `${shot.name}-${width}.png`);
    await page.screenshot({ path: file, fullPage: Boolean(shot.fullPage) });
    report.push({ shot: shot.name, width, ...checks, errors });
    await page.close();
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(path.join(outDir, "relatorio.json"), JSON.stringify(report, null, 2));
for (const r of report) {
  console.log(`${r.shot.padEnd(26)} ${String(r.width).padStart(4)}px  rolagemX=${r.overflowX}  alvos<44=${r.smallTargets}  texto<12px=${r.textBelow12px}  campos<16=${r.inputsBelow16}  erros=${r.errors.length}`);
}

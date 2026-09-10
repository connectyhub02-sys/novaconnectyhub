"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, Copy, Download, FileJson, KeyRound, Search, Sparkles } from "lucide-react";
import { aiBaseUrl, aiDocPages, aiEndpointResponses, type AiDocBlock } from "@/lib/ai-api/documentation";
import { aiOpenApiSpec } from "@/lib/ai-api/openapi";

export const aiDocSections = aiDocPages;
export type AiDocSection = typeof aiDocSections[number]["id"];
export function isAiDocSection(value: string): value is AiDocSection { return aiDocSections.some(section => section.id === value); }
const card = "rounded-xl border border-white/10 bg-white/[0.025] p-5";
const paragraph = "text-sm leading-7 text-slate-300";
const link = "inline-flex min-h-11 items-center gap-2 text-sm font-bold text-emerald-200 hover:text-white";

export function AiDocsDownload() {
  return <div className="space-y-2">
    <a href="/docs/api/ia/openapi.json" download="connectyhub-ia-openapi.json" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 py-3 text-center text-sm font-bold text-emerald-100 hover:bg-emerald-300/20"><FileJson className="h-4 w-4 shrink-0" />Baixar OpenAPI JSON · IA / LLM</a>
    <a href="/docs/api/ia/guide.md" download="connectyhub-ia-guia.md" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-3 text-center text-sm font-bold text-slate-200 hover:bg-white/5"><Download className="h-4 w-4 shrink-0" />Baixar guia completo · Markdown</a>
  </div>;
}

export function AiDocsNavigation({ selected }: { selected: string }) {
  const [query, setQuery] = useState("");
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = aiDocPages.filter(page => normalize(JSON.stringify(page)).includes(normalize(query.trim())));
  const groups = [...new Set(filtered.map(page => page.group))];
  return <nav aria-label="Seções da API de IA" className="space-y-5">
    <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input aria-label="Buscar na documentação de IA" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar recurso, campo ou erro" className="min-h-9 min-w-0 w-full bg-transparent text-xs text-slate-200 outline-none" /></label>
    {!filtered.length && <p role="status" className="text-sm text-slate-400">Nenhuma seção encontrada. Tente outro termo.</p>}
    {groups.map(group => <div key={group}><p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-widest text-slate-500">{group}</p><div className="space-y-1">{filtered.filter(page => page.group === group).map(section => <a key={section.id} href={`#${section.id}`} aria-current={selected === section.id ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-sm ${selected === section.id ? "bg-emerald-300/10 font-bold text-emerald-100" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
      {section.method ? <span className="rounded bg-emerald-300/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-200">{section.method}</span> : <BookOpen className="h-4 w-4 shrink-0" />}{section.label}
    </a>)}</div></div>)}
    <AiDocsDownload />
  </nav>;
}

export function AiDocsSidePanel() {
  return <div className="space-y-5 rounded-xl border border-emerald-300/20 bg-slate-950/70 p-5"><h2 className="flex items-center gap-2 text-sm font-bold text-emerald-200"><Sparkles className="h-4 w-4" />Conectar à API de IA</h2><p className={paragraph}>Crie o projeto, copie sua chave e configure este endereço no servidor do seu sistema.</p><Code title="Configuração" code={`Base URL: ${aiBaseUrl}\nAuthorization: Bearer SUA_CHAVE`} /><AiDocsDownload /><p className="text-xs leading-6 text-slate-400">Referência pública com recursos, exemplos, respostas e créditos. Compartilhe o guia com sua equipe ou ferramenta de desenvolvimento.</p><Link href="/dashboard/api-ia" className={link}><KeyRound className="h-4 w-4" />Criar projeto e chave<ArrowRight className="h-4 w-4" /></Link></div>;
}

export function AiApiDocs({ section }: { section: AiDocSection }) {
  const page = aiDocPages.find(page => page.id === section) ?? aiDocPages[0];
  const responses = aiEndpointResponses(page);
  const article = useRef<HTMLElement>(null);
  useEffect(() => { article.current?.scrollIntoView({ block: "start" }); }, [section]);
  return <article ref={article} className="min-w-0 scroll-mt-24 space-y-7" aria-label={page.title}>
    <header><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-300">API de IA ConnectyHub · {page.group}</p><h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">{page.title}</h2><p className={`mt-4 ${paragraph}`}>{page.description}</p></header>
    {page.path && <div className="flex min-w-0 flex-wrap gap-3 rounded-lg border border-white/10 p-4"><strong className="font-mono text-xs text-emerald-200">{page.method}</strong><code className="break-all text-sm">{page.path}</code></div>}
    {page.id === "ia" && <div className="grid gap-3 sm:grid-cols-3">{[[String(Object.keys(aiOpenApiSpec.paths).length), "Rotas públicas"], [String(aiDocPages.length), "Seções de referência"], ["Créditos", "Consumo da conta"]].map(([value, label]) => <div key={label} className={card}><strong className="text-2xl font-black text-emerald-200">{value}</strong><p className="mt-2 text-xs leading-5 text-slate-400">{label}</p></div>)}</div>}
    {page.blocks.map((block, index) => <Block key={`${page.id}-${index}`} block={block} />)}
    {!!responses.length && <Rows title="Respostas HTTP" columns={["HTTP", "Descrição"]} rows={responses} />}
    {page.id === "ia-schemas" || page.id === "ia" ? <AiDocsDownload /> : null}
    <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-5"><a href="#ia-recursos" className={link}>Recursos disponíveis<ArrowRight className="h-4 w-4" /></a><a href="#ia-schemas" className={link}>Schemas e downloads<ArrowRight className="h-4 w-4" /></a></div>
    <footer className="text-xs leading-6 text-slate-400">API de IA ConnectyHub · <a className="text-emerald-200 underline" href="#whatsapp">API WhatsApp</a> · Referência {aiOpenApiSpec.info.version}</footer>
  </article>;
}

function Block({ block }: { block: AiDocBlock }) {
  if (block.kind === "text") return <p className={paragraph}>{block.text}</p>;
  if (block.kind === "code") return <Code title={block.title} code={block.code} language={block.language} />;
  if (block.kind === "table") return <Rows {...block} />;
  if (block.kind === "steps") return <section className={card}><h3 className="text-lg font-bold text-white">{block.title}</h3><ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-7 text-slate-300">{block.items.map(item => <li key={item}>{item}</li>)}</ol></section>;
  return <aside className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] p-5"><h3 className="font-bold text-emerald-100">{block.title}</h3><p className={`mt-3 ${paragraph}`}>{block.text}</p></aside>;
}
function Rows({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return <section className="min-w-0 space-y-4"><h3 className="text-lg font-bold text-white">{title}</h3><div className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-xs text-slate-300"><tr>{columns.map(column => <th key={column} scope="col" className="px-4 py-3">{column}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{rows.map((row, index) => <tr key={index}>{row.map((cell, col) => col === 0 ? <th key={col} scope="row" className="break-words px-4 py-4 align-top font-mono text-xs font-bold leading-6 text-emerald-200">{cell}</th> : <td key={col} className="min-w-40 px-4 py-4 align-top leading-7 text-slate-300">{cell}</td>)}</tr>)}</tbody></table></div></section>;
}
function Code({ title, code, language = "text" }: { title: string; code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setFailed(false); }
    catch { setFailed(true); }
  }
  return <section className="min-w-0 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-white">{title}</h3><button type="button" onClick={copy} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-bold text-emerald-200 hover:bg-white/5" aria-label={`Copiar ${title}`}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copiado" : "Copiar"}</button></div><pre tabIndex={0} aria-label={title} className="max-w-full overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-4 font-mono text-xs leading-6 text-emerald-100"><code className={`language-${language}`}>{code}</code></pre>{failed && <p role="status" className="text-xs text-slate-400">Selecione o código e copie manualmente.</p>}</section>;
}

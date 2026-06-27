import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, FileJson } from "lucide-react";
import { ConnectyLogo } from "@/components/brand/connecty-logo";
import { ApiDocsReference } from "@/components/connectyhub-os/api-docs-reference";
import { buildConnectyhubDocsCatalog } from "@/lib/connectyhub-api/docs-catalog";
import { connectyhubOpenApiSpec } from "@/lib/connectyhub-api/openapi";

export const metadata: Metadata = {
  title: "Documentacao da API WhatsApp | ConnectyHub",
  description:
    "Referencia publica da API WhatsApp ConnectyHub para instancias, envio de mensagens, consultas, webhooks e recursos avancados.",
};

const docsCatalog = buildConnectyhubDocsCatalog(connectyhubOpenApiSpec);

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-slate-100">
      <DocsHeader />
      <Hero />
      <ApiDocsReference catalog={docsCatalog} />
    </main>
  );
}

function Hero() {
  return (
    <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(0,255,136,0.16),transparent_34%),linear-gradient(135deg,#07120f_0%,#05070a_48%,#07111b_100%)] px-5 pt-28 pb-14 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-emerald-200">
            <BookOpen className="h-3.5 w-3.5" />
            API publica
          </div>
          <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
            Documentacao da API WhatsApp ConnectyHub
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Use a ConnectyHub como ponte de WhatsApp para suas empresas, com chaves proprias,
            instancias controladas, envio de mensagens, webhooks assinados e catalogo completo de recursos avancados.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              className="inline-flex h-11 items-center gap-2 rounded-full bg-emerald-400 px-5 text-sm font-bold text-black transition hover:bg-emerald-300"
              href="#referencia"
            >
              Primeira chamada
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/50 hover:text-cyan-100"
              href="/login?next=%2Fadmin%2Fapi-whatsapp"
            >
              Acessar painel
            </Link>
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
              download="connectyhub-openapi.json"
              href="/docs/api/openapi.json"
              title="Baixar especificacao tecnica em JSON para Postman, Insomnia e SDKs"
            >
              <FileJson className="h-4 w-4" />
              Baixar JSON
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/45 p-4 shadow-2xl shadow-emerald-950/20">
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">Base URL</span>
            <span className="rounded-full bg-cyan-400/10 px-2 py-1 font-mono text-[10px] text-cyan-200">v1</span>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black p-4 text-[12px] leading-6 text-slate-200">
            <code>{`const baseUrl = "${docsCatalog.baseUrl}";
const apiKey = process.env.CONNECTYHUB_API_KEY;`}</code>
          </pre>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <HeroStat label="Endpoints" value={docsCatalog.stats.endpoints} />
            <HeroStat label="Grupos" value={docsCatalog.stats.groups} />
            <HeroStat label="Schemas" value={docsCatalog.stats.schemas} />
          </div>
        </div>
      </div>
    </section>
  );
}

function DocsHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#05070a]/88 px-5 py-4 backdrop-blur-md sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <Link className="inline-flex rounded-full border border-emerald-400/30 px-4 py-2" href="/">
          <ConnectyLogo className="h-4 w-[132px]" tone="white" type="full" />
        </Link>
        <nav className="hidden items-center gap-5 font-mono text-[11px] uppercase tracking-[0.16em] text-slate-400 md:flex">
          <Link className="transition hover:text-white" href="/">
            Home
          </Link>
          <Link className="transition hover:text-white" href="/#teste-turing">
            Teste de Turing
          </Link>
          <Link className="transition hover:text-white" href="/#como-funciona">
            Como funciona
          </Link>
          <Link className="transition hover:text-white" href="/#planos">
            Planos
          </Link>
          <a className="text-emerald-200 transition hover:text-white" href="#referencia">
            API Docs
          </a>
        </nav>
        <Link className="rounded-full bg-white px-4 py-2 text-xs font-bold text-black transition hover:bg-emerald-200" href="/iniciar">
          Teste gratis
        </Link>
      </div>
    </header>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="font-mono text-xl font-black text-emerald-200">{value}</div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
}

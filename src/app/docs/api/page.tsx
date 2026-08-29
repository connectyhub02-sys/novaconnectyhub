import type { Metadata } from "next";
import Link from "next/link";
import { ConnectyLogo } from "@/components/brand/connecty-logo";
import { ApiDocsReference } from "@/components/connectyhub-os/api-docs-reference";
import { JsonLd } from "@/components/seo/json-ld";
import { buildConnectyhubDocsCatalog } from "@/lib/connectyhub-api/docs-catalog";
import { connectyhubOpenApiSpec } from "@/lib/connectyhub-api/openapi";
import { buildApiDocsStructuredData } from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  title: "Documentacao da API WhatsApp | ConnectyHub",
  description:
    "Referencia publica da API WhatsApp ConnectyHub para instancias, envio de mensagens, consultas, webhooks e recursos avancados.",
  keywords: [
    "API WhatsApp ConnectyHub",
    "documentacao API WhatsApp",
    "testar API WhatsApp",
    "webhook WhatsApp",
    "enviar mensagem WhatsApp API",
  ],
  alternates: { canonical: "/docs/api" },
  openGraph: {
    title: "Documentacao da API WhatsApp | ConnectyHub",
    description:
      "Referencia publica e console de testes da API WhatsApp ConnectyHub para mensagens, instancias, contatos e webhooks.",
    url: "/docs/api",
    siteName: "ConnectyHub",
    locale: "pt_BR",
    type: "website",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Documentacao da API WhatsApp | ConnectyHub",
    description:
      "Referencia publica e console de testes da API WhatsApp ConnectyHub para integradores.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const docsCatalog = buildConnectyhubDocsCatalog(connectyhubOpenApiSpec);

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-slate-100">
      <JsonLd
        id="connectyhub-api-docs-jsonld"
        data={buildApiDocsStructuredData({
          endpointCount: docsCatalog.stats.endpoints,
          groupCount: docsCatalog.stats.groups,
          schemaCount: docsCatalog.stats.schemas,
        })}
      />
      <DocsHeader />
      <ApiDocsReference catalog={docsCatalog} />
    </main>
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

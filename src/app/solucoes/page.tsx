import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PublicSiteHeader } from "@/components/seo/public-site-header";
import { JsonLd } from "@/components/seo/json-ld";
import { buildBreadcrumbList } from "@/lib/seo/structured-data";
import { buildCanonicalUrl, connectyhubSiteDescription, getConnectyhubSiteUrl } from "@/lib/seo/site";
import { solutionPages } from "@/lib/seo/solution-pages";

export const metadata: Metadata = {
  title: "Solucoes de IA para WhatsApp | ConnectyHub",
  description:
    "Conheca solucoes da ConnectyHub para agentes de IA, automacao WhatsApp, catalogo, API, imobiliarias e e-commerce.",
  alternates: { canonical: "/solucoes" },
  openGraph: {
    title: "Solucoes de IA para WhatsApp | ConnectyHub",
    description:
      "Agentes de IA, automacao WhatsApp, catalogo, API, imobiliarias e e-commerce em uma plataforma brasileira.",
    url: "/solucoes",
    siteName: "ConnectyHub",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solucoes de IA para WhatsApp | ConnectyHub",
    description:
      "Agentes de IA, automacao WhatsApp, catalogo, API, imobiliarias e e-commerce em uma plataforma brasileira.",
  },
};

export default function SolutionsPage() {
  const siteUrl = getConnectyhubSiteUrl();
  const pageUrl = buildCanonicalUrl("/solucoes");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: "Solucoes de IA para WhatsApp",
        description: connectyhubSiteDescription,
        inLanguage: "pt-BR",
        isPartOf: { "@id": `${siteUrl}/#website` },
      },
      {
        "@type": "ItemList",
        "@id": `${pageUrl}#solutions`,
        name: "Solucoes ConnectyHub",
        itemListElement: solutionPages.map((page, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: page.title,
          url: buildCanonicalUrl(`/solucoes/${page.slug}`),
        })),
      },
      buildBreadcrumbList([
        { name: "ConnectyHub", url: siteUrl },
        { name: "Solucoes", url: pageUrl },
      ]),
    ],
  };

  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <JsonLd id="connectyhub-solutions-jsonld" data={jsonLd} />
      <PublicSiteHeader active="solutions" />

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">Solucoes ConnectyHub</p>
          <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
            IA, WhatsApp, catalogo e API prontos para busca e para venda.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-slate-300">
            Estas paginas explicam como a ConnectyHub resolve buscas reais de clientes, parceiros e mecanismos de IA: atendimento,
            automacao, venda conversacional, catalogo e integracao.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-slate-200">
            {["Conteudo publico e indexavel", "Schema estruturado por pagina", "Links internos para fortalecer descoberta"].map((item) => (
              <span className="flex items-center gap-2" key={item}>
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {solutionPages.map((page) => (
            <Link
              className="group rounded-[8px] border border-white/10 bg-white/[0.04] p-5 transition hover:border-emerald-300/60 hover:bg-emerald-300/10"
              href={`/solucoes/${page.slug}`}
              key={page.slug}
            >
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">{page.eyebrow}</p>
              <h2 className="mt-3 text-lg font-bold">{page.title}</h2>
              <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-300">{page.description}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-white">
                Ver solucao <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { ConnectyLogo } from "@/components/brand/connecty-logo";
import { JsonLd } from "@/components/seo/json-ld";
import { buildBreadcrumbList, buildFaqPageStructuredData } from "@/lib/seo/structured-data";
import { buildCanonicalUrl, getConnectyhubSiteUrl } from "@/lib/seo/site";
import { getSolutionPage, solutionPages } from "@/lib/seo/solution-pages";

type SolutionPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return solutionPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: SolutionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getSolutionPage(slug);

  if (!page) {
    return {
      title: "Solucao | ConnectyHub",
      description: "Conheca as solucoes da ConnectyHub para IA, WhatsApp, catalogo e automacoes.",
    };
  }

  const canonical = `/solucoes/${page.slug}`;

  return {
    title: page.seoTitle,
    description: page.description,
    keywords: page.keywords,
    alternates: { canonical },
    openGraph: {
      title: page.seoTitle,
      description: page.description,
      url: canonical,
      siteName: "ConnectyHub",
      locale: "pt_BR",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: page.seoTitle,
      description: page.description,
    },
  };
}

export default async function SolutionDetailPage({ params }: SolutionPageProps) {
  const { slug } = await params;
  const page = getSolutionPage(slug);

  if (!page) {
    notFound();
  }

  const siteUrl = getConnectyhubSiteUrl();
  const pageUrl = buildCanonicalUrl(`/solucoes/${page.slug}`);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: page.seoTitle,
        description: page.description,
        inLanguage: "pt-BR",
        isPartOf: { "@id": `${siteUrl}/#website` },
        mainEntity: { "@id": `${pageUrl}#article` },
      },
      {
        "@type": "TechArticle",
        "@id": `${pageUrl}#article`,
        headline: page.heroTitle,
        description: page.description,
        keywords: page.keywords,
        author: { "@id": `${siteUrl}/#organization` },
        publisher: { "@id": `${siteUrl}/#organization` },
        mainEntityOfPage: pageUrl,
      },
      buildFaqPageStructuredData({ pageUrl, questions: page.faqs }),
      buildBreadcrumbList([
        { name: "ConnectyHub", url: siteUrl },
        { name: "Solucoes", url: buildCanonicalUrl("/solucoes") },
        { name: page.title, url: pageUrl },
      ]),
    ],
  };

  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <JsonLd id="connectyhub-solution-jsonld" data={jsonLd} />
      <header className="border-b border-white/10 px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link className="inline-flex rounded-full border border-emerald-400/30 px-4 py-2" href="/">
            <ConnectyLogo className="h-4 w-[132px]" tone="white" type="full" />
          </Link>
          <Link className="hidden items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white sm:inline-flex" href="/solucoes">
            <ArrowLeft className="h-4 w-4" />
            Solucoes
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-5xl px-5 py-12 sm:px-8 lg:py-16">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">{page.eyebrow}</p>
        <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">{page.heroTitle}</h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300">{page.heroLead}</p>

        <section className="mt-10 rounded-[8px] border border-emerald-300/30 bg-emerald-300/10 p-6">
          <h2 className="text-xl font-bold">Resposta direta</h2>
          <p className="mt-3 text-base leading-8 text-slate-100">{page.intentAnswer}</p>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {page.proofPoints.map((item) => (
            <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-5" key={item}>
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <p className="mt-4 text-sm leading-6 text-slate-200">{item}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 grid gap-8">
          {page.sections.map((section) => (
            <div className="border-t border-white/10 pt-8" key={section.title}>
              <h2 className="text-2xl font-bold">{section.title}</h2>
              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">{section.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 border-t border-white/10 pt-8">
          <h2 className="text-2xl font-bold">Perguntas frequentes</h2>
          <div className="mt-6 grid gap-4">
            {page.faqs.map((faq) => (
              <details className="rounded-[8px] border border-white/10 bg-white/[0.04] p-5" key={faq.question}>
                <summary className="cursor-pointer text-base font-bold">{faq.question}</summary>
                <p className="mt-3 text-sm leading-7 text-slate-300">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-black transition hover:bg-emerald-200" href="/cadastro">
            Comecar teste <ArrowRight className="h-4 w-4" />
          </Link>
          <Link className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:border-emerald-300" href="/docs/api">
            Ver API
          </Link>
        </div>
      </article>
    </main>
  );
}

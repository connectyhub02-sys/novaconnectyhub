import Link from "next/link";
import { ConnectyLogo } from "@/components/brand/connecty-logo";

type LegalSection = {
  title: string;
  paragraphs: string[];
  items?: string[];
};

export function LegalPage({
  title,
  description,
  updatedAt,
  sections,
}: {
  title: string;
  description: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-[#05080d] text-slate-100">
      <header className="border-b border-white/10 bg-black/40 px-6 py-5 backdrop-blur md:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link href="/" className="inline-flex rounded-full border border-emerald-400/30 px-4 py-2">
            <ConnectyLogo className="h-4 w-[132px]" tone="white" type="full" />
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/10 px-4 py-2 font-mono text-xs font-bold uppercase text-slate-200 transition hover:border-emerald-300/60 hover:text-white"
          >
            Voltar ao site
          </Link>
        </div>
      </header>

      <section className="px-6 py-14 md:px-10 md:py-20">
        <article className="mx-auto max-w-5xl">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-emerald-300">
            ConnectyHub
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-white md:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
            {description}
          </p>
          <p className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
            Ultima atualizacao: {updatedAt}
          </p>

          <div className="mt-12 grid gap-5">
            {sections.map((section) => (
              <section
                key={section.title}
                className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/20 md:p-8"
              >
                <h2 className="text-xl font-extrabold text-white">{section.title}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300 md:text-base">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.items && section.items.length > 0 ? (
                  <ul className="mt-5 grid gap-3 text-sm leading-7 text-slate-300 md:text-base">
                    {section.items.map((item) => (
                      <li key={item} className="border-l-2 border-emerald-300/70 pl-4">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          <footer className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-8 font-mono text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>ConnectyHub Plataforma de IA e automacao comercial.</span>
            <span>Contato: connectyhub02@gmail.com</span>
          </footer>
        </article>
      </section>
    </main>
  );
}

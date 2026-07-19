import Link from "next/link";
import { ArrowLeft, LayoutDashboard } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-slate-100">
      <section className="w-full max-w-xl rounded-lg border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-cyan-200">
          404
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          Esta pagina nao existe ou foi movida.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Use um dos atalhos abaixo para voltar para uma area conhecida da ConnectyHub.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-cyan-300/50 bg-cyan-300/15 px-4 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/25"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            Abrir painel
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao site
          </Link>
        </div>
      </section>
    </main>
  );
}

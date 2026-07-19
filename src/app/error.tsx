"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RefreshCcw } from "lucide-react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-slate-100">
      <section className="w-full max-w-xl rounded-lg border border-cyan-400/20 bg-slate-900/80 p-6 shadow-2xl shadow-cyan-950/20">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-cyan-200">
          Sistema indisponivel
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          Nao conseguimos carregar esta area agora.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          A sessao continua segura. Tente recarregar a area ou volte ao painel inicial.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-cyan-300/50 bg-cyan-300/15 px-4 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/25"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Ir para o painel
          </Link>
        </div>
      </section>
    </main>
  );
}

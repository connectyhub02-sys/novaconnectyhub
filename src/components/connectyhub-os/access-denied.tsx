import Link from "next/link";
import { LockKeyhole } from "lucide-react";

export function AccessDenied() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-4 text-foreground">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
          <LockKeyhole size={22} />
        </span>
        <p className="mt-5 font-mono text-[10px] uppercase text-amber-700">Acesso restrito</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Este setor pertence aos administradores da ConnectyHub.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Sua conta esta ativa como cliente. Voce pode continuar no painel da sua empresa, mas nao acessar a diretoria/admin.
        </p>
        <Link
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md border border-sky-200 bg-sky-50 px-4 font-mono text-[11px] font-semibold uppercase text-sky-700"
          href="/dashboard"
        >
          Voltar ao painel cliente
        </Link>
      </section>
    </main>
  );
}

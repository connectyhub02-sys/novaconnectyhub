import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Link2 } from "lucide-react";
import { metaWorkspaceItems } from "@/lib/meta/workspace-navigation";
export function MetaWorkspaceHome({
  connected,
  scopes,
  unavailable,
}: {
  connected: boolean;
  scopes: string[];
  unavailable?: boolean;
}) {
  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
          Facebook · Instagram · WhatsApp
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Central Meta
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Planeje conteúdo, acompanhe resultados e atenda seus leads com os
          agentes da sua empresa.
        </p>
        <Link
          href="/dashboard/integracoes#meta-ads-guiado"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Link2 size={16} />
          {connected
            ? "Gerenciar conexão Meta"
            : "Conectar Facebook e Instagram"}
        </Link>
        <p role="status" className="mt-3 text-xs text-slate-500">
          {unavailable
            ? "Não foi possível consultar a conexão agora."
            : connected
              ? "Conexão encontrada. Cada operação confere as permissões concedidas à sua conta."
              : "Conecte seus ativos pelo login oficial. Não é necessário copiar credenciais."}
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metaWorkspaceItems
          .filter((item) => item.key !== "overview")
          .map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-400 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">{item.label}</h2>
                <ArrowUpRight size={18} className="text-blue-500" />
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {item.description}
              </p>
            </Link>
          ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">
          Permissões desta conexão
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          A abertura dos módulos não substitui a aprovação da Meta. Recursos sem
          acesso autorizado continuam bloqueados no envio.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {scopes.length ? (
            scopes.map((scope) => (
              <span
                key={scope}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-800"
              >
                <CheckCircle2 size={12} />
                {scope}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-500">
              Nenhuma permissão registrada nesta conexão.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

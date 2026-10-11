import { getInstagramOverview, safeInstagramPermalink } from "@/lib/meta/instagram-reader";
import { Panel } from "./panel-primitives";

export async function MetaInstagramOverview({ userId, organizationId }: { userId: string; organizationId: string }) {
  const overview = await getInstagramOverview(userId, organizationId);
  return <Panel title="Instagram conectado" className="mb-5">
    {overview.error ? <p role="status" className="text-sm text-amber-300">{overview.error}</p> : !overview.profile ?
      <p className="text-sm text-slate-400">Conecte sua conta profissional com a permissão de leitura do Instagram para consultar o perfil e as publicações.</p> : <>
      <h2 className="text-lg font-semibold">@{overview.profile.username}</h2>
      <p className="text-sm">{overview.profile.name}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{overview.profile.biography}</p>
      <p className="mt-2 text-xs text-slate-400">{overview.profile.media_count ?? 0} publicações · Dados consultados agora pela API oficial da Meta</p>
      <h3 className="mt-5 font-medium">Publicações recentes</h3>
      {!overview.media.length && <p className="mt-2 text-sm text-slate-400">A Meta não retornou publicações para esta conta.</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">{overview.media.map(item => {
        const href = safeInstagramPermalink(item.permalink);
        return <article key={item.id} className="rounded-xl border border-white/10 p-4">
          <p className="text-xs text-slate-400">{item.media_type} · {item.timestamp ? new Date(item.timestamp).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : ""}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{item.caption || "Publicação sem legenda"}</p>
          {href && <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-blue-400">Abrir publicação no Instagram</a>}
        </article>;
      })}</div>
    </>}
  </Panel>;
}

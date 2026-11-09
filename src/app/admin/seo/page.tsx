import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { PageHeader, Panel } from "@/components/connectyhub-os/panel-primitives";
import { getPlatformSearchConsole } from "@/lib/analytics/platform-search-console";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = { title: "Busca orgânica | ConnectyHub", robots: { index: false, follow: false } };
const number = (value: number | undefined, decimals = 0) => value === undefined ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
export default async function SeoPage() {
  await connection();
  const workspace = await getCurrentWorkspace();
  if (!workspace?.profile.isPlatformAdmin) return <AccessDenied />;
  const report = await getPlatformSearchConsole();
  return <ConnectyShell mode="admin" activeHref="/admin/seo" isPlatformAdmin userLabel={workspace.profile.email ?? "Administrador"}>
    <PageHeader eyebrow="Divulgação" title="Busca orgânica" description="Visibilidade das páginas públicas da ConnectyHub na Pesquisa Google." />
    <Panel title="Google Search Console" eyebrow={`${report.startDate} a ${report.endDate}`}>
      <p className="mb-3 text-sm text-slate-600">{report.detail}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Cliques", number(report.total?.clicks)], ["Impressões", number(report.total?.impressions)], ["CTR", report.total ? `${number(report.total.ctr * 100, 2)}%` : "—"], ["Posição média", report.total?.impressions ? number(report.total.position, 1) : "—"]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="my-1 text-2xl font-semibold">{value}</p></div>)}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">{[{ title: "Páginas no Google", rows: report.pages }, { title: "Principais buscas", rows: report.queries }].map(group => <section key={group.title}><h2 className="mb-2 font-semibold">{group.title}</h2><table className="w-full text-left text-sm"><thead><tr><th>Página / busca</th><th>Cliques</th><th>Impressões</th></tr></thead><tbody>{group.rows.map(row => <tr key={row.keys?.join("|")} className="border-t border-slate-100"><td className="break-all py-2">{row.keys?.[0]?.replace(report.siteUrl, "/")}</td><td>{number(row.clicks)}</td><td>{number(row.impressions)}</td></tr>)}</tbody></table>{!group.rows.length && <p className="mt-2 text-sm text-slate-500">{report.status === "connected" ? "Sem linhas disponíveis para este período." : "Aguardando conexão de leitura."}</p>}</section>)}</div>
      <p className="mt-5 text-xs text-slate-500">Propriedade: {report.siteUrl} · Período de 28 dias no fuso do Search Console (Pacífico). Não soma a propriedade antiga sem www. Impressões não equivalem a visitantes; o GA4 mede visitas ao site.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-blue-600 underline"><a href={`https://search.google.com/search-console?resource_id=${encodeURIComponent(report.siteUrl)}`} target="_blank" rel="noreferrer">Abrir Search Console</a><a href="/sitemap.xml" target="_blank" rel="noreferrer">Sitemap público</a><a href="https://www.bing.com/webmasters/" target="_blank" rel="noreferrer">Abrir Bing Webmaster Tools</a></div>
    </Panel>
  </ConnectyShell>;
}

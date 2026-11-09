import Link from "next/link";
import type { AnalyticsReport } from "@/lib/analytics/platform-analytics";
import { Panel } from "./panel-primitives";

const number = (value: number | null) => value === null ? "—" : value.toLocaleString("pt-BR");

export function PlatformAnalyticsPanel({ report, compact = false }: { report: AnalyticsReport; compact?: boolean }) {
  return <Panel title="Visitas ao site · Google Analytics" eyebrow="Somente ConnectyHub" action={<Link href="/admin/analytics" className="text-sm text-blue-600 underline">{compact ? "Abrir Analytics" : "Atualizar relatórios"}</Link>}>
    <p className="mb-3 text-sm text-slate-600">{report.detail}</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[["Visitantes", report.users, "Últimos 30 dias"], ["Sessões", report.sessions, "Últimos 30 dias"], ["Visualizações", report.views, "Últimos 30 dias"], ["Ativos agora", report.realtimeUsers, "Últimos 30 minutos"]].map(([label, value, detail]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="my-1 text-2xl font-semibold text-slate-900">{number(value as number | null)}</p><p className="text-xs text-slate-500">{detail}</p></div>)}
    </div>
    {!compact && <>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div><h2 className="mb-2 font-semibold">Páginas mais visitadas</h2><table className="w-full text-left text-sm"><thead><tr><th>Página</th><th>Visualizações</th><th>Visitantes</th></tr></thead><tbody>{report.pages.map(row => <tr key={row.path} className="border-t border-slate-100"><td className="break-all py-2">{row.path}</td><td>{number(row.views)}</td><td>{number(row.users)}</td></tr>)}</tbody></table>{!report.pages.length && <p className="mt-2 text-sm text-slate-500">{report.status === "connected" ? "Ainda não há páginas no relatório consolidado." : "Aguardando conexão com o Google."}</p>}</div>
        <div><h2 className="mb-2 font-semibold">Origem das visitas</h2><table className="w-full text-left text-sm"><thead><tr><th>Origem / mídia</th><th>Sessões</th></tr></thead><tbody>{report.sources.map(row => <tr key={row.source} className="border-t border-slate-100"><td className="py-2">{row.source}</td><td>{number(row.sessions)}</td></tr>)}</tbody></table>{!report.sources.length && <p className="mt-2 text-sm text-slate-500">Aguardando dados de origem.</p>}</div>
      </div>
      <p className="mt-5 text-xs text-slate-500">Propriedade {report.propertyId} · {report.measurementId || "Tag não configurada"} · Consulta em {new Date(report.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. A medição depende da escolha de cookies do visitante; bloqueadores podem impedir a coleta.</p>
      <a className="mt-3 inline-block text-sm text-blue-600 underline" href={`https://analytics.google.com/analytics/web/#/p${report.propertyId}/reports/intelligenthome`} target="_blank" rel="noreferrer">Abrir no Google Analytics</a>
    </>}
  </Panel>;
}

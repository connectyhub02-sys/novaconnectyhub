import Link from "next/link";
import type { AnalyticsReport } from "@/lib/analytics/platform-analytics";

const number = (value: number | null) => value === null ? "—" : value.toLocaleString("pt-BR");

export function PlatformAnalyticsPanel({ report, compact = false }: { report: AnalyticsReport; compact?: boolean }) {
  const stats: Array<[string, number | null, string]> = [
    ["Visitantes", report.users, "Últimos 30 dias"],
    ["Sessões", report.sessions, "Últimos 30 dias"],
    ["Visualizações", report.views, "Últimos 30 dias"],
    ["Ativos agora", report.realtimeUsers, "Últimos 30 minutos"],
  ];

  return <section className="ch-report-card" aria-labelledby="ch-analytics-title">
    <header>
      <div className="min-w-0">
        <h3 id="ch-analytics-title">Visitas ao site</h3>
        <p className="ch-meta">Google Analytics · somente o site da ConnectyHub</p>
      </div>
      <Link href="/admin/analytics" className="ch-link shrink-0">{compact ? "Abrir relatório" : "Atualizar relatórios"}</Link>
    </header>
    <dl className={compact ? "ch-stat-grid" : "ch-stat-grid ch-stat-grid--4"}>
      {stats.map(([label, value, detail]) => <div key={label}>
        <dt>{label}</dt>
        <dd>{number(value)}</dd>
        <p className="ch-stat-detail">{detail}</p>
      </div>)}
    </dl>
    <p className="ch-report-note">{report.detail}</p>
    {!compact && <div className="grid gap-5 p-4 lg:grid-cols-2">
      <div>
        <h4 className="mb-2 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>Páginas mais visitadas</h4>
        <table className="w-full text-left text-[13.5px]"><thead><tr className="ch-meta"><th className="pb-2 font-medium">Página</th><th className="pb-2 font-medium">Visualizações</th><th className="pb-2 font-medium">Visitantes</th></tr></thead><tbody>{report.pages.map(row => <tr key={row.path} className="border-t" style={{ borderColor: "var(--ch-border-soft)" }}><td className="break-all py-2">{row.path}</td><td className="tabular-nums">{number(row.views)}</td><td className="tabular-nums">{number(row.users)}</td></tr>)}</tbody></table>
        {!report.pages.length && <p className="ch-meta mt-2">{report.status === "connected" ? "Ainda não há páginas no relatório consolidado." : "Aguardando conexão com o Google."}</p>}
      </div>
      <div>
        <h4 className="mb-2 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>Origem das visitas</h4>
        <table className="w-full text-left text-[13.5px]"><thead><tr className="ch-meta"><th className="pb-2 font-medium">Origem / mídia</th><th className="pb-2 font-medium">Sessões</th></tr></thead><tbody>{report.sources.map(row => <tr key={row.source} className="border-t" style={{ borderColor: "var(--ch-border-soft)" }}><td className="py-2">{row.source}</td><td className="tabular-nums">{number(row.sessions)}</td></tr>)}</tbody></table>
        {!report.sources.length && <p className="ch-meta mt-2">Aguardando dados de origem.</p>}
      </div>
      <p className="ch-meta lg:col-span-2">Propriedade {report.propertyId} · {report.measurementId || "Tag não configurada"} · Consulta em {new Date(report.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. A medição depende da escolha de cookies do visitante; bloqueadores podem impedir a coleta.</p>
      <a className="ch-link" href={`https://analytics.google.com/analytics/web/#/p${report.propertyId}/reports/intelligenthome`} target="_blank" rel="noreferrer">Abrir no Google Analytics</a>
    </div>}
  </section>;
}

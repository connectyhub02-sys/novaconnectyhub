"use client";
import { useEffect, useState } from "react";
import { RefreshCw, ArrowUpRight, BarChart3, ShieldCheck } from "lucide-react";
import type { MetaAdsAnalytics } from "@/lib/meta/ads-analytics";
import { PageHeader, Panel } from "./panel-primitives";
import { MetaPixelPanel } from "./meta-pixel-panel";
import { MetaAdsLeadsPanel } from "./meta-ads-leads-panel";
import { MetaCreativeStudio } from "./meta-creative-studio";

const field = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900";
const number = (n: number | null | undefined, digits = 0) => n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const date = (value: string) => value.split("-").reverse().join("/");

export function MetaAdsAnalyticsPanel({ companyId, admin = false }: { companyId?: string; admin?: boolean }) {
  const [report, setReport] = useState<MetaAdsAnalytics | null>(null);
  const [account, setAccount] = useState(""), [days, setDays] = useState("30"), [since, setSince] = useState(""), [until, setUntil] = useState("");
  const [query, setQuery] = useState("days=30"), [revision, setRevision] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [ai, setAi] = useState(""), [aiBusy, setAiBusy] = useState(false);
  const endpoint = `/api/dashboard/meta-analytics?${query}${companyId ? `&companyId=${encodeURIComponent(companyId)}` : ""}`;
  const integrationHref = admin ? "/admin/meta" : "/dashboard/integracoes#meta-ads-guiado";
  useEffect(() => {
    const abort = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: abort.signal }).then(async response => {
      const data = await response.json();
      if (abort.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar os dados.");
      setReport(data); setAccount(data.selectedAccountId); setError(""); setAi("");
    }).catch(e => { if (!abort.signal.aborted) { setError(e.message || "Falha de conexão."); setReport(null); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [endpoint, revision]);
  function refresh() {
    const p = new URLSearchParams();
    if (account) p.set("accountId", account);
    if (days === "custom") { p.set("since", since); p.set("until", until); }
    else p.set("days", days);
    setQuery(p.toString()); setLoading(true); setError(""); setAi(""); setReport(null); setRevision(n => n + 1);
  }
  async function analyze() {
    if (!report) return;
    setAiBusy(true); setAi("");
    try {
      const r = await fetch("/api/dashboard/traffic/ai-analysis", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId:crypto.randomUUID(), platform: "meta", ...(companyId ? { companyId } : {}), accountId: report.selectedAccountId, since: report.period.since, until: report.period.until }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || "Análise indisponível.");
      setAi(`${data.analysis.text}\n\nCréditos utilizados: ${data.analysis.usage?.chargeCredits ?? "Em conferência"}`);
    } catch (e) { setAi(e instanceof Error ? e.message : "Análise indisponível."); } finally { setAiBusy(false); }
  }
  const money = (n: number | null | undefined) => n == null ? "—" : report?.account.currency
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: report.account.currency }).format(n) : `${number(n, 2)} (moeda não informada)`;
  const t = report?.totals;
  const maxSpend = Math.max(1, ...(report?.daily.map(d => d.spend) || []));
  return <div className="space-y-5">
    <PageHeader eyebrow="Meta / Resultados" title="Meta Ads" description="Campanhas, conversões e leads da empresa, com origem e período de cada informação."
      actions={<a href={integrationHref} className={`${field} flex items-center gap-2 text-blue-700`}>Conectar Facebook <ArrowUpRight size={15}/></a>} />
    <MetaCreativeStudio companyId={companyId} initialMode="campaign" accountCurrency={report?.account.currency}/>
    <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-blue-100 bg-white p-4" onSubmit={e => { e.preventDefault(); refresh(); }}>
      <label className="min-w-52 flex-1 text-xs text-slate-500">Conta de anúncios<select aria-label="Conta de anúncios" className={`${field} mt-1 w-full`} value={account} disabled={loading || aiBusy} onChange={e => setAccount(e.target.value)}>
        {!report?.accounts.length && <option value={account}>{account || "Conta da conexão Meta"}</option>}
        {report?.accounts.map(a => <option key={a.id} value={a.id}>{a.label} · {a.id.replace("act_", "")}</option>)}
      </select></label>
      <label className="text-xs text-slate-500">Período<select aria-label="Período" className={`${field} ml-0 mt-1 block`} value={days} disabled={loading || aiBusy} onChange={e => setDays(e.target.value)}>
        <option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="custom">Personalizado</option>
      </select></label>
      {days === "custom" && <><label className="text-xs text-slate-500">De<input required type="date" className={`${field} mt-1 block`} value={since} onChange={e => setSince(e.target.value)}/></label><label className="text-xs text-slate-500">Até<input required type="date" className={`${field} mt-1 block`} value={until} onChange={e => setUntil(e.target.value)}/></label></>}
      <button className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={loading || aiBusy}><RefreshCw size={15} className={loading ? "animate-spin" : ""}/>{loading ? "Consultando…" : "Atualizar relatório"}</button>
    </form>
    {loading && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">Consultando a conta e os registros desta empresa…</p>}
    {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error} <a className="underline" href={integrationHref}>Ver conexão Meta</a></p>}
    {report && <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><p>{report.account.name} · {date(report.period.since)} a {date(report.period.until)} · {report.period.timezone}</p><p>Consulta: {new Date(report.fetchedAt).toLocaleString("pt-BR")}</p></div>
      {report.errors.map(e => <p key={e} role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{e}</p>)}
      {report.status === "empty" && <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><BarChart3 size={22}/><div><strong>Conexão confirmada. Sem métricas de campanhas neste período.</strong><p className="mt-1">Você pode consultar outro período. Não é necessário criar anúncios para validar a integração.</p></div></div>}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric title="Investimento" value={money(t?.spend)} detail="Meta Insights"/>
        <Metric title="Impressões" value={number(t?.impressions)} detail="Exibições dos anúncios"/>
        <Metric title="Cliques" value={number(t?.clicks)} detail={`CTR: ${number(t?.ctr, 2)}% · todos os cliques`}/>
        <Metric title="Custo por clique" value={money(t?.cpc)} detail={`CPM: ${money(t?.cpm)}`}/>
        <Metric title="Leads atribuídos" value={number(t?.leads, 2)} detail={`CPL: ${money(t?.cpl)} · Meta`}/>
        <Metric title="Compras atribuídas" value={number(t?.purchases, 2)} detail="Atribuição da Meta"/>
        <Metric title="Valor de compras" value={money(t?.purchaseValue)} detail={`ROAS: ${number(t?.roas, 2)}${t?.roas == null ? "" : "×"}`}/>
        <Metric title="Leads recebidos no CRM" value={number(report.crm?.imported)} detail="Formulários da Página conectada"/>
      </div>
      <p className="text-xs leading-5 text-slate-500">Meta Insights usa a atribuição da conta/conjuntos de anúncios e a data da conversão. Leads do CRM contam importações dos formulários da Página {report.pageId || "não selecionada"} no período, incluindo testes. Não representam conversões atribuídas à conta de anúncios e não entram no CPL ou ROAS.</p>
      <Panel title="Investimento por dia" eyebrow="Meta Insights">
        {!report.dailyAvailable ? <p className="text-sm text-amber-800">Evolução indisponível nesta consulta.</p> : !report.daily.length ? <p className="text-sm text-slate-500">Sem dados diários no período selecionado.</p> : <div className="flex h-40 items-end gap-1 overflow-x-auto" aria-label="Investimento diário">
          {report.daily.map(d => <div key={d.date} className="flex h-full min-w-5 flex-1 flex-col justify-end" title={`${date(d.date)}: ${money(d.spend)} · ${d.clicks} cliques`}><div className="min-h-1 rounded-t bg-blue-500" style={{ height: `${Math.max(2, d.spend / maxSpend * 85)}%` }}/><span className="mt-1 truncate text-[9px] text-slate-500">{d.date.slice(8)}</span></div>)}
        </div>}
      </Panel>
      <Panel title="Resultados por campanha" eyebrow="Somente campanhas com métricas no período">
        {!report.totals ? <p className="text-sm text-amber-800">Métricas indisponíveis. Atualize após corrigir o aviso acima.</p> : !report.campaigns.length ? <p className="text-sm text-slate-500">Nenhuma campanha com resultados neste período.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-slate-500"><tr>{["Campanha", "Investimento", "Impressões", "Cliques", "Leads Meta", "Compras", "ROAS"].map(h => <th className="whitespace-nowrap px-3 py-3" key={h}>{h}</th>)}</tr></thead><tbody>{report.campaigns.map(c => <tr key={c.id} className="border-b last:border-0"><td className="min-w-48 px-3 py-3"><strong>{c.name}</strong><p className="text-xs text-slate-500">{c.id}</p></td>{[money(c.spend), number(c.impressions), number(c.clicks), number(c.leads, 2), number(c.purchases, 2), number(c.roas, 2)].map((v, i) => <td key={i} className="whitespace-nowrap px-3 py-3">{v}</td>)}</tr>)}</tbody></table></div>}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pixel e conversões" eyebrow="Recibos do servidor · período selecionado">
          {!report.pixel ? <p className="text-sm text-amber-800">Diagnóstico indisponível.</p> : <div className="space-y-2 text-sm"><p className="font-semibold">{report.pixel.name || "Pixel não configurado"}</p><p className="text-xs text-slate-500">{report.pixel.id || "Selecione um Pixel abaixo."}</p>
            {report.pixel.configured && !report.pixel.matches ? <p className="text-amber-800">O Pixel salvo pertence a outra conta. Consulte a conta da conexão ou altere a configuração nas Integrações.</p> : <><p>{report.pixel.enabled ? report.pixel.testMode ? "Ativo em modo de teste" : "Medição ativa" : "Medição não ativa"}</p><p>Recebidos: <strong>{number(report.pixel.counts?.sent)}</strong> em produção · <strong>{number(report.pixel.counts?.test)}</strong> em teste</p><p className="text-slate-500">Na fila: {number(report.pixel.counts?.pending)} · Falhas: {number(report.pixel.counts?.failed)} · Cancelados: {number(report.pixel.counts?.cancelled)}</p></>}
            <p className="text-xs leading-5 text-slate-500">Recibo CAPI confirma recebimento do evento. Não comprova atribuição a anúncios nem soma eventos do navegador.</p>
          </div>}
        </Panel>
        <Panel title="Lead Ads e conexão" eyebrow="CRM da empresa">
          <div className="space-y-2 text-sm"><p>Importados: <strong>{number(report.crm?.imported)}</strong> · Na fila: {number(report.crm?.pending)} · Falhas: {number(report.crm?.failed)}</p><p>Ads MCP: {report.mcpAuthorized ? "autorizado nesta conexão" : "requer autorização"}</p><p className="text-xs leading-5 text-slate-500">A autorização da conexão não substitui a aprovação do app para empresas externas. As consultas MCP e os formulários ficam no painel abaixo.</p><p className="flex items-center gap-2 text-xs text-emerald-700"><ShieldCheck size={16}/>Consultar relatórios não cria anúncios nem altera orçamento.</p></div>
        </Panel>
      </div>
      <Panel title="Diagnóstico e análise" eyebrow="Baseado neste relatório" collapsible>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>{report.status === "ready" ? `${report.campaigns.length} campanha(s) com métricas. Compare resultados dentro do mesmo objetivo e período.` : "Sem dados suficientes para recomendar mudanças de investimento."}</li>
          <li>{report.pixel?.enabled ? report.pixel.testMode ? "O Pixel está em teste; esses eventos não são vendas atribuídas." : "Acompanhe falhas e recebimento de eventos antes de avaliar conversões." : "Configure e valide a medição antes de analisar conversões."}</li>
          <li>CRM e Meta medem etapas diferentes. Não some os dois totais nem trate eventos de teste como retorno financeiro.</li>
        </ul>
        <button className={`${field} mt-4 text-blue-700 disabled:opacity-50`} disabled={aiBusy || loading || report.status !== "ready"} onClick={analyze}>{aiBusy ? "Analisando…" : "Analisar resultados com IA"}</button>
        <p className="mt-2 text-xs text-slate-500">A análise usa créditos de IA conforme seu plano. Nenhuma recomendação é executada automaticamente.</p>
        {ai && <p role="status" className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm">{ai}</p>}
      </Panel>
    </>}
    <details className="rounded-2xl border border-blue-100 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Medição de resultados · configurações avançadas</summary><div className="mt-4"><MetaPixelPanel companyId={companyId}/></div></details>
    <details className="rounded-2xl border border-blue-100 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Ads MCP e formulários Lead Ads · conexão e testes</summary><div className="mt-4"><MetaAdsLeadsPanel companyId={companyId}/></div></details>
  </div>;
}
function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{title}</p><p className="my-2 break-words text-xl font-semibold tracking-tight text-slate-900">{value}</p><p className="text-[11px] text-slate-500">{detail}</p></div>;
}

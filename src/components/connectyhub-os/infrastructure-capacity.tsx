"use client";

import { useEffect, useState } from "react";
import { CapacityDial as Dial } from "./capacity-dial";
import { Activity, AlertTriangle, ArrowDown, CheckCircle2, Gauge, RefreshCw, Server } from "lucide-react";
import { capacityAlerts, capacityLabels, capacityLevel, capacityStale, serviceLevel, servicePercent, serviceDisplayName, type CapacityLevel, type CapacityService, type CapacitySnapshot } from "@/lib/infrastructure/capacity";

const colors: Record<CapacityLevel, string> = { comfortable: "#059669", attention: "#d97706", critical: "#e11d48", unknown: "#94a3b8" };
const badgeStyles: Record<CapacityLevel, string> = { comfortable: "bg-emerald-50 text-emerald-800", attention: "bg-amber-50 text-amber-900", critical: "bg-rose-50 text-rose-800", unknown: "bg-slate-100 text-slate-600" };
const number = (v: number, digits = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const bytes = (v: number) => v >= 1024 ** 3 ? `${number(v / 1024 ** 3)} GB` : `${number(v / 1024 ** 2)} MB`;
const time = (v: string) => new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Status({ level, children }: { level: CapacityLevel; children?: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${badgeStyles[level]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{children ?? capacityLabels[level]}</span>;
}
function Usage({ value, limit, metric, unavailable }: { value: number | null; limit: number | null; metric: "cpu" | "memory"; unavailable: boolean }) {
  const percent = servicePercent(value, limit), level = capacityLevel(percent, metric, unavailable);
  return <div className="min-w-0"><p className="text-xs text-slate-700">{value === null ? "Sem medição" : metric === "memory" ? bytes(value) : `${number(value, 2)} CPU`}{limit !== null ? ` / ${metric === "memory" ? bytes(limit) : `${number(limit, 2)} CPU`}` : " · sem cota própria"}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role={percent === null ? undefined : "meter"} aria-label={metric === "cpu" ? "Uso da cota de CPU" : "Uso da cota de memória"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent === null ? undefined : Math.min(100, percent)}><div className="h-full rounded-full" style={{ width: `${percent === null ? 0 : Math.min(100, percent)}%`, backgroundColor: colors[level] }} /></div></div>;
}

export function CapacityDashboard({ snapshot, error = "", loading = false, onRefresh }: { snapshot: CapacitySnapshot | null; error?: string; loading?: boolean; onRefresh?: () => void }) {
  const [all, setAll] = useState(false);
  const [group, setGroup] = useState("Todos");
  const [sort, setSort] = useState("attention");
  const outdated = capacityStale(snapshot) || !!error;
  const alerts = snapshot ? capacityAlerts(snapshot, outdated) : [];
  const rank: Record<CapacityLevel, number> = { critical: 0, attention: 1, unknown: 2, comfortable: 3 };
  const services = [...(snapshot?.services ?? [])].filter(s => group === "Todos" || s.group === group).sort((a, b) => sort === "cpu" ? (b.cpuCores ?? -1) - (a.cpuCores ?? -1) : sort === "memory" ? (b.memoryUsed ?? -1) - (a.memoryUsed ?? -1) : rank[serviceLevel(a, outdated)] - rank[serviceLevel(b, outdated)] || (b.memoryUsed ?? 0) - (a.memoryUsed ?? 0));
  const attention = snapshot?.services.filter(s => ["critical", "attention"].includes(serviceLevel(s))).length ?? 0;
  return <section aria-labelledby="capacity-title" className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-700"><Gauge size={16} />Saúde da VPS</p><h2 id="capacity-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-900">De olho nos limites</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">O espaço, a memória e o processamento compartilhados pelos seus sistemas, em um só lugar.</p></div><button type="button" onClick={onRefresh} disabled={loading || !onRefresh} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin motion-reduce:animate-none" : ""} />Atualizar leitura</button></header>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500"><span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${!snapshot || outdated ? "bg-slate-400" : "bg-emerald-500"}`} />{!snapshot ? "Aguardando primeira leitura" : outdated ? "Leitura desatualizada" : "Monitoramento ativo"}</span>{snapshot && <span>Medido às {time(snapshot.observedAt)} · {snapshot.host}</span>}<span>Coleta a cada 30 s</span><span>Apenas administradores</span></div>
    {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{error} {snapshot && "Os valores abaixo são da última leitura recebida."}</p>}
    {!snapshot ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><Server className="mx-auto text-slate-400" size={30} /><p className="mt-3 font-semibold text-slate-800">{loading ? "Lendo a capacidade do servidor…" : "Capacidade ainda não disponível"}</p><p className="mt-2 text-sm text-slate-500">Os mostradores aparecem quando o coletor envia uma medição real.</p></div> : <>
      <div className="grid gap-4 md:grid-cols-3"><Dial title="Disco" metric="disk" value={snapshot.disk.percent} detail={`${bytes(snapshot.disk.used)} usados de ${bytes(snapshot.disk.total)}`} free={`${bytes(snapshot.disk.available)} livres`} stale={outdated} history={snapshot.history} /><Dial title="Memória RAM" metric="memory" value={snapshot.memory.percent} detail={`${bytes(snapshot.memory.used)} em uso de ${bytes(snapshot.memory.total)}`} free={`${bytes(snapshot.memory.available)} disponíveis`} stale={outdated} history={snapshot.history} /><Dial title="Processador" metric="cpu" value={snapshot.cpu.percent} detail={`${snapshot.cpu.cores} CPUs · média da amostra${snapshot.sampleSeconds ? ` de ${number(snapshot.sampleSeconds, 0)} s` : " inicial"}`} free={snapshot.cpu.percent === null ? "Preparando a primeira medição" : `${number(100 - snapshot.cpu.percent, 0)}% sem executar tarefas`} stale={outdated} history={snapshot.history} /></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">Serviços em execução</p><p className="mt-1 text-xl font-bold">{snapshot.servicesAvailable ? snapshot.services.length : "—"}</p></div><div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">Serviços que pedem atenção</p><p className={`mt-1 text-xl font-bold ${attention && !outdated ? "text-rose-700" : "text-slate-700"}`}>{outdated || !snapshot.servicesAvailable ? "—" : attention}</p></div><div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">CPU aguardando leitura/gravação</p><p className="mt-1 text-xl font-bold">{snapshot.cpu.ioWaitPercent === null || outdated ? "—" : `${number(snapshot.cpu.ioWaitPercent)}%`}</p></div></div>
      <div className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Activity size={16} />O que precisa da sua atenção</h3>{alerts.length ? alerts.map(alert => <div key={alert.title} className={`flex items-start gap-3 rounded-xl p-4 ${badgeStyles[alert.level]}`}><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><p className="text-sm font-semibold">{alert.title}</p><p className="mt-1 text-xs leading-5">{alert.detail}</p></div></div>) : <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /><div><p className="text-sm font-semibold">Nenhum limite de capacidade atingido nesta leitura</p><p className="mt-1 text-xs leading-5">Capacidade disponível não garante todos os fluxos funcionando. A saúde das integrações aparece nos projetos abaixo.</p></div></div>}</div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h3 className="font-semibold">Consumo por serviço</h3><p className="mt-1 text-xs text-slate-500">Compare os maiores consumidores e os limites de cada serviço.</p></div><div className="flex flex-wrap gap-3"><label className="flex items-center gap-2 text-xs text-slate-600">Sistema<select aria-label="Filtrar serviços por sistema" value={group} onChange={event => { setGroup(event.target.value); setAll(false); }} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800">{["Todos", ...new Set(snapshot.services.map(s => s.group))].map(g => <option key={g}>{g}</option>)}</select></label><label className="flex items-center gap-2 text-xs text-slate-600">Ordem<select aria-label="Ordenar consumo dos serviços" value={sort} onChange={event => setSort(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"><option value="attention">Mais atenção</option><option value="cpu">Maior CPU</option><option value="memory">Maior memória</option></select></label></div></div>
        <div className="divide-y divide-slate-100">{(all ? services : services.slice(0, 8)).map(service => <ServiceRow key={service.name} service={service} unavailable={outdated} />)}{!services.length && <p className="p-5 text-sm text-slate-500">{snapshot.servicesAvailable ? "Nenhum serviço neste filtro." : "A leitura dos serviços está indisponível."}</p>}</div>
        {services.length > 8 && <button onClick={() => setAll(v => !v)} className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-slate-100 p-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">{all ? "Mostrar menos" : `Ver todos os ${services.length} serviços`}<ArrowDown size={14} className={all ? "rotate-180" : ""} /></button>}
        <p className="border-t border-slate-100 bg-slate-50 p-4 text-xs leading-5 text-slate-500">Cota é o máximo permitido para cada serviço. “CPU limitada” mostra a proporção de intervalos em que ele foi obrigado a esperar por atingir essa cota. Memória dos serviços desconta cache recuperável; valores em GB usam base 1024. O monitor apenas observa.</p>
      </div>
    </>}
  </section>;
}

function ServiceRow({ service, unavailable }: { service: CapacityService; unavailable: boolean }) {
  const level = serviceLevel(service, unavailable);
  return <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-500">{service.group}</span><Status level={level} /></div><p className="mt-1.5 text-sm font-semibold text-slate-800">{serviceDisplayName(service.name)}</p><p className="mt-1 break-all text-[11px] text-slate-500">{service.name}</p>{!unavailable && service.health === "unhealthy" && <p className="mt-1 text-xs font-semibold text-rose-700">Verificação de saúde falhando</p>}{!unavailable && service.state !== "running" && <p className="mt-1 text-xs font-semibold text-rose-700">Serviço fora de execução normal</p>}{service.throttlePercent !== null && service.throttlePercent >= 20 && <p className={`mt-1 text-xs font-semibold ${unavailable ? "text-slate-500" : "text-rose-700"}`}>CPU limitada em {number(service.throttlePercent, 0)}% dos intervalos{unavailable ? " · leitura anterior" : ""}</p>}</div><div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Processamento</p><Usage value={service.cpuCores} limit={service.cpuLimit} metric="cpu" unavailable={unavailable} /></div><div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Memória</p><Usage value={service.memoryUsed} limit={service.memoryLimit} metric="memory" unavailable={unavailable} /></div></div>;
}

export function InfrastructureCapacity() {
  const [snapshot, setSnapshot] = useState<CapacitySnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      if (document.visibilityState === "hidden") { timer = setTimeout(read, 15_000); return; }
      setLoading(true);
      try {
        const result = await fetch("/api/admin/infrastructure/capacity", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        if (result.status === 401 || result.status === 403) { setSnapshot(null); throw new Error("Seu acesso administrativo expirou ou não está disponível."); }
        const body = await result.json();
        if (!result.ok) throw new Error(body.error ?? "Não foi possível atualizar a leitura.");
        if (!controller.signal.aborted) { setSnapshot(body.snapshot); setError(""); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Falha ao atualizar a leitura."); }
      finally { if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(read, 15_000); } }
    }
    void read();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);
  return <CapacityDashboard snapshot={snapshot} error={error} loading={loading} onRefresh={() => setRevision(n => n + 1)} />;
}

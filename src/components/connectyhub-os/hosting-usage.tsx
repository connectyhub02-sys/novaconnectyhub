"use client";
import { useState } from "react";
import { Activity, Gauge } from "lucide-react";
import { HostingStorage } from "./hosting-storage";
import { CapacityDial } from "./capacity-dial";
import { hostingStateLabels, type HostingUsage } from "@/lib/infrastructure/hosting";
import { hostingIndicators, hostingServiceReasons, type HostingIndicator } from "@/lib/infrastructure/hosting-indicators";
import { capacityLabels, capacityLevel, serviceLevel, servicePercent, type CapacityLevel } from "@/lib/infrastructure/capacity";

const number = (n: number, digits = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const memory = (n: number | null) => n === null ? "Sem leitura" : n >= 1024 ** 3 ? `${number(n / 1024 ** 3)} GB` : `${number(n / 1024 ** 2)} MB`;
const colors: Record<CapacityLevel, string> = { comfortable: "bg-emerald-500", attention: "bg-amber-500", critical: "bg-rose-500", unknown: "bg-slate-300" };
const badges: Record<CapacityLevel, string> = { comfortable: "bg-emerald-50 text-emerald-800", attention: "bg-amber-50 text-amber-900", critical: "bg-rose-50 text-rose-800", unknown: "bg-slate-100 text-slate-600" };
const coverage = (i: HostingIndicator) => `${i.measured} de ${i.total} serviços com limite e leitura`;

function ResourceBar({ used, limit, metric }: { used: number | null; limit: number | null; metric: "cpu" | "memory" }) {
  const value = servicePercent(used, limit), level = capacityLevel(value, metric);
  const format = (n: number | null) => metric === "memory" ? memory(n) : n === null ? "Sem leitura" : `${number(n, 2)} núcleo(s)`;
  return <div className="min-w-0 space-y-1.5">
    <div className="flex flex-wrap justify-between gap-1 text-xs"><span className="font-medium">{metric === "cpu" ? "CPU" : "Memória"}</span><span>{value === null ? "Sem percentual disponível" : `${number(value)}% do limite`}</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-100" role={value === null ? undefined : "meter"} aria-label={metric === "cpu" ? "Uso da cota de CPU" : "Uso da cota de memória"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.min(100, value)}>
      <div className={`h-full rounded-full ${colors[level]}`} style={{ width: `${value === null ? 0 : Math.min(100, value)}%` }} />
    </div>
    <p className="text-xs text-slate-500">{format(used)}{limit && limit > 0 ? ` de ${format(limit)}` : " · limite não definido"}</p>
  </div>;
}

export function HostingUsageView({ usage }: { usage: HostingUsage }) {
  const [sort, setSort] = useState("attention"), [all, setAll] = useState(false);
  const indicators = hostingIndicators(usage);
  const rank: Record<CapacityLevel, number> = { critical: 0, attention: 1, unknown: 2, comfortable: 3 };
  const services = [...(usage.stale ? [] : usage.services)].sort((a, b) => sort === "cpu" ? (b.cpuCores ?? -1) - (a.cpuCores ?? -1) : sort === "memory" ? (b.memoryUsed ?? -1) - (a.memoryUsed ?? -1) : rank[serviceLevel(a)] - rank[serviceLevel(b)] || (b.memoryUsed ?? 0) - (a.memoryUsed ?? 0));
  const attention = services.filter(s => hostingServiceReasons(s).length).length;
  const topCpu = [...services].filter(s => s.cpuCores !== null).sort((a, b) => b.cpuCores! - a.cpuCores!)[0];
  const topMemory = [...services].filter(s => s.memoryUsed !== null).sort((a, b) => b.memoryUsed! - a.memoryUsed!)[0];
  return <div className="space-y-5 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{hostingStateLabels[usage.state] ?? "Estado não confirmado"}</p><p className="text-xs text-slate-500">{usage.stale ? "Aguardando leitura atual" : `Leitura: ${usage.observedAt ? new Date(usage.observedAt).toLocaleTimeString("pt-BR") : "—"} · coleta a cada 30 s`}</p></div>
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-lg font-bold"><Gauge size={20} className="text-blue-700" />De olho na sua infraestrutura</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Cada relógio destaca o serviço mais próximo do próprio limite neste projeto. O nome abaixo do ponteiro indica onde está o maior uso.</p>
      {usage.stale && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Aguardando uma medição atual. Os indicadores ficam sem leitura até a coleta voltar.</p>}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <CapacityDial title="Processamento · CPU" metric="cpu" value={indicators.cpu.value} stale={usage.stale} caption="maior uso da cota"
          free={indicators.cpu.service?.name ?? "Sem limite de CPU medido"} detail={coverage(indicators.cpu)} unknownLabel={usage.stale ? undefined : "Sem limite medido"} />
        <CapacityDial title="Memória RAM" metric="memory" value={indicators.memory.value} stale={usage.stale} caption="maior uso da cota"
          free={indicators.memory.service?.name ?? "Sem limite de memória medido"} detail={coverage(indicators.memory)} unknownLabel={usage.stale ? undefined : "Sem limite medido"} />
        <CapacityDial title="CPU limitada" metric="throttle" value={indicators.throttle.value} stale={usage.stale} caption="intervalos limitados"
          free={indicators.throttle.service?.name ?? "Sem leitura de limitação"} detail="Maior proporção de intervalos em que um serviço precisou esperar por atingir sua cota de CPU." />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Verde: com folga · amarelo: atenção · vermelho: limite elevado. CPU limitada pode aparecer mesmo com baixo uso médio. Serviços sem cota não entram no percentual dos relógios.</p>
    </div>
    {!usage.stale && <>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">CPU total do projeto</p><p className="mt-1 text-2xl font-bold">{usage.cpuCores === null ? "Sem leitura" : `${number(usage.cpuCores, 2)} núcleo(s)`}</p><p className="mt-2 text-xs text-slate-600">Maior consumo: {topCpu ? `${topCpu.name} (${number(topCpu.cpuCores!, 2)} núcleo(s))` : "sem leitura"}</p></div>
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Memória total do projeto</p><p className="mt-1 text-2xl font-bold">{memory(usage.memoryUsed)}</p><p className="mt-2 text-xs text-slate-600">Maior consumo: {topMemory ? `${topMemory.name} (${memory(topMemory.memoryUsed)})` : "sem leitura"}</p></div>
        <div className={`rounded-xl p-4 ${attention ? "bg-amber-50 text-amber-950" : "bg-slate-50"}`}><p className="text-xs">Serviços que pedem atenção</p><p className="mt-1 text-2xl font-bold">{attention} <span className="text-sm font-normal">de {services.length}</span></p><p className="mt-2 text-xs">{attention ? "Veja o motivo nos serviços destacados abaixo." : "Nenhum alerta observado nesta coleta."}</p></div>
      </div>
    </>}
    <HostingStorage storage={usage.storage} />
    {!usage.stale && <>
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4"><h3 className="flex items-center gap-2 font-semibold"><Activity size={17} />O que está consumindo</h3><label className="flex items-center gap-2 text-xs">Ordenar por<select value={sort} onChange={e => { setSort(e.target.value); setAll(false); }} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="attention">Mais atenção</option><option value="cpu">Maior CPU</option><option value="memory">Maior memória</option></select></label></div>
        <div className="divide-y divide-slate-100">{(all ? services : services.slice(0, 6)).map(s => { const level = serviceLevel(s), reasons = hostingServiceReasons(s), partial = !s.cpuLimit || !s.memoryLimit, badgeLevel = !reasons.length && partial ? "unknown" : level; return <div key={s.name} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{s.name}</strong><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badges[badgeLevel]}`}>{reasons.length ? "Requer atenção" : partial ? "Limites parciais" : capacityLabels[level]}</span></div>
          {reasons.length > 0 && <p className={`rounded-lg p-2 text-xs ${badges[level]}`}>{reasons.join(" · ")}</p>}
          <div className="grid gap-4 sm:grid-cols-2"><ResourceBar used={s.cpuCores} limit={s.cpuLimit} metric="cpu" /><ResourceBar used={s.memoryUsed} limit={s.memoryLimit} metric="memory" /></div>
        </div>; })}{!services.length && <p className="p-4 text-sm text-slate-500">Nenhum serviço em execução observado nesta coleta.</p>}</div>
        {services.length > 6 && <button onClick={() => setAll(v => !v)} className="min-h-11 w-full border-t border-slate-200 p-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">{all ? "Mostrar menos" : `Ver todos os ${services.length} serviços`}</button>}
      </div>
    </>}
  </div>;
}

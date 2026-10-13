import { Activity, Cpu, HardDrive, MemoryStick } from "lucide-react";
import { capacityLevel, capacityLabels, capacityThresholds, type CapacityLevel, type CapacityMetric, type CapacitySnapshot } from "@/lib/infrastructure/capacity";
const colors: Record<CapacityLevel, string> = { comfortable: "#059669", attention: "#d97706", critical: "#e11d48", unknown: "#94a3b8" };
const badgeStyles: Record<CapacityLevel, string> = { comfortable: "bg-emerald-50 text-emerald-800", attention: "bg-amber-50 text-amber-900", critical: "bg-rose-50 text-rose-800", unknown: "bg-slate-100 text-slate-600" };
const number = (v: number, digits = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
function point(value: number, radius = 84) {
  const angle = (150 + Math.max(0, Math.min(100, value)) * 2.4) * Math.PI / 180;
  return [120 + radius * Math.cos(angle), 110 + radius * Math.sin(angle)];
}
function arc(from: number, to: number) {
  const a = point(from), b = point(to);
  return `M ${a[0]} ${a[1]} A 84 84 0 ${to - from > 75 ? 1 : 0} 1 ${b[0]} ${b[1]}`;
}
export function CapacityDial({ title, metric, value, detail, free, stale, history = [], caption = "em uso", unknownLabel, display }: { title: string; metric: CapacityMetric; value: number | null; detail: string; free: string; stale: boolean; history?: CapacitySnapshot["history"]; caption?: string; unknownLabel?: string; display?: { value: string; maximum: string; status: string } }) {
  const level = capacityLevel(value, metric, stale), [warning, critical] = capacityThresholds[metric];
  const needle = value === null ? null : point(value, 62);
  const needleColor = display ? stale ? colors.unknown : "#2563eb" : colors[level];
  const Icon = { disk: HardDrive, memory: MemoryStick, cpu: Cpu, throttle: Activity }[metric];
  const segments: [number, number, CapacityLevel][] = [[0, warning, "comfortable"], [warning, critical, "attention"], [critical, 100, "critical"]];
  const trendMetric = metric === "throttle" ? "cpu" : metric;
  const trend = history.map((p, i) => { const v = p[trendMetric]; if (v === null) return ""; const command = i > 0 && history[i - 1][trendMetric] !== null ? "L" : "M"; return `${command}${i / Math.max(1, history.length - 1) * 240},${35 - v * .3}`; }).join(" ");
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold"><Icon size={17} className="text-slate-500" />{title}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${display ? "bg-blue-50 text-blue-800" : badgeStyles[level]}`}>{display?.status ?? (level === "unknown" && unknownLabel ? unknownLabel : capacityLabels[level])}</span></div>
    <svg viewBox="0 0 240 188" role="img" aria-label={`${title}: ${display?.value ?? (value === null ? "sem medição" : `${number(value)}%`)}. ${display?.status ?? capacityLabels[level]}`} className="mx-auto mt-1 w-full max-w-[270px]">
      <path d={arc(0, 100)} fill="none" stroke="#f1f5f9" strokeWidth="18" strokeLinecap="round" />
      {display ? <path d={arc(0, 100)} fill="none" stroke={needleColor} strokeOpacity=".35" strokeWidth="12" /> : segments.map(([from, to, color]) => <path key={color} d={arc(from + .8, to - .8)} fill="none" stroke={colors[stale || value === null ? "unknown" : color]} strokeOpacity={stale || value === null ? .3 : .85} strokeWidth="12" />)}
      {Array.from({ length: 21 }, (_, i) => { const a = point(i * 5, 70), b = point(i * 5, i % 5 === 0 ? 61 : 66); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#cbd5e1" strokeWidth={i % 5 === 0 ? 1.5 : 1} />; })}
      {needle && <><line x1="120" y1="110" x2={needle[0]} y2={needle[1]} stroke={needleColor} strokeWidth="3" strokeLinecap="round" /><circle cx="120" cy="110" r="6" fill={needleColor} /><circle cx="120" cy="110" r="2" fill="white" /></>}
      <text x="120" y="153" textAnchor="middle" fill={stale ? "#64748b" : "#0f172a"} fontSize={display ? 27 : 32} fontWeight="700">{display?.value ?? (value === null ? "—" : `${number(value, 0)}%`)}</text>
      <text x="30" y="169" fill="#64748b" fontSize="11">0</text><text x="210" y="169" textAnchor="end" fill="#64748b" fontSize="11">{display?.maximum ?? "100%"}</text>
      <text x="120" y="176" textAnchor="middle" fill="#64748b" fontSize="11">{stale ? "última leitura" : caption}</text>
    </svg>
    <p className="text-center text-sm font-semibold text-slate-800">{free}</p><p className="mt-1 text-center text-xs text-slate-500">{detail}</p>
    {history.length > 0 && <div className="mt-4 border-t border-slate-100 pt-3"><div className="flex items-center justify-between text-[11px] text-slate-500"><span>Tendência recente</span><span>{history.length > 1 ? `${Math.max(1, Math.round((Date.parse(history.at(-1)!.at) - Date.parse(history[0].at)) / 60000))} min` : "Formando histórico"}</span></div><svg viewBox="0 0 240 40" className="mt-1 h-10 w-full" aria-hidden><path d="M0 35H240" stroke="#e2e8f0" /><path d={trend} fill="none" stroke={colors[level]} strokeWidth="2" strokeLinejoin="round" /></svg></div>}
    {!display && <p className="text-[11px] leading-5 text-slate-500">Atenção a partir de {warning}% · Limite a partir de {critical}%</p>}
  </article>;
}

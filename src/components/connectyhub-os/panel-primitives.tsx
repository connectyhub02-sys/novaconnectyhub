import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  CircleDot,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusTone, Tone } from "@/lib/connectyhub-os-data";

// ─── Tone map ─────────────────────────────────────────────────────────────────

const toneMap: Record<Tone, { text: string; border: string; bg: string; fill: string; dot: string }> = {
  green:  { text: "text-emerald-400", border: "border-emerald-500/25", bg: "bg-emerald-500/10", fill: "#34d399", dot: "bg-emerald-400" },
  cyan:   { text: "text-cyan-400",    border: "border-cyan-500/25",    bg: "bg-cyan-500/10",    fill: "#22d3ee", dot: "bg-cyan-400"    },
  amber:  { text: "text-amber-400",   border: "border-amber-500/25",   bg: "bg-amber-500/10",   fill: "#fbbf24", dot: "bg-amber-400"  },
  rose:   { text: "text-rose-400",    border: "border-rose-500/25",    bg: "bg-rose-500/10",    fill: "#fb7185", dot: "bg-rose-400"   },
  violet: { text: "text-violet-400",  border: "border-violet-500/25",  bg: "bg-violet-500/10",  fill: "#a78bfa", dot: "bg-violet-400" },
  zinc:   { text: "text-slate-500",   border: "border-slate-300",      bg: "bg-slate-100",      fill: "#64748b", dot: "bg-slate-400"  },
};

const statusMap: Record<StatusTone, { label: string; tone: Tone; icon: LucideIcon }> = {
  online:   { label: "Online",   tone: "green", icon: CheckCircle2 },
  warning:  { label: "Atenção",  tone: "amber", icon: CircleAlert  },
  critical: { label: "Crítico",  tone: "rose",  icon: CircleAlert  },
  idle:     { label: "Standby",  tone: "zinc",  icon: CircleDot    },
};

export function toneClass(tone: Tone) { return toneMap[tone]; }

// ─── PageHeader ───────────────────────────────────────────────────────────────

export function PageHeader({
  eyebrow, title, description, actions,
}: {
  eyebrow?: string; title: string; description?: string; actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p>
        )}
        <h1 className="text-[22px] font-bold" style={{ color: "var(--ch-text)" }}>{title}</h1>
        {description && (
          <p className="mt-1 text-[13px] text-slate-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <PageHeader eyebrow={eyebrow} title={title} description={description} />;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function Panel({
  id, title, eyebrow, action, children, className,
}: {
  id?: string; title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div
      id={id}
      className={cn("rounded-2xl", className)}
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--ch-border)" }}
      >
        <div>
          {eyebrow && (
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
          )}
          <p className="text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

export function MetricCard({
  icon: Icon, label, value, detail, trend, tone, series,
}: {
  icon: LucideIcon; label: string; value: string;
  detail: string; trend: string; tone: Tone; series: number[];
}) {
  const t    = toneMap[tone];
  const isUp = trend.startsWith("+");
  const isDn = trend.startsWith("-");

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl", t.bg)}>
          <Icon className={cn("h-4 w-4", t.text)} />
        </div>
      </div>
      <p className={cn("mt-3 font-mono text-[28px] font-bold leading-none", t.text)}>{value}</p>
      <MiniSparkline className="mt-4" color={t.fill} data={series} />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-slate-500">{detail}</span>
        <span className={cn(
          "flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px]",
          isUp ? "bg-emerald-500/10 text-emerald-600" : isDn ? "bg-rose-500/10 text-rose-500" : "text-slate-500",
        )}>
          {isUp && <TrendingUp className="h-2.5 w-2.5" />}
          {isDn && <TrendingDown className="h-2.5 w-2.5" />}
          {trend}
        </span>
      </div>
    </div>
  );
}

// ─── HeroMetricCard (gradiente, destaque) ────────────────────────────────────

export function HeroMetricCard({
  icon: Icon, label, value, sub1Label, sub1Value, sub2Label, sub2Value, series, accent = "cyan",
}: {
  icon: LucideIcon; label: string; value: string;
  sub1Label: string; sub1Value: string; sub2Label: string; sub2Value: string;
  series: number[]; accent?: "cyan" | "emerald";
}) {
  const color  = accent === "cyan" ? "#22d3ee" : "#34d399";
  const colorB = accent === "cyan" ? "#0e7490" : "#065f46";

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, ${colorB} 0%, rgba(13,17,23,0.6) 100%)`,
        border:     `1px solid rgba(${accent === "cyan" ? "34,211,238" : "52,211,153"},0.3)`,
      }}
    >
      {/* bg glow */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-20"
        style={{ background: color, filter: "blur(32px)" }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/60">{label}</p>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
        <p className="mt-3 font-mono text-[32px] font-bold leading-none text-white">{value}</p>
        <MiniSparkline className="mt-4" color="#ffffff" data={series} opacity={0.5} />
        <div className="mt-3 flex gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-white/50">{sub1Label}</p>
            <p className="font-mono text-[14px] font-semibold text-white">{sub1Value}</p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-white/50">{sub2Label}</p>
            <p className="font-mono text-[14px] font-semibold text-white">{sub2Value}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MetricRow ────────────────────────────────────────────────────────────────

export function MetricRow({ children }: { children: ReactNode }) {
  return <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">{children}</div>;
}

// AreaChartPanel and BarChartPanel live in ./charts.tsx ("use client")
// Import them from there when needed in client components or page files.

// ─── MiniSparkline ────────────────────────────────────────────────────────────

export function MiniSparkline({ data, color, className, opacity = 1 }: {
  data: number[]; color: string; className?: string; opacity?: number;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const r   = Math.max(max - min, 1);
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * 100;
    const y = 26 - ((v - min) / r) * 22;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg
      className={cn("h-10 w-full overflow-visible", className)}
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      style={{ opacity }}
    >
      <line x1="0" y1="27" x2="100" y2="27" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <polyline points={`${pts} 100,28 0,28`} fill={color} fillOpacity="0.12" />
    </svg>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

export function StatusBadge({ status, label }: { status: StatusTone; label?: string }) {
  const s = statusMap[status];
  const t = toneMap[s.tone];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[9px] uppercase tracking-wide", t.border, t.bg, t.text)}>
      <Icon className="h-2.5 w-2.5" />
      {label ?? s.label}
    </span>
  );
}

// ─── NeonBadge ────────────────────────────────────────────────────────────────

export function NeonBadge({ children, tone = "green" }: { children: ReactNode; tone?: Tone }) {
  const t = toneMap[tone];
  return (
    <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 font-mono text-[9px] uppercase tracking-wide border", t.border, t.bg, t.text)}>
      {children}
    </span>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

export function ProgressBar({ value, tone = "green" }: { value: number; tone?: Tone }) {
  const t = toneMap[tone];
  return (
    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--ch-border)" }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(0, Math.min(value, 100))}%`, backgroundColor: t.fill }}
      />
    </div>
  );
}

// ─── CommandButton ────────────────────────────────────────────────────────────

export function CommandButton({ children, tone = "cyan", onClick }: { children: ReactNode; tone?: Tone; onClick?: () => void }) {
  const t = toneMap[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 font-mono text-[10px] uppercase tracking-wide transition hover:opacity-80", t.border, t.bg, t.text)}
    >
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </button>
  );
}

// ─── StatusBar ────────────────────────────────────────────────────────────────

export function StatusBar({ items }: { items: { label: string; status: StatusTone }[] }) {
  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl px-5 py-3"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      {items.map((item) => {
        const s    = statusMap[item.status];
        const t    = toneMap[s.tone];
        const Icon = s.icon;
        return (
          <div key={item.label} className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", t.dot)} style={{ boxShadow: `0 0 6px ${t.fill}` }} />
            <span className="text-[12px] text-slate-400">{item.label}</span>
            <span className={cn("font-mono text-[10px]", t.text)}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── TelemetryFeed ────────────────────────────────────────────────────────────

export function TelemetryFeed({ items }: { items: { time: string; actor: string; action: string; tone: Tone }[] }) {
  return (
    <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
      {items.map((item) => {
        const t = toneMap[item.tone];
        return (
          <div key={`${item.time}-${item.action}`} className="grid grid-cols-[52px_10px_1fr] items-start gap-x-3 py-3 first:pt-0 last:pb-0">
            <span className="pt-0.5 font-mono text-[10px] text-slate-600">{item.time}</span>
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", t.dot)} style={{ boxShadow: `0 0 5px ${t.fill}` }} />
            <div>
              <span className="text-[12px] font-medium" style={{ color: "var(--ch-text)" }}>{item.actor}</span>
              <span className="mx-2 text-slate-400">·</span>
              <span className="text-[12px] text-slate-500">{item.action}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── AgentCard ────────────────────────────────────────────────────────────────

export function AgentCard({ name, role, status, accuracy, current, accent = "green" }: {
  name: string; role: string; status: StatusTone; accuracy: number; current: string; accent?: Tone;
}) {
  const t = toneMap[accent];
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <StatusBadge status={status} />
          <div className="mt-2 text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{name}</div>
          <div className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{role}</div>
        </div>
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", t.bg)}>
          <span className={cn("font-mono text-[9px] font-bold", t.text)}>AI</span>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-4 text-slate-500">{current}</p>
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[9px] text-slate-600">acurácia</span>
          <span className={cn("font-mono text-[11px] font-medium", t.text)}>{accuracy}%</span>
        </div>
        <ProgressBar value={accuracy} tone={status === "warning" ? "amber" : accent} />
      </div>
    </div>
  );
}

// ─── KpiStat ─────────────────────────────────────────────────────────────────

export function KpiStat({ label, value, tone = "zinc" }: { label: string; value: string; tone?: Tone }) {
  const t = toneMap[tone];
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600">{label}</div>
      <div className={cn("mt-1 font-mono text-[16px] font-bold", t.text)}>{value}</div>
    </div>
  );
}

// ─── DataTable ────────────────────────────────────────────────────────────────

export function DataTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--ch-border)" }}>
            {columns.map((col) => (
              <th key={col} className="pb-3 pr-5 font-mono text-[9px] uppercase tracking-widest text-slate-600 last:pr-0">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="group border-b transition" style={{ borderColor: "var(--ch-border)" }}>
              {row.map((cell, j) => (
                <td key={j} className="py-3 pr-5 text-[12px] last:pr-0">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── LoadingLine ──────────────────────────────────────────────────────────────

export function LoadingLine({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-600">
      <Loader2 className="h-3 w-3 animate-spin text-cyan-500" />
      {label}
    </span>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ label }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      {label && <span className="font-mono text-[9px] uppercase tracking-widest text-slate-700">{label}</span>}
      <div className="flex-1 border-t" style={{ borderColor: "var(--ch-border)" }} />
    </div>
  );
}

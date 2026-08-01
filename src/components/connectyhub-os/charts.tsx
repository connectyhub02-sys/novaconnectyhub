"use client";

import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

// ─── AreaChartPanel ───────────────────────────────────────────────────────────

export function AreaChartPanel({
  title, eyebrow, value, trend, data, color = "#22d3ee", filters, compact = false,
}: {
  title: string; eyebrow?: string; value: string; trend?: string;
  data: { label: string; value: number }[];
  color?: string; filters?: string[]; compact?: boolean;
}) {
  const isUp = trend?.startsWith("+");
  const gradId = `grad-${color.replace("#", "")}`;

  return (
    <div
      className="rounded-2xl"
      style={{
        background: "var(--ch-panel)",
        border: "1px solid var(--ch-border-strong)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.045)",
      }}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between",
          compact ? "gap-2 px-3 py-2.5" : "gap-3 px-5 py-4",
        )}
        style={{
          background: "linear-gradient(90deg, rgba(var(--ch-accent-rgb),0.08), transparent 70%)",
          borderBottom: "1px solid var(--ch-border-strong)",
        }}
      >
        <div>
          {eyebrow && (
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
          )}
          <p className={cn("font-semibold text-white", compact ? "text-[13px]" : "text-[14px]")}>{title}</p>
        </div>
        <div className={cn("flex items-center", compact ? "gap-1.5" : "gap-3")}>
          {trend && (
            <span className={cn(
              "flex items-center gap-1 rounded-lg font-mono",
              compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[11px]",
              isUp ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400",
            )}>
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trend}
            </span>
          )}
          {filters && (
            <div className="flex gap-1">
              {filters.map((f, i) => (
                <button
                  key={f}
                  type="button"
                  className={cn(
                    "rounded-lg font-mono transition",
                    compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]",
                    i === 0 ? "text-white" : "text-slate-500 hover:text-slate-300",
                  )}
                  style={i === 0 ? { background: "var(--ch-panel-2)", border: "1px solid var(--ch-border-strong)" } : {}}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={compact ? "px-3 pb-0 pt-2" : "px-5 pb-1 pt-4"}>
        <p className={cn("font-mono font-bold text-white", compact ? "text-[20px]" : "text-[26px]")}>{value}</p>
      </div>
      <div className={cn("px-2", compact ? "h-[116px] pb-2" : "h-[180px] pb-3")}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "var(--ch-dropdown-bg)", border: "1px solid var(--ch-border-strong)", borderRadius: 10, fontSize: 11 }}
              labelStyle={{ color: "#94a3b8" }}
              itemStyle={{ color }}
            />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── BarChartPanel ────────────────────────────────────────────────────────────

export function BarChartPanel({
  title, eyebrow, data, color = "#22d3ee", filters, action, compact = false,
}: {
  title: string; eyebrow?: string;
  data: { label: string; value: number }[];
  color?: string; filters?: string[]; action?: ReactNode; compact?: boolean;
}) {
  return (
    <div
      className="rounded-2xl"
      style={{
        background: "var(--ch-panel)",
        border: "1px solid var(--ch-border-strong)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.045)",
      }}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between",
          compact ? "gap-2 px-3 py-2.5" : "gap-3 px-5 py-4",
        )}
        style={{
          background: "linear-gradient(90deg, rgba(var(--ch-accent-rgb),0.08), transparent 70%)",
          borderBottom: "1px solid var(--ch-border-strong)",
        }}
      >
        <div>
          {eyebrow && (
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
          )}
          <p className={cn("font-semibold text-white", compact ? "text-[13px]" : "text-[14px]")}>{title}</p>
        </div>
        <div className="flex items-center gap-2">
          {filters && (
            <div className="flex gap-1">
              {filters.map((f, i) => (
                <button
                  key={f}
                  type="button"
                  className={cn(
                    "rounded-lg font-mono transition",
                    compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]",
                    i === 0 ? "text-white" : "text-slate-500",
                  )}
                  style={i === 0 ? { background: "var(--ch-panel-2)", border: "1px solid var(--ch-border-strong)" } : {}}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
          {action}
        </div>
      </div>
      <div className={cn("px-2", compact ? "h-[112px] py-2" : "h-[160px] py-4")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={compact ? 13 : 18}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "var(--ch-dropdown-bg)", border: "1px solid var(--ch-border-strong)", borderRadius: 10, fontSize: 11 }}
              labelStyle={{ color: "#94a3b8" }}
              itemStyle={{ color }}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} fillOpacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

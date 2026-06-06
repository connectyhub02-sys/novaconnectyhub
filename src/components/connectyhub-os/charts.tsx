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
  title, eyebrow, value, trend, data, color = "#22d3ee", filters,
}: {
  title: string; eyebrow?: string; value: string; trend?: string;
  data: { label: string; value: number }[];
  color?: string; filters?: string[];
}) {
  const isUp = trend?.startsWith("+");
  const gradId = `grad-${color.replace("#", "")}`;

  return (
    <div
      className="rounded-2xl"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--ch-border)" }}
      >
        <div>
          {eyebrow && (
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
          )}
          <p className="text-[14px] font-semibold text-white">{title}</p>
        </div>
        <div className="flex items-center gap-3">
          {trend && (
            <span className={cn(
              "flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-[11px]",
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
                    "rounded-lg px-2.5 py-1 font-mono text-[10px] transition",
                    i === 0 ? "text-white" : "text-slate-500 hover:text-slate-300",
                  )}
                  style={i === 0 ? { background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" } : {}}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="px-5 pb-1 pt-4">
        <p className="font-mono text-[26px] font-bold text-white">{value}</p>
      </div>
      <div className="h-[180px] px-2 pb-3">
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
              contentStyle={{ background: "#1a2540", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }}
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
  title, eyebrow, data, color = "#22d3ee", filters, action,
}: {
  title: string; eyebrow?: string;
  data: { label: string; value: number }[];
  color?: string; filters?: string[]; action?: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--ch-border)" }}
      >
        <div>
          {eyebrow && (
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
          )}
          <p className="text-[14px] font-semibold text-white">{title}</p>
        </div>
        <div className="flex items-center gap-2">
          {filters && (
            <div className="flex gap-1">
              {filters.map((f, i) => (
                <button
                  key={f}
                  type="button"
                  className={cn("rounded-lg px-2.5 py-1 font-mono text-[10px] transition", i === 0 ? "text-white" : "text-slate-500")}
                  style={i === 0 ? { background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" } : {}}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
          {action}
        </div>
      </div>
      <div className="h-[160px] px-2 py-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={18}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#1a2540", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }}
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

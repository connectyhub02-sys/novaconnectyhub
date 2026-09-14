"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPreciseCredits } from "./credit-explainer";

type Day = { day: string; requests: number; credits: number };

export function VoiceUsageCharts({ daily }: { daily: Day[] }) {
  const rows = daily.map(item => ({ ...item, credits: Number(item.credits), label: `${item.day.slice(8, 10)}/${item.day.slice(5, 7)}` }));
  const card = "min-w-0 rounded-2xl border border-slate-200 bg-white p-5";
  return <div className="grid min-w-0 gap-5 lg:grid-cols-2">
    <section className={card} aria-label="Gráfico de créditos de voz">
      <h2 className="font-bold">Créditos utilizados</h2>
      <p className="mt-1 text-sm text-slate-500">Seu consumo de voz por dia no período selecionado.</p>
      <div className="mt-5 h-64 min-w-0"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs><linearGradient id="voice-credits-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.28}/><stop offset="100%" stopColor="#2563eb" stopOpacity={0.02}/></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="label" minTickGap={28} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis width={52} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip formatter={value => [formatPreciseCredits(Number(value)), "Créditos"]}/><Area type="monotone" dataKey="credits" stroke="#2563eb" strokeWidth={2} fill="url(#voice-credits-fill)" isAnimationActive={false}/>
      </AreaChart></ResponsiveContainer></div>
      {!rows.length && <p className="mt-2 text-sm text-slate-500">Seu consumo aparecerá aqui após a primeira solicitação.</p>}
    </section>
    <section className={card} aria-label="Gráfico de solicitações de voz">
      <h2 className="font-bold">Solicitações por dia</h2><p className="mt-1 text-sm text-slate-500">Gerações e operações de voz registradas na sua conta.</p>
      <div className="mt-5 h-64 min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="label" minTickGap={28} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis width={44} allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip formatter={value => [Number(value).toLocaleString("pt-BR"), "Solicitações"]}/><Bar dataKey="requests" fill="#14b8a6" radius={[4,4,0,0]} maxBarSize={26} isAnimationActive={false}/>
      </BarChart></ResponsiveContainer></div>
    </section>
    <details className={`${card} lg:col-span-2`}><summary className="cursor-pointer text-sm font-semibold text-blue-800">Ver dados dos gráficos</summary><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Uso diário de voz em UTC</caption><thead><tr><th className="p-3">Data (UTC)</th><th className="p-3">Créditos</th><th className="p-3">Solicitações</th></tr></thead><tbody>{rows.map(row => <tr key={row.day} className="border-t border-slate-100"><td className="p-3">{row.day}</td><td className="p-3">{formatPreciseCredits(row.credits)}</td><td className="p-3">{row.requests}</td></tr>)}</tbody></table>{!rows.length && <p className="p-3 text-sm text-slate-500">Nenhuma solicitação neste período.</p>}</div></details>
  </div>;
}

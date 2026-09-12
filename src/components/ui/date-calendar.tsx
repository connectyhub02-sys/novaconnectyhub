"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { calendarDays, navigateCalendar } from "@/lib/automations/calendar-view";

export function DateCalendar({ value, min, max, onChange, disabled = false }: {
  value: string; min: string; max?: string; onChange: (day: string) => void; disabled?: boolean;
}) {
  const [month, setMonth] = useState(value || min);
  const days = calendarDays(month, "month");
  const format = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { ...options, timeZone: "UTC" });
  return <div className="rounded-xl border border-slate-200 p-3" aria-label="Escolher data">
    <div className="mb-2 flex items-center justify-between gap-2">
      <button type="button" aria-label="Mês anterior" disabled={disabled || month.slice(0, 7) <= min.slice(0, 7)} onClick={() => setMonth(navigateCalendar(month, "month", -1))} className="grid size-10 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="size-4" /></button>
      <span aria-live="polite" className="text-sm font-semibold capitalize">{format(month, { month: "long", year: "numeric" })}</span>
      <button type="button" aria-label="Próximo mês" disabled={disabled || Boolean(max && month.slice(0, 7) >= max.slice(0, 7))} onClick={() => setMonth(navigateCalendar(month, "month", 1))} className="grid size-10 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="size-4" /></button>
    </div>
    <div className="grid grid-cols-7 gap-1">{["D", "S", "T", "Q", "Q", "S", "S"].map((label, index) => <span key={index} className="py-1 text-center text-xs text-slate-500">{label}</span>)}
      {days.map((day) => <button type="button" key={day} aria-label={format(day, { dateStyle: "full" })} aria-pressed={value === day} disabled={disabled || day < min || Boolean(max && day > max)} onClick={() => { setMonth(day); onChange(day); }} className={`min-h-10 min-w-0 rounded-lg text-sm transition focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-25 ${value === day ? "bg-blue-700 font-semibold text-white" : day.slice(0, 7) !== month.slice(0, 7) ? "text-slate-400 hover:bg-blue-50" : "text-slate-800 hover:bg-blue-50"}`}>{Number(day.slice(-2))}</button>)}
    </div>
  </div>;
}

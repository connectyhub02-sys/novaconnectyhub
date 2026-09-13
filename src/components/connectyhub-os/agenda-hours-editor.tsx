"use client";
import type { AgendaResource } from "@/lib/automations/agenda";
type Hours = AgendaResource["weekly_hours"];
const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800";
export function AgendaHoursEditor({ value, onChange }: { value: Hours; onChange: (value: Hours) => void }) {
  return <div className="space-y-4">
    <p className="text-sm text-slate-600">Defina uma ou mais faixas por dia. Intervalos sem faixa ficam indisponíveis. Os horários só serão usados após salvar.</p>
    {value.map((row, index) => <fieldset key={index} className="space-y-3 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium">Faixa {index + 1}</legend>
      <div className="flex flex-wrap gap-3">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day, d) => <label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={row.days.includes(d + 1)} onChange={() => onChange(value.map((r, i) => i !== index ? r : { ...r, days: r.days.includes(d + 1) ? r.days.filter(v => v !== d + 1) : [...r.days, d + 1] }))} />{day}</label>)}</div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Início<input type="time" className={field} value={row.start} onChange={e => onChange(value.map((r, i) => i === index ? { ...r, start: e.target.value } : r))} /></label>
        <label className="grid gap-1 text-sm">Fim<input type="time" className={field} value={row.end} onChange={e => onChange(value.map((r, i) => i === index ? { ...r, end: e.target.value } : r))} /></label>
        <button type="button" className={field} onClick={() => onChange(value.filter((_, i) => i !== index))}>Remover faixa</button>
      </div>
    </fieldset>)}
    <button type="button" className={field} disabled={value.length >= 14} onClick={() => onChange([...value, { days: [], start: "09:00", end: "18:00" }])}>Adicionar faixa de atendimento</button>
  </div>;
}

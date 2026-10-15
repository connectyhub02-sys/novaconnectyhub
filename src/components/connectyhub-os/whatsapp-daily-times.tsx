"use client";

import { maxDailyTimes, normalizeDailyTimes } from "@/lib/whatsapp/fixed-schedule";

export function dailyTimesError(times: string[] | null | undefined) {
  try { normalizeDailyTimes(times); return null; }
  catch (error) { return (error as Error).message; }
}

export function WhatsappDailyTimes({ value, onChange }: { value: string[] | null | undefined; onChange: (times: string[] | null) => void }) {
  const error = dailyTimesError(value);
  const field = "mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  return <div className="grid min-w-0 gap-2">
    <label className="text-xs font-medium text-slate-700">Horários de publicação
      <select className={field} value={value ? "fixed" : "automatic"} onChange={event => onChange(event.target.value === "fixed" ? ["09:00"] : null)}>
        <option value="fixed">Horários fixos escolhidos por mim</option>
        <option value="automatic">Distribuir automaticamente</option>
      </select>
    </label>
    {value && <>
      {value.map((time, index) => <div key={index} className="flex min-w-0 items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-medium text-slate-700">Horário {index + 1} (Brasília)
          <input type="time" step="60" required className={field} value={time} onChange={event => onChange(value.map((current, i) => i === index ? event.target.value : current))} />
        </label>
        <button type="button" aria-label={`Remover horário ${index + 1}`} disabled={value.length === 1} onClick={() => onChange(value.filter((_, i) => i !== index))} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Remover</button>
      </div>)}
      <button type="button" disabled={value.length >= maxDailyTimes} onClick={() => onChange([...value, ["14:00", "18:00", "09:00", "12:00", "20:00", "08:00"].find(time => !value.includes(time))!])} className="justify-self-start rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Adicionar horário</button>
      <p className="text-xs text-slate-500">{value.length} publicação(ões) por dia e por destino, nos horários escolhidos. Até 5 horários. Horários já passados são ignorados; a entrega pode levar alguns minutos conforme a fila e a conexão do WhatsApp.</p>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </>}
  </div>;
}

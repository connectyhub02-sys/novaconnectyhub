"use client";

import { operationLaneLabels, operationLanes, readOperationHours, type SalesCatalogOperationHours } from "@/lib/sales-catalog/operation-hours";

const field = "mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-transparent px-3 text-sm";
function pauseLabel(policy: SalesCatalogOperationHours) { try { return policy.pausedUntil ? `Pausa até ${new Date(policy.pausedUntil).toLocaleString("pt-BR", { timeZone: policy.timeZone })}` : "Sem pausa temporária"; } catch { return "Confira o fuso e a data da pausa."; } }
const days = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export function OperationHoursEditor({ value, onChange }: { value?: SalesCatalogOperationHours; onChange: (value: SalesCatalogOperationHours) => void }) {
  const policy = readOperationHours(value);
  const update = (patch: Partial<SalesCatalogOperationHours>) => onChange({ ...policy, ...patch });
  return <section className="mt-4 rounded-xl border border-slate-600 p-3 text-slate-200">
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">Horários da operação<input type="checkbox" checked={policy.enabled} onChange={event => update({ enabled: event.target.checked })} /></label>
    <p className="text-xs leading-5 text-slate-400">Defina quando receber pedidos, preparar, entregar e permitir retirada. Dias fechados e pausas prevalecem. Fora dessas janelas, novos pedidos e alterações aguardam atendimento.</p>
    {policy.enabled ? <div className="mt-4 space-y-4">
      <label className="block text-xs">Fuso da operação<input value={policy.timeZone} onChange={event => update({ timeZone: event.target.value })} className={field} placeholder="America/Sao_Paulo" /><span className="mt-1 block text-slate-400">Use o identificador da região, por exemplo America/Manaus. Os horários abaixo seguem esse fuso.</span></label>
      {operationLanes.map(lane => {
        const schedule = policy.schedules[lane];
        const change = (patch: Partial<typeof schedule>) => update({ schedules: { ...policy.schedules, [lane]: { ...schedule, ...patch } } });
        return <fieldset key={lane} className="rounded-lg border border-slate-700 p-3">
          <legend className="px-1 text-sm font-semibold">{operationLaneLabels[lane]}</legend>
          <label className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={schedule.enabled} onChange={event => change({ enabled: event.target.checked })} />Conferir esta janela</label>
          {schedule.enabled ? <div className="space-y-3">{schedule.windows.map((window, index) => <div key={index} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="col-span-2 text-xs sm:col-span-1">Dia<select value={window.day} onChange={event => change({ windows: schedule.windows.map((row, at) => at === index ? { ...row, day: Number(event.target.value) } : row) })} className={`${field} bg-[var(--ch-panel)]`}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
            {(["start", "end"] as const).map(key => <label key={key} className="text-xs">{key === "start" ? "Abre às" : "Fecha às"}<input value={window[key]} maxLength={5} placeholder="HH:mm" onChange={event => change({ windows: schedule.windows.map((row, at) => at === index ? { ...row, [key]: event.target.value } : row) })} className={field} /></label>)}
            <button type="button" className="min-h-11 px-2 text-xs text-rose-300" onClick={() => change({ windows: schedule.windows.filter((_, at) => at !== index) })}>Remover janela</button>
          </div>)}<button type="button" className="min-h-11 text-xs font-semibold text-cyan-300" onClick={() => change({ windows: [...schedule.windows, { day: 0, start: "", end: "" }] })}>Adicionar janela</button><p className="text-xs leading-5 text-slate-400">O fechamento anterior à abertura termina no dia seguinte. Para o dia inteiro, use 00:00 até 24:00. Cadastre duas janelas para intervalos.</p></div> : <p className="text-xs text-slate-400">Esta etapa não limita o horário do pedido.</p>}
        </fieldset>;
      })}
      <label className="block text-xs">Datas fechadas<textarea value={policy.closedDates.join("\n")} onChange={event => update({ closedDates: event.target.value ? event.target.value.split("\n").map(date => date.trim()) : [] })} className={`${field} min-h-24 py-2`} placeholder={"AAAA-MM-DD\nUma data por linha"} /><span className="mt-1 block text-slate-400">Inclua os feriados e dias fechados desta empresa. Nenhum calendário de feriados é presumido.</span></label>
      <div className="rounded-lg border border-slate-700 p-3 text-xs"><p>{pauseLabel(policy)}</p><div className="mt-2 flex flex-wrap gap-3"><button type="button" className="min-h-11 text-cyan-300" onClick={() => update({ pausedUntil: new Date(Date.now() + 60 * 60000).toISOString() })}>Pausar por uma hora</button><button type="button" className="min-h-11 text-cyan-300" onClick={() => update({ pausedUntil: null })}>Retomar</button></div><p className="text-slate-400">A pausa e a retomada entram em vigor ao salvar as configurações.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">{(["preparationMinutes", "deliveryMinutes"] as const).map(key => {
        const range = policy[key];
        return <fieldset key={key} className="rounded-lg border border-slate-700 p-3"><legend className="px-1 text-xs">{key === "preparationMinutes" ? "Estimativa de preparo" : "Estimativa de entrega após preparo"}</legend><label className="flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(range)} onChange={event => update({ [key]: event.target.checked ? { min: NaN, max: NaN } : null })} />Informar estimativa em minutos</label>{range ? <div className="grid grid-cols-2 gap-2">{(["min", "max"] as const).map(bound => <label key={bound} className="text-xs">{bound === "min" ? "Mínimo" : "Máximo"}<input type="number" min={0} max={720} value={Number.isFinite(range[bound]) ? range[bound] : ""} onChange={event => update({ [key]: { ...range, [bound]: event.target.value === "" ? NaN : Number(event.target.value) } })} className={field} /></label>)}</div> : null}</fieldset>;
      })}</div>
      <p className="text-xs leading-5 text-slate-400">Estimativas são opcionais e não reservam capacidade. Se o tempo informado ultrapassar uma janela configurada, o pedido exige outro horário. Alterar horários não cancela pedidos, reservas ou pagamentos já existentes.</p>
    </div> : null}
  </section>;
}

"use client";

import { useState } from "react";
import { readOperationHours, validateOperationHours, type OperationLane, type OperationSchedule, type OperationWindow, type SalesCatalogOperationHours } from "@/lib/sales-catalog/operation-hours";

const field = "min-h-10 rounded-lg border border-slate-600 bg-transparent px-2 text-sm";
// Monday first, like Brazilian storefronts; values follow Date#getDay (0 = Sunday).
const weekDays: Array<[number, string]> = [[1, "Segunda"], [2, "Terça"], [3, "Quarta"], [4, "Quinta"], [5, "Sexta"], [6, "Sábado"], [0, "Domingo"]];
const timeZones: Array<[string, string]> = [
  ["America/Sao_Paulo", "Brasília (maior parte do Brasil)"],
  ["America/Manaus", "Amazonas, Roraima e Rondônia (-1h)"],
  ["America/Cuiaba", "Mato Grosso e Mato Grosso do Sul (-1h)"],
  ["America/Rio_Branco", "Acre (-2h)"],
  ["America/Noronha", "Fernando de Noronha (+1h)"],
];
const lanes: OperationLane[] = ["orders", "preparation", "delivery", "pickup"];

function sameWindows(left: OperationWindow[], right: OperationWindow[]) {
  const key = (rows: OperationWindow[]) => rows.map(row => `${row.day}-${row.start}-${row.end}`).sort().join("|");
  return key(left) === key(right);
}

/** One weekly schedule for everything, unless the store set delivery or pickup hours apart. */
function readMainSchedule(policy: SalesCatalogOperationHours) {
  return policy.schedules.orders.enabled ? policy.schedules.orders.windows : policy.schedules.preparation.windows;
}

function hasSeparateHours(policy: SalesCatalogOperationHours) {
  const main = readMainSchedule(policy);
  return lanes.some(lane => policy.schedules[lane].enabled && !sameWindows(policy.schedules[lane].windows, main));
}

const schedule = (windows: OperationWindow[]): OperationSchedule => ({ enabled: true, windows });

/** The main week drives receiving orders and preparation; delivery and pickup follow it unless the store set them apart. */
export function withMainWeek(policy: SalesCatalogOperationHours, windows: OperationWindow[], separate: boolean): SalesCatalogOperationHours {
  return { ...policy, schedules: {
    orders: schedule(windows), preparation: schedule(windows),
    delivery: separate ? policy.schedules.delivery : schedule(windows),
    pickup: separate ? policy.schedules.pickup : schedule(windows),
  } };
}

/** Turning the control on for the first time starts every day at 18:00–23:00, like a typical evening delivery. */
export function withHoursEnabled(policy: SalesCatalogOperationHours, enabled: boolean): SalesCatalogOperationHours {
  if (!enabled || readMainSchedule(policy).length) return { ...policy, enabled };
  return withMainWeek({ ...policy, enabled: true }, weekDays.map(([day]) => ({ day, start: "18:00", end: "23:00" })), false);
}

/** "Copiar para todos": the hours of one day become the hours of the whole week. */
export function copyDayToWeek(windows: OperationWindow[], day: number): OperationWindow[] {
  const rows = windows.filter(window => window.day === day);
  return weekDays.flatMap(([other]) => rows.map(row => ({ ...row, day: other })));
}

function WeekSchedule({ windows, onChange }: { windows: OperationWindow[]; onChange: (windows: OperationWindow[]) => void }) {
  const forDay = (day: number) => windows.filter(window => window.day === day);
  const replaceDay = (day: number, rows: OperationWindow[]) => onChange([...windows.filter(window => window.day !== day), ...rows]);

  return <div className="space-y-2">
    {weekDays.map(([day, label]) => {
      const rows = forDay(day);
      const open = rows.length > 0;
      const allDay = rows.length === 1 && rows[0].start === "00:00" && rows[0].end === "24:00";
      return <div key={day} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 px-2 py-1.5">
        <span className="w-20 text-sm font-medium">{label}</span>
        <button type="button" onClick={() => replaceDay(day, open ? [] : [{ day, start: "18:00", end: "23:00" }])}
          className={`min-h-9 rounded-full px-3 text-xs font-semibold ${open ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-700/60 text-slate-300"}`} aria-pressed={open}>
          {open ? "Aberto" : "Fechado"}
        </button>
        {open && !allDay ? rows.map((row, index) => <span key={index} className="flex items-center gap-1 text-xs">
          <input type="time" value={row.start} aria-label={`${label}: abre às`} onChange={event => replaceDay(day, rows.map((item, at) => at === index ? { ...item, start: event.target.value } : item))} className={field} />
          às
          <input type="time" value={row.end === "24:00" ? "23:59" : row.end} aria-label={`${label}: fecha às`} onChange={event => replaceDay(day, rows.map((item, at) => at === index ? { ...item, end: event.target.value === "23:59" ? "24:00" : event.target.value } : item))} className={field} />
          {rows.length > 1 ? <button type="button" className="px-1 text-rose-300" aria-label="Remover intervalo" onClick={() => replaceDay(day, rows.filter((_, at) => at !== index))}>×</button> : null}
        </span>) : null}
        {open ? <span className="ml-auto flex flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" checked={allDay} onChange={event => replaceDay(day, event.target.checked ? [{ day, start: "00:00", end: "24:00" }] : [{ day, start: "18:00", end: "23:00" }])} />24h</label>
          {!allDay && rows.length < 3 ? <button type="button" className="text-cyan-300" onClick={() => replaceDay(day, [...rows, { day, start: "", end: "" }])}>+ intervalo</button> : null}
          <button type="button" className="text-cyan-300" onClick={() => onChange(copyDayToWeek(windows, day))}>Copiar para todos</button>
        </span> : null}
      </div>;
    })}
    <p className="text-xs leading-5 text-slate-400">Fechamento depois da meia-noite (ex.: 18:00 às 02:00) conta como o mesmo turno. Use &quot;+ intervalo&quot; para almoço e jantar.</p>
  </div>;
}

function MinutesRange({ label, value, onChange }: { label: string; value: SalesCatalogOperationHours["preparationMinutes"]; onChange: (value: SalesCatalogOperationHours["preparationMinutes"]) => void }) {
  const set = (bound: "min" | "max", text: string) => {
    const next = { min: value?.min ?? NaN, max: value?.max ?? NaN, [bound]: text === "" ? NaN : Number(text) };
    onChange(Number.isNaN(next.min) && Number.isNaN(next.max) ? null : next);
  };
  return <span className="flex items-center gap-1 text-xs">
    <span className="text-slate-300">{label}</span>
    <input type="number" min={0} max={720} aria-label={`${label}: mínimo`} value={value && Number.isFinite(value.min) ? value.min : ""} onChange={event => set("min", event.target.value)} className={`${field} w-16`} />
    a
    <input type="number" min={0} max={720} aria-label={`${label}: máximo`} value={value && Number.isFinite(value.max) ? value.max : ""} onChange={event => set("max", event.target.value)} className={`${field} w-16`} />
    min
  </span>;
}

export function OperationHoursEditor({ value, onChange }: { value?: SalesCatalogOperationHours; onChange: (value: SalesCatalogOperationHours) => void }) {
  const policy = readOperationHours(value);
  const [advanced, setAdvanced] = useState(() => hasSeparateHours(policy) || policy.timeZone !== "America/Sao_Paulo");
  const [newClosedDate, setNewClosedDate] = useState("");
  const [separate, setSeparate] = useState(() => hasSeparateHours(policy));
  const update = (patch: Partial<SalesCatalogOperationHours>) => onChange({ ...policy, ...patch });
  const main = readMainSchedule(policy);
  const setMain = (windows: OperationWindow[]) => onChange(withMainWeek(policy, windows, separate));
  const setLane = (lane: "delivery" | "pickup", windows: OperationWindow[]) => update({ schedules: { ...policy.schedules, [lane]: schedule(windows) } });
  const [openedAt] = useState(() => Date.now());
  const paused = Boolean(policy.pausedUntil && Date.parse(policy.pausedUntil) > openedAt);
  const problem = policy.enabled ? validateOperationHours(policy) : null;

  return <div className="space-y-4 text-slate-200">
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
      Controlar horário de funcionamento
      <input type="checkbox" checked={policy.enabled} onChange={event => onChange(withHoursEnabled(policy, event.target.checked))} />
    </label>
    {!policy.enabled ? <p className="text-xs leading-5 text-slate-400">Desligado: o agente atende e fecha pedidos a qualquer hora.</p> : <>
      <p className="text-xs leading-5 text-slate-400">O agente conversa a qualquer hora, mas só fecha pedidos com a loja aberta. Fora do horário ele avisa quando a loja abre.</p>
      <WeekSchedule windows={main} onChange={setMain} />

      <div className="flex flex-wrap gap-4 rounded-lg border border-slate-700 p-2">
        <span className="text-xs font-semibold">Tempo médio</span>
        <MinutesRange label="Preparo" value={policy.preparationMinutes} onChange={preparationMinutes => update({ preparationMinutes })} />
        <MinutesRange label="Entrega" value={policy.deliveryMinutes} onChange={deliveryMinutes => update({ deliveryMinutes })} />
      </div>

      <div className="rounded-lg border border-slate-700 p-2 text-xs">
        <p className="font-semibold">Feriados e dias fechados</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {policy.closedDates.map(date => <span key={date} className="flex items-center gap-1 rounded-full bg-slate-700/60 px-2 py-1">
            {date.split("-").reverse().join("/")}
            <button type="button" aria-label={`Remover ${date}`} className="text-rose-300" onClick={() => update({ closedDates: policy.closedDates.filter(item => item !== date) })}>×</button>
          </span>)}
          <input type="date" value={newClosedDate} onChange={event => setNewClosedDate(event.target.value)} className={field} aria-label="Nova data fechada" />
          <button type="button" className="min-h-10 text-cyan-300" disabled={!newClosedDate} onClick={() => { if (newClosedDate && !policy.closedDates.includes(newClosedDate)) update({ closedDates: [...policy.closedDates, newClosedDate].sort() }); setNewClosedDate(""); }}>Adicionar</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 p-2 text-xs">
        {paused
          ? <><span className="text-amber-200">Pedidos pausados até {new Date(policy.pausedUntil!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: policy.timeZone })}.</span><button type="button" className="min-h-10 font-semibold text-cyan-300" onClick={() => update({ pausedUntil: null })}>Reabrir agora</button></>
          : <><span className="text-slate-300">Dia cheio?</span><button type="button" className="min-h-10 font-semibold text-cyan-300" onClick={() => update({ pausedUntil: new Date(Date.now() + 60 * 60000).toISOString() })}>Pausar pedidos por 1 hora</button></>}
        <span className="text-slate-400">Vale depois de salvar.</span>
      </div>

      <button type="button" className="text-xs font-semibold text-cyan-300" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>{advanced ? "▾" : "▸"} Avançado</button>
      {advanced ? <div className="space-y-3 rounded-lg border border-slate-700 p-3">
        <label className="block text-xs">Fuso horário
          <select value={policy.timeZone} onChange={event => update({ timeZone: event.target.value })} className={`${field} mt-1 w-full bg-[var(--ch-panel)]`}>
            {timeZones.some(([zone]) => zone === policy.timeZone) ? null : <option value={policy.timeZone}>{policy.timeZone}</option>}
            {timeZones.map(([zone, label]) => <option key={zone} value={zone}>{label}</option>)}
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 text-xs">
          <input type="checkbox" checked={separate} onChange={event => {
            setSeparate(event.target.checked);
            // Starting apart copies the main week; going back makes delivery and pickup follow it again.
            update({ schedules: { ...policy.schedules, delivery: schedule(main.map(row => ({ ...row }))), pickup: schedule(main.map(row => ({ ...row }))) } });
          }} />
          Horários diferentes para entrega e retirada
        </label>
        {separate ? (["delivery", "pickup"] as const).map(lane => <div key={lane}>
          <p className="mb-1 text-xs font-semibold">{lane === "delivery" ? "Entrega" : "Retirada no balcão"}</p>
          <WeekSchedule windows={policy.schedules[lane].windows} onChange={windows => setLane(lane, windows)} />
        </div>) : null}
      </div> : null}
      {problem ? <p role="alert" className="text-xs text-amber-300">{problem}</p> : null}
    </>}
  </div>;
}

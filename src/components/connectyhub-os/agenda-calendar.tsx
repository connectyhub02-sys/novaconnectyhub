"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AgendaBooking, AgendaResource } from "@/lib/automations/agenda";
import { calendarDate, calendarDays, calendarRange, minutesInDay, navigateCalendar, type CalendarView } from "@/lib/automations/calendar-view";

const control = "inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const colors: Record<string, string> = { booked: "border-blue-200 bg-blue-50 text-blue-800", completed: "border-emerald-200 bg-emerald-50 text-emerald-800", cancelled: "border-slate-200 bg-slate-100 text-slate-500 line-through", no_show: "border-amber-200 bg-amber-50 text-amber-800" };
const statuses: Record<string, string> = { booked: "Reservado", completed: "Realizado", cancelled: "Cancelado", no_show: "Não compareceu" };

export function AgendaCalendar({ companyId, timezone, resources, revision, onSelect }: {
  companyId: string; timezone: string; resources: AgendaResource[]; revision: number; onSelect: (booking: AgendaBooking) => void;
}) {
  const today = calendarDate(new Date(), timezone);
  const [date, setDate] = useState(today);
  const [view, setView] = useState<CalendarView>("month");
  const [resource, setResource] = useState("");
  const [result, setResult] = useState<{ key: string; bookings: AgendaBooking[]; truncated: boolean } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const days = calendarDays(date, view);
  const range = calendarRange(days);
  const query = new URLSearchParams({ companyId, ...range }).toString();
  const key = `${query}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard/agenda?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os compromissos.");
        if (!controller.signal.aborted) setResult({ key, bookings: data.bookings, truncated: data.truncated });
      }).catch((failure) => { if (!controller.signal.aborted) setError({ key, message: failure.message }); });
    return () => controller.abort();
  }, [query, key]);

  const loading = result?.key !== key && error?.key !== key;
  const bookings = result?.key === key ? result.bookings.filter((booking) => !resource || booking.resource_id === resource) : [];
  const dateLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { ...options, timeZone: "UTC" });
  const timeLabel = (value: string) => new Date(value).toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
  const eventsFor = (day: string) => bookings.filter((booking) => calendarDate(booking.starts_at, timezone) <= day && calendarDate(new Date(Date.parse(booking.ends_at) - 1), timezone) >= day);
  const eventLabel = (booking: AgendaBooking) => `${timeLabel(booking.starts_at)} · ${booking.lead?.display_name ?? "Contato cadastrado"} · ${resources.find((item) => item.id === booking.resource_id)?.name ?? "Atendimento"} · ${statuses[booking.status] ?? booking.status}`;

  return <section aria-label="Calendário de compromissos" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 sm:p-4">
      <button type="button" className={control} onClick={() => setDate(today)}>Hoje</button>
      <div className="flex gap-1">
        <button type="button" className={control} aria-label="Período anterior" onClick={() => setDate(navigateCalendar(date, view, -1))}><ChevronLeft className="size-4" /></button>
        <button type="button" className={control} aria-label="Próximo período" onClick={() => setDate(navigateCalendar(date, view, 1))}><ChevronRight className="size-4" /></button>
      </div>
      <h2 aria-live="polite" className="order-first w-full min-w-0 text-base font-semibold capitalize text-slate-800 sm:order-none sm:w-auto sm:flex-1">{view === "month" ? dateLabel(date, { month: "long", year: "numeric" }) : view === "day" ? dateLabel(date, { day: "numeric", month: "long", year: "numeric" }) : `${dateLabel(days[0], { day: "numeric", month: "short" })} – ${dateLabel(days[6], { day: "numeric", month: "short", year: "numeric" })}`}</h2>
      <select aria-label="Visualização do calendário" className={control} value={view} onChange={(event) => setView(event.target.value as CalendarView)}><option value="month">Mês</option><option value="week">Semana</option><option value="day">Dia</option></select>
      <select aria-label="Filtrar recurso" className={`${control} max-w-full`} value={resource} onChange={(event) => setResource(event.target.value)}><option value="">Todos os recursos</option>{resources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </div>
    <div className="flex flex-wrap gap-3 px-4 py-2 text-xs text-slate-500"><span>{timezone}</span>{Object.entries(statuses).map(([status, label]) => <span key={status} className="flex items-center gap-1"><span className={`size-2 rounded-full border ${colors[status]}`} />{label}</span>)}</div>
    {loading && <p role="status" className="px-4 py-2 text-sm text-slate-500">Carregando compromissos…</p>}
    {error?.key === key && <p role="alert" className="px-4 py-2 text-sm text-rose-700">{error.message} Use Atualizar para tentar novamente.</p>}
    {result?.key === key && result.truncated && <p role="status" className="px-4 py-2 text-sm text-amber-800">Este período atingiu o limite de 1.000 compromissos. Selecione Semana ou Dia para consultar um período menor.</p>}
    {result?.key === key && !bookings.length && <p className="px-4 py-2 text-sm text-slate-500">Nenhum compromisso neste período{resource ? " para este recurso" : ""}.</p>}
    {view === "month" ? <>
      <div className="grid grid-cols-7 border-y border-slate-200">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => <div key={day} className="py-2 text-center text-xs font-medium text-slate-500">{day}</div>)}</div>
      <div className="grid grid-cols-7">{days.map((day) => {
        const events = eventsFor(day);
        return <div key={day} className={`min-h-24 min-w-0 border-b border-r border-slate-100 p-1 sm:min-h-32 sm:p-2 ${day.slice(0, 7) !== date.slice(0, 7) ? "bg-slate-50" : ""}`}>
          <button type="button" aria-label={dateLabel(day, { dateStyle: "full" })} onClick={() => { setDate(day); setView("day"); }} className={`mx-auto mb-1 grid size-8 place-items-center rounded-full text-xs hover:ring-2 hover:ring-blue-200 ${day === today ? "bg-blue-600 font-bold text-white" : "text-slate-600"}`}>{Number(day.slice(-2))}</button>
          {events.slice(0, 3).map((booking) => <button type="button" key={booking.id} title={eventLabel(booking)} aria-label={eventLabel(booking)} onClick={() => onSelect(booking)} className={`mb-1 block w-full truncate rounded border px-1 py-1 text-left text-[10px] sm:text-xs ${colors[booking.status] ?? colors.booked}`}><span className="font-semibold">{timeLabel(booking.starts_at)}</span><span className="hidden sm:inline"> {booking.lead?.display_name ?? resources.find((item) => item.id === booking.resource_id)?.name ?? "Reserva"}</span></button>)}
          {events.length > 3 && <button type="button" className="w-full rounded py-1 text-xs text-blue-700 hover:bg-blue-50" onClick={() => { setDate(day); setView("day"); }}>+{events.length - 3}</button>}
        </div>;
      })}</div>
    </> : <div className="max-h-[680px] overflow-auto" tabIndex={0} aria-label="Grade de horários, role para ver todo o dia">
      <div style={{ minWidth: view === "week" ? 740 : undefined }}>
        <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}><div />{days.map((day) => <button type="button" key={day} onClick={() => { setDate(day); setView("day"); }} className={`py-3 text-center text-sm ${day === today ? "font-bold text-blue-700" : "text-slate-600"}`}>{dateLabel(day, { weekday: "short", day: "numeric" })}</button>)}</div>
        <div className="grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="h-16 pr-2 pt-1 text-right text-[10px] text-slate-400">{String(hour).padStart(2, "0")}:00</div>)}</div>
          {days.map((day) => {
            const events = eventsFor(day).map((booking) => ({ booking, start: calendarDate(booking.starts_at, timezone) < day ? 0 : minutesInDay(booking.starts_at, timezone), end: calendarDate(booking.ends_at, timezone) > day ? 1440 : minutesInDay(booking.ends_at, timezone) })).sort((a, b) => a.start - b.start);
            // Use lanes for simultaneous bookings so every event remains reachable.
            const lanes: number[] = [];
            const positioned = events.map((event) => { let lane = lanes.findIndex((end) => end <= event.start); if (lane < 0) lane = lanes.length; lanes[lane] = event.end; return { ...event, lane }; });
            return <div key={day} className="relative h-[1536px] border-l border-slate-200 bg-[linear-gradient(to_bottom,transparent_63px,#e2e8f0_64px)] bg-[length:100%_64px]">{positioned.map(({ booking, start, end, lane }) => <button type="button" key={booking.id} title={eventLabel(booking)} aria-label={eventLabel(booking)} onClick={() => onSelect(booking)} className={`absolute overflow-hidden rounded-md border px-1 text-left text-xs ${colors[booking.status] ?? colors.booked}`} style={{ top: start / 60 * 64, height: Math.max(22, (end - start) / 60 * 64), left: `${lane / lanes.length * 100}%`, width: `${100 / lanes.length}%` }}><strong className="block truncate">{booking.lead?.display_name ?? "Contato cadastrado"}</strong><span className="block truncate">{timeLabel(booking.starts_at)} – {timeLabel(booking.ends_at)}</span><span className="block truncate">{resources.find((item) => item.id === booking.resource_id)?.name}</span></button>)}</div>;
          })}
        </div>
      </div>
    </div>}
  </section>;
}

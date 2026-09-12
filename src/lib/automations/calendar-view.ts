export type CalendarView = "month" | "week" | "day";

export const agendaTimezones: Record<string, string> = {
  "America/Sao_Paulo": "Horário de Brasília",
  "America/Manaus": "Horário de Manaus",
  "America/Rio_Branco": "Horário do Acre",
  "America/Noronha": "Horário de Fernando de Noronha",
};
export function agendaTimezoneLabel(timezone: string) { return agendaTimezones[timezone] ?? timezone.replaceAll("_", " "); }

// Calendar dates are wall-clock dates in the company's timezone, never the device's.
export function calendarDate(value: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function calendarDays(date: string, view: CalendarView) {
  if (view === "day") return [date];
  const first = view === "month" ? `${date.slice(0, 7)}-01` : date;
  const start = shiftDate(first, -new Date(`${first}T12:00:00Z`).getUTCDay());
  return Array.from({ length: view === "month" ? 42 : 7 }, (_, index) => shiftDate(start, index));
}

export function navigateCalendar(date: string, view: CalendarView, direction: number) {
  if (view !== "month") return shiftDate(date, direction * (view === "week" ? 7 : 1));
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + direction);
  return value.toISOString().slice(0, 10);
}

export function minutesInDay(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  return Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
}

export function calendarRange(days: string[]) {
  // A UTC margin covers all timezones, including midnight and DST transitions.
  return { from: `${shiftDate(days[0], -1)}T00:00:00.000Z`, to: `${shiftDate(days.at(-1)!, 2)}T00:00:00.000Z` };
}

export function parseCalendarRange(from: string | null, to: string | null) {
  if (!from && !to) return undefined;
  const start = Date.parse(from ?? ""), end = Date.parse(to ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 45 * 86400000) {
    throw new Error("Informe um período válido de até 45 dias.");
  }
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

const dayMs = 86_400_000;
const offsetMs = 3 * 3_600_000;
export const maxDailyTimes = 5;

export function normalizeDailyTimes(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > maxDailyTimes
    || value.some(time => typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    throw new Error("Escolha de 1 a 5 horários válidos, no formato HH:mm.");
  }
  if (new Set(value).size !== value.length) throw new Error("Escolha horários diferentes para cada publicação.");
  return [...value].sort();
}

export const brasiliaMidnight = (time: number) => Math.floor((time - offsetMs) / dayMs) * dayMs + offsetMs;
const atTime = (midnight: number, time: string) => midnight + (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * 60_000;

/** Fixed slots never move a missed publication to an arbitrary time. */
export function nextFixedRoutineDay(now: Date, startsAt: string, plannedUntil: string | null, dailyTimes: string[]) {
  const times = normalizeDailyTimes(dailyTimes)!;
  const after = Math.max(now.getTime(), Date.parse(startsAt), plannedUntil ? Date.parse(plannedUntil) : 0);
  if (!Number.isFinite(after)) throw new Error("Data de agendamento inválida.");
  let midnight = brasiliaMidnight(after);
  let slots = times.map(time => atTime(midnight, time)).filter(time => time >= after);
  if (!slots.length) {
    midnight += dayMs;
    slots = times.map(time => atTime(midnight, time));
  }
  return { slots: slots.map(time => new Date(time).toISOString()), plannedUntil: new Date(midnight + dayMs).toISOString() };
}

/** Finite administrative plans retain their requested calendar period. */
export function fixedPlanSlots(startFrom: string, days: number, dailyTimes: string[], now = new Date()) {
  const times = normalizeDailyTimes(dailyTimes)!;
  const start = Date.parse(startFrom);
  if (!Number.isFinite(start)) throw new Error("Data de agendamento inválida.");
  const midnight = brasiliaMidnight(start);
  const after = Math.max(start, now.getTime());
  const slots = Array.from({ length: days }, (_, day) => times.map(time => atTime(midnight + day * dayMs, time)))
    .flat().filter(time => time >= after).map(time => new Date(time).toISOString());
  if (!slots.length) throw new Error("Os horários deste período já passaram. Escolha uma nova data de início.");
  return slots;
}

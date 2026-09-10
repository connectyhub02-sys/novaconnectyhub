export function localContactTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? "0";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    minute: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

function minutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new Error("Horário inválido.");
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function isContactWindow(
  date: Date,
  start: string,
  end: string,
  timezone: string,
) {
  const from = minutes(start),
    to = minutes(end);
  const now = localContactTime(date, timezone).minute;
  if (from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

export function nextContactWindow(
  date: Date,
  start: string,
  end: string,
  timezone: string,
) {
  if (isContactWindow(date, start, end, timezone)) return date;
  const candidate = new Date(Math.ceil(date.getTime() / 60000) * 60000);
  // UTC iteration handles timezone offsets, DST gaps and overnight windows.
  for (
    let count = 0;
    count < 60 * 48;
    count++, candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)
  ) {
    if (isContactWindow(candidate, start, end, timezone))
      return new Date(candidate);
  }
  throw new Error("Nenhuma janela de contato disponível.");
}

export function observedContactWindow(timestamps: string[], timezone: string) {
  const daysByHour = new Map<number, Set<string>>();
  for (const value of timestamps) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) continue;
    const local = localContactTime(date, timezone),
      hour = Math.floor(local.minute / 60);
    const days = daysByHour.get(hour) ?? new Set<string>();
    days.add(local.day);
    daysByHour.set(hour, days);
  }
  const best = [...daysByHour].sort(
    (a, b) => b[1].size - a[1].size || a[0] - b[0],
  )[0];
  const weekdays = new Map<number, number>();
  for (const day of best?.[1] ?? []) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    weekdays.set(weekday, (weekdays.get(weekday) ?? 0) + 1);
  }
  const topWeekday = [...weekdays].sort((a, b) => b[1] - a[1])[0];
  const weekday =
    topWeekday &&
    topWeekday[1] >= 3 &&
    topWeekday[1] / (best?.[1].size ?? 1) >= 0.6
      ? topWeekday[0]
      : null;
  return best && best[1].size >= 3
    ? {
        hour: best[0],
        weekday,
        observedDays: best[1].size,
        confidence: best[1].size >= 8 ? ("medium" as const) : ("low" as const),
      }
    : null;
}

export function nextObservedWindow(
  date: Date,
  window: { hour: number; weekday?: number | null },
  timezone: string,
) {
  const start = `${String(window.hour).padStart(2, "0")}:00`,
    end = `${String((window.hour + 1) % 24).padStart(2, "0")}:00`;
  let candidate = nextContactWindow(date, start, end, timezone);
  for (let day = 0; day < 8; day++) {
    const local = localContactTime(candidate, timezone);
    if (
      window.weekday == null ||
      new Date(`${local.day}T12:00:00Z`).getUTCDay() === window.weekday
    )
      return candidate;
    candidate = nextContactWindow(
      new Date(candidate.getTime() + 24 * 3600000),
      start,
      end,
      timezone,
    );
  }
  throw new Error("Nenhuma janela observada disponível.");
}

export function observedPurchaseCadence(timestamps: string[]) {
  const days = [
    ...new Set(
      timestamps
        .map((value) => Date.parse(value))
        .filter(Number.isFinite)
        .map((value) => Math.floor(value / 86400000)),
    ),
  ].sort((a, b) => a - b);
  if (days.length < 3) return null;
  const gaps = days
    .slice(1)
    .map((day, index) => day - days[index])
    .sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (
    median < 3 ||
    median > 180 ||
    gaps.some((gap) => Math.abs(gap - median) > median * 0.35)
  )
    return null;
  return median;
}

export function nextContactIntersection(
  date: Date,
  windows: Array<{ start: string; end: string }>,
  timezone: string,
) {
  let candidate = date;
  for (let turn = 0; turn < 8; turn++) {
    for (const window of windows)
      candidate = nextContactWindow(
        candidate,
        window.start,
        window.end,
        timezone,
      );
    if (
      windows.every((window) =>
        isContactWindow(candidate, window.start, window.end, timezone),
      )
    )
      return candidate;
    if (candidate.getTime() > date.getTime() + 48 * 3600000) return null;
  }
  return null;
}

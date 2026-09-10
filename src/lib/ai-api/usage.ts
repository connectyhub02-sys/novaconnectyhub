export type AiUsage = {
  days: number;
  totals: { credits: number; requests: number; completed: number; failed: number; pending: number };
  daily: Array<{ date: string; credits: number; requests: number; completed: number; failed: number }>;
  projects: Array<{ id: string; name: string; credits: number; requests: number }>;
};

export function aiUsagePeriod(value: string | null) {
  const days = Number(value ?? 30);
  if (![7, 30, 90].includes(days)) throw new Error("Escolha um período de 7, 30 ou 90 dias.");
  return days;
}

export function aiUsageStart(days: number, now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(new Date(`${date}T00:00:00-03:00`).getTime() - (days - 1) * 86400000).toISOString();
}

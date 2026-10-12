export type AdsPeriod = { since: string; until: string; start: string; end: string; timezone: string };
export type AdsMetrics = { spend: number; impressions: number; clicks: number; leads: number; purchases: number; purchaseValue: number; ctr: number | null; cpc: number | null; cpm: number | null; cpl: number | null; roas: number | null };
export type AdsCampaignMetrics = AdsMetrics & { id: string; name: string };
export type AdsAccountOption = { id: string; label: string };
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown) => Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0;
const dayMs = 86400000;

export function analyticsAccounts(metadata: Record<string, unknown>, selected: string): AdsAccountOption[] {
  const accounts = (Array.isArray(metadata.ad_accounts) ? metadata.ad_accounts : []).map(record)
    .filter(a => typeof a.id === "string" && /^act_\d+$/.test(a.id))
    .map(a => ({ id: String(a.id), label: typeof a.label === "string" ? a.label : String(a.id) }));
  if (/^act_\d+$/.test(selected) && !accounts.some(a => a.id === selected)) accounts.push({ id: selected, label: selected });
  return accounts.filter((a, i) => accounts.findIndex(b => b.id === a.id) === i);
}
export function selectAnalyticsAccount(accounts: AdsAccountOption[], selected: string, requested?: string | null) {
  const id = requested || selected;
  if (!accounts.some(a => a.id === id)) throw new Error("Selecione uma conta autorizada na conexão desta empresa.");
  return id;
}
function dateInZone(date: Date, timezone: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map(k => p.find(v => v.type === k)?.value).join("-");
}
function midnight(date: string, timezone: string) {
  const target = Date.parse(`${date}T00:00:00Z`);
  let guess = target;
  for (let n = 0; n < 3; n++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
    const value = (key: string) => parts.find(p => p.type === key)?.value;
    const local = Date.parse(`${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}Z`);
    guess += target - local;
  }
  return new Date(guess).toISOString();
}
export function analyticsPeriod(input: { days?: string | null; since?: string | null; until?: string | null }, timezone = "America/Sao_Paulo", now = new Date()): AdsPeriod {
  const today = dateInZone(now, timezone);
  let since = input.since || "", until = input.until || "";
  if (since || until) {
    const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
    if (!valid(since) || !valid(until) || since > until || until > today || (Date.parse(until) - Date.parse(since)) / dayMs > 89)
      throw new Error("Escolha um período válido de até 90 dias, sem datas futuras.");
  } else {
    const days = input.days || "30";
    if (!["7", "30", "90"].includes(days)) throw new Error("Período inválido.");
    until = today;
    since = new Date(Date.parse(today) - (Number(days) - 1) * dayMs).toISOString().slice(0, 10);
  }
  const tomorrow = new Date(Date.parse(until) + dayMs).toISOString().slice(0, 10);
  return { since, until, start: midnight(since, timezone), end: midnight(tomorrow, timezone), timezone };
}
// Meta returns aggregate and destination-specific aliases together. Pick one;
// summing aliases would count the same conversion more than once.
function action(value: unknown, names: string[]) {
  const rows = (Array.isArray(value) ? value : []).map(record);
  for (const name of names) {
    const row = rows.find(r => r.action_type === name);
    if (row) return number(row.value);
  }
  return 0;
}
export function withRatios(m: Omit<AdsMetrics, "ctr" | "cpc" | "cpm" | "cpl" | "roas">): AdsMetrics {
  return { ...m, ctr: m.impressions ? 100 * m.clicks / m.impressions : null, cpc: m.clicks ? m.spend / m.clicks : null,
    cpm: m.impressions ? 1000 * m.spend / m.impressions : null, cpl: m.leads ? m.spend / m.leads : null, roas: m.spend ? m.purchaseValue / m.spend : null };
}
export function insightMetrics(raw: unknown): AdsMetrics {
  const row = record(raw), purchases = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
  return withRatios({ spend: number(row.spend), impressions: number(row.impressions), clicks: number(row.clicks),
    leads: action(row.actions, ["lead", "omni_lead", "offsite_conversion.fb_pixel_lead"]), purchases: action(row.actions, purchases), purchaseValue: action(row.action_values, purchases) });
}
export function sumInsights(rows: AdsMetrics[]): AdsMetrics {
  return withRatios(rows.reduce((sum, row) => ({ spend: sum.spend + row.spend, impressions: sum.impressions + row.impressions,
    clicks: sum.clicks + row.clicks, leads: sum.leads + row.leads, purchases: sum.purchases + row.purchases, purchaseValue: sum.purchaseValue + row.purchaseValue }),
  { spend: 0, impressions: 0, clicks: 0, leads: 0, purchases: 0, purchaseValue: 0 }));
}

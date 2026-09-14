export const operationLanes = ["orders", "preparation", "delivery", "pickup"] as const;
export type OperationLane = typeof operationLanes[number];
export type OperationWindow = { day: number; start: string; end: string };
export type OperationSchedule = { enabled: boolean; windows: OperationWindow[] };
export type OperationMinutes = { min: number; max: number };
export type SalesCatalogOperationHours = {
  enabled: boolean;
  timeZone: string;
  schedules: Record<OperationLane, OperationSchedule>;
  closedDates: string[];
  pausedUntil: string | null;
  preparationMinutes: OperationMinutes | null;
  deliveryMinutes: OperationMinutes | null;
};
export const operationLaneLabels: Record<OperationLane, string> = {
  orders: "Recebimento de pedidos", preparation: "Preparo", delivery: "Entrega", pickup: "Retirada",
};
export function defaultOperationHours(): SalesCatalogOperationHours {
  return { enabled: false, timeZone: "America/Sao_Paulo", schedules: {
    orders: { enabled: true, windows: [] }, preparation: { enabled: false, windows: [] },
    delivery: { enabled: false, windows: [] }, pickup: { enabled: false, windows: [] },
  }, closedDates: [], pausedUntil: null, preparationMinutes: null, deliveryMinutes: null };
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const minutes = (text: string, end = false) => {
  if (end && text === "24:00") return 1440;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) return null;
  return Number(text.slice(0, 2)) * 60 + Number(text.slice(3));
};
function minuteRange(value: unknown): OperationMinutes | null {
  if (value == null) return null;
  const data = record(value);
  return { min: typeof data.min === "number" ? data.min : NaN, max: typeof data.max === "number" ? data.max : NaN };
}
/** Preserve malformed configured values for validation; never quietly turn a closed schedule into an open one. */
export function readOperationHours(value: unknown): SalesCatalogOperationHours {
  const data = record(value), defaults = defaultOperationHours(), schedules = record(data.schedules);
  return {
    enabled: data.enabled === true,
    timeZone: typeof data.timeZone === "string" ? data.timeZone : defaults.timeZone,
    schedules: Object.fromEntries(operationLanes.map(lane => {
      const source = record(schedules[lane]);
      return [lane, { enabled: typeof source.enabled === "boolean" ? source.enabled : defaults.schedules[lane].enabled,
        windows: Array.isArray(source.windows) ? source.windows.slice(0, 70).map(value => { const window = record(value); return { day: Number(window.day), start: String(window.start ?? ""), end: String(window.end ?? "") }; }) : [],
      }];
    })) as Record<OperationLane, OperationSchedule>,
    closedDates: Array.isArray(data.closedDates) ? data.closedDates.map(String).slice(0, 366) : [],
    pausedUntil: typeof data.pausedUntil === "string" && data.pausedUntil.trim() ? data.pausedUntil : null,
    preparationMinutes: minuteRange(data.preparationMinutes), deliveryMinutes: minuteRange(data.deliveryMinutes),
  };
}
export function validateOperationHours(policy: SalesCatalogOperationHours): string | null {
  if (!policy.enabled) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: policy.timeZone }).format(); } catch { return "Informe um fuso válido para os horários da operação."; }
  if (!policy.schedules.orders.enabled) return "Ative e configure os horários de recebimento de pedidos.";
  for (const lane of operationLanes) {
    const schedule = policy.schedules[lane];
    if (!schedule.enabled) continue;
    if (!schedule.windows.length) return `Cadastre ao menos uma janela para ${operationLaneLabels[lane].toLowerCase()}.`;
    if (schedule.windows.some(window => !Number.isInteger(window.day) || window.day < 0 || window.day > 6 || minutes(window.start) === null || minutes(window.end, true) === null || window.start === window.end)) return `Confira os dias e horários de ${operationLaneLabels[lane].toLowerCase()}.`;
  }
  if (policy.closedDates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) return "Confira as datas em que a operação estará fechada.";
  if (policy.pausedUntil && !Number.isFinite(Date.parse(policy.pausedUntil))) return "Informe uma data e hora válidas para o fim da pausa.";
  for (const range of [policy.preparationMinutes, policy.deliveryMinutes]) {
    if (range && (!Number.isInteger(range.min) || !Number.isInteger(range.max) || range.min < 0 || range.max < range.min || range.max > 720)) return "As estimativas devem ficar entre 0 e 720 minutos, com máximo igual ou maior que o mínimo.";
  }
  return null;
}
const clockFormatters = new Map<string, Intl.DateTimeFormat>();
function localClock(now: Date, timeZone: string) {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) { formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); clockFormatters.set(timeZone, formatter); }
  const parts = formatter.formatToParts(now);
  const get = (key: string) => parts.find(part => part.type === key)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const previousDate = new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return { date, previousDate, day, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}
export function operationLaneOpen(policy: SalesCatalogOperationHours, lane: OperationLane, now: Date) {
  const clock = localClock(now, policy.timeZone);
  if (policy.closedDates.includes(clock.date)) return false;
  if (!policy.schedules[lane].enabled) return true;
  return policy.schedules[lane].windows.some(window => {
    const start = minutes(window.start)!, end = minutes(window.end, true)!;
    if (start < end) return window.day === clock.day && clock.minute >= start && clock.minute < end;
    return window.day === clock.day && clock.minute >= start
      || window.day === (clock.day + 6) % 7 && clock.minute < end && !policy.closedDates.includes(clock.previousDate);
  });
}
export type OperationAvailability = { allowed: boolean; state: "unconfigured" | "open" | "closed" | "invalid"; message: string | null; estimate: string | null };
export function orderOperationMode(items: Array<{ fulfillment?: unknown }>, shippingMethod?: string | null): "delivery" | "pickup" | "none" {
  if (!items.some(item => record(item.fulfillment).mode === "physical")) return "none";
  return /retirad[ao]|pickup/i.test(shippingMethod ?? "") ? "pickup" : "delivery";
}

export function operationHoursSummary(value: unknown, now = new Date()) {
  const policy = readOperationHours(value);
  if (!policy.enabled) return "Horários operacionais não configurados. Não prometa horário de atendimento, preparo, entrega ou retirada sem fonte.";
  if (validateOperationHours(policy)) return "Os horários operacionais precisam ser conferidos. Não confirme um novo pedido enquanto a configuração estiver inválida.";
  const days = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  return [
    `Fuso dos horários configurados: ${policy.timeZone}.`,
    ...operationLanes.filter(lane => policy.schedules[lane].enabled).map(lane => `${operationLaneLabels[lane]}: ${policy.schedules[lane].windows.map(window => `${days[window.day]} ${window.start}–${window.end}${minutes(window.end, true)! < minutes(window.start)! ? " do dia seguinte" : ""}`).join("; ")}.`),
    policy.closedDates.length ? `Datas fechadas: ${policy.closedDates.join(", ")}.` : "",
    ...(["delivery", "pickup", "none"] as const).map(mode => { const availability = evaluateOrderOperation(policy, mode, now); return `${mode === "delivery" ? "Pedido com entrega" : mode === "pickup" ? "Pedido com retirada" : "Pedido sem entrega física"}: ${availability.allowed ? availability.estimate ?? "dentro da janela atual; estimativa não informada" : availability.message}`; }),
    "Não prometa encaixe, capacidade, agendamento futuro ou prazo menor que a estimativa cadastrada. Estas janelas não substituem a agenda de serviços.",
  ].filter(Boolean).join("\n");
}
export function evaluateOrderOperation(value: unknown, mode: "delivery" | "pickup" | "none", now = new Date()): OperationAvailability {
  const policy = readOperationHours(value);
  if (!policy.enabled) return { allowed: true, state: "unconfigured", message: null, estimate: null };
  const error = validateOperationHours(policy);
  if (error || !Number.isFinite(now.getTime())) return { allowed: false, state: "invalid", message: "A loja precisa conferir a configuração dos horários antes de confirmar este pedido.", estimate: null };
  const closed = (message: string): OperationAvailability => ({ allowed: false, state: "closed", message, estimate: null });
  if (policy.pausedUntil && now.getTime() < Date.parse(policy.pausedUntil)) return closed("A loja pausou temporariamente o recebimento de pedidos. O pedido ainda não foi confirmado.");
  for (const lane of ["orders", ...(mode === "none" ? [] : ["preparation", mode])] as OperationLane[]) {
    if (!operationLaneOpen(policy, lane, now)) return closed(`${operationLaneLabels[lane]} está fora do horário configurado. O pedido ainda não foi confirmado.`);
  }
  // Estimates are optional, never inferred from shipping days or a service calendar.
  const preparation = mode === "none" ? null : policy.preparationMinutes, delivery = mode === "delivery" ? policy.deliveryMinutes : null;
  const duration = (preparation?.max ?? 0) + (delivery?.max ?? 0);
  if (mode !== "none" && !operationLaneOpen(policy, mode, new Date(now.getTime() + (preparation?.max ?? 0) * 60000))) return closed("O preparo termina fora da janela de entrega ou retirada. Combine outro horário com a equipe antes de confirmar.");
  for (let minute = 1; minute <= duration; minute++) {
    const at = new Date(now.getTime() + minute * 60000);
    const lane: OperationLane = minute <= (preparation?.max ?? 0) ? "preparation" : mode === "pickup" ? "pickup" : "delivery";
    if (!operationLaneOpen(policy, lane, at)) return closed("O tempo informado pela loja ultrapassa a janela disponível. Combine outro horário com a equipe antes de confirmar.");
  }
  const rangeText = (range: OperationMinutes) => range.min === range.max ? `${range.min} min` : `${range.min}–${range.max} min`;
  const estimate = [preparation ? `Preparo estimado: ${rangeText(preparation)}.` : "", delivery ? `Entrega estimada após o preparo: ${rangeText(delivery)}.` : ""].filter(Boolean).join(" ") || null;
  return { allowed: true, state: "open", message: null, estimate };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localContactTime } from "./contact-window";

export type AgendaResource = {
  id: string;
  name: string;
  service_name: string;
  kind: "service" | "table";
  duration_minutes: number;
  capacity: number;
  weekly_hours: Array<{ days: number[]; start: string; end: string }>;
  blocked_dates: string[];
  return_days: number | null;
  enabled: boolean;
};
export type AgendaBooking = {
  id: string;
  resource_id: string;
  lead_id: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  status: string;
  confirmed_at: string | null;
  version: number;
  lead?: { display_name: string | null } | null;
};
export function validateResource(value: Record<string, unknown>) {
  const text = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string).trim() : "";
  const name = text("name"),
    service = text("service_name");
  const duration = Number(value.duration_minutes),
    capacity = Number(value.capacity),
    returnDays =
      value.return_days === null ||
      value.return_days === "" ||
      value.return_days === undefined
        ? null
        : Number(value.return_days);
  if (
    !name ||
    name.length > 120 ||
    !service ||
    service.length > 120 ||
    !Number.isInteger(duration) ||
    duration < 5 ||
    duration > 720 ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 100 ||
    (returnDays !== null &&
      (!Number.isInteger(returnDays) || returnDays < 1 || returnDays > 730))
  )
    throw new Error(
      "Confira nome, serviço, duração, capacidade e intervalo de retorno.",
    );
  if (
    !Array.isArray(value.weekly_hours) ||
    !value.weekly_hours.length ||
    value.weekly_hours.length > 14
  )
    throw new Error("Informe os horários de funcionamento.");
  const hours = value.weekly_hours.map((raw) => {
    const row = raw as Record<string, unknown>;
    if (
      !row ||
      !Array.isArray(row.days) ||
      !row.days.length ||
      row.days.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
      typeof row.start !== "string" ||
      typeof row.end !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.end) ||
      row.start >= row.end
    )
      throw new Error("Confira os dias e os intervalos de atendimento.");
    return {
      days: [...new Set(row.days)] as number[],
      start: row.start,
      end: row.end,
    };
  });
  const blocked = Array.isArray(value.blocked_dates) ? value.blocked_dates : [];
  if (
    blocked.length > 366 ||
    blocked.some(
      (day) =>
        typeof day !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !Number.isFinite(Date.parse(day)),
    )
  )
    throw new Error("Confira as datas bloqueadas.");
  return {
    name,
    service_name: service,
    kind: value.kind === "table" ? "table" : "service",
    duration_minutes: duration,
    capacity,
    return_days: returnDays,
    weekly_hours: hours,
    blocked_dates: blocked,
    enabled: value.enabled !== false,
  };
}

export async function getAgenda(
  client: SupabaseClient,
  organizationId: string,
  leadId?: string,
) {
  const [settings, resources, bookings] = await Promise.all([
    client
      .from("customer_agenda_settings")
      .select("enabled,timezone")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    client
      .from("customer_agenda_resources")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name"),
    (() => {
      let query = client
        .from("customer_agenda_bookings")
        .select(
          "id,resource_id,lead_id,starts_at,ends_at,party_size,status,confirmed_at,version,lead:leads(display_name)",
        )
        .eq("organization_id", organizationId);
      if (leadId) query = query.eq("lead_id", leadId);
      return query
        .gte("starts_at", new Date(Date.now() - 86400000).toISOString())
        .order("starts_at")
        .limit(250);
    })(),
  ]);
  if (settings.error || resources.error || bookings.error)
    throw new Error("Não foi possível consultar a agenda.");
  return {
    settings: settings.data ?? {
      enabled: false,
      timezone: "America/Sao_Paulo",
    },
    resources: resources.data as AgendaResource[],
    bookings: (bookings.data??[]).map(booking=>({...booking,lead:Array.isArray(booking.lead)?booking.lead[0]??null:booking.lead})) as AgendaBooking[],
  };
}

export async function availableAppointments(
  client: SupabaseClient,
  organizationId: string,
  resourceId: string,
  from: Date,
  partySize = 1,
  excludeBookingId?: string,
) {
  const [settings, result] = await Promise.all([
    client
      .from("customer_agenda_settings")
      .select("enabled,timezone")
      .eq("organization_id", organizationId)
      .single(),
    client
      .from("customer_agenda_resources")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", resourceId)
      .eq("enabled", true)
      .single<AgendaResource>(),
  ]);
  if (settings.error || result.error || !settings.data.enabled)
    throw new Error("Agenda indisponível.");
  const resource = result.data;
  if (
    !Number.isInteger(partySize) ||
    partySize < 1 ||
    partySize > resource.capacity
  )
    return [];
  const lower = Math.max(from.getTime(), Date.now() + 60000),
    upper = lower + 7 * 86400000;
  let busyQuery = client
    .from("customer_agenda_bookings")
    .select("starts_at,ends_at")
    .eq("organization_id", organizationId)
    .eq("resource_id", resource.id)
    .eq("status", "booked")
    .lt("starts_at", new Date(upper).toISOString())
    .gt("ends_at", new Date(lower).toISOString());
  if (excludeBookingId) busyQuery = busyQuery.neq("id", excludeBookingId);
  const busy = await busyQuery;
  if (busy.error)
    throw new Error("Não foi possível consultar a disponibilidade.");
  const slots: Array<{ starts_at: string; ends_at: string }> = [];
  for (
    let start = Math.ceil(lower / 60000) * 60000;
    start < upper && slots.length < 12;
    start += 15 * 60000
  ) {
    const end = start + resource.duration_minutes * 60000,
      local = localContactTime(new Date(start), settings.data.timezone),
      finish = localContactTime(new Date(end), settings.data.timezone);
    const weekday =
      ((new Date(`${local.day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    if (
      finish.day !== local.day ||
      resource.blocked_dates.includes(local.day) ||
      !resource.weekly_hours.some(
        (h) =>
          h.days.includes(weekday) &&
          local.minute >= timeMinutes(h.start) &&
          finish.minute <= timeMinutes(h.end),
      )
    )
      continue;
    const overlaps = (busy.data ?? []).filter(
      (b) => Date.parse(b.starts_at) < end && Date.parse(b.ends_at) > start,
    );
    const peak = Math.max(
      0,
      ...[
        start,
        ...overlaps
          .map((b) => Date.parse(b.starts_at))
          .filter((t) => t >= start),
      ].map(
        (t) =>
          overlaps.filter(
            (b) => Date.parse(b.starts_at) <= t && Date.parse(b.ends_at) > t,
          ).length,
      ),
    );
    if (peak >= (resource.kind === "table" ? 1 : resource.capacity)) continue;
    slots.push({
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
    });
  }
  return slots;
}
function timeMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function agendaErrorMessage(message: string) {
  const errors: Record<string, string> = {
    SLOT_UNAVAILABLE:
      "Esse horário acabou de ser ocupado. Escolha outra opção.",
    OUTSIDE_HOURS:
      "O horário está fora do funcionamento ou em uma data bloqueada.",
    STALE_BOOKING:
      "Esse agendamento foi atualizado. Recarregue antes de continuar.",
    AGENDA_UNAVAILABLE: "Ative a agenda e confira o recurso selecionado.",
    INVALID_APPOINTMENT: "Confira data, horário e quantidade de pessoas.",
    APPOINTMENT_NOT_STARTED: "O atendimento ainda não começou.",
    REQUEST_KEY_CONFLICT:
      "Esta solicitação já foi usada para outro agendamento.",
  };
  return (
    Object.entries(errors).find(([key]) => message.includes(key))?.[1] ??
    "Não foi possível concluir a operação da agenda."
  );
}

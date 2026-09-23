import type { SupabaseClient } from "@supabase/supabase-js";

export const agendaDisabledMessage = "O agendamento online está desativado nesta empresa. Solicite atendimento para combinar os próximos passos.";

export async function readAgendaActivation(client: SupabaseClient, companyId: string) {
  const { data, error } = await client.from("customer_agenda_settings")
    .select("enabled,timezone,default_resource_id").eq("organization_id", companyId).maybeSingle();
  if (error) throw new Error("Não foi possível verificar a agenda da empresa.");
  return { defaultResourceId: data?.default_resource_id ?? null, enabled: data?.enabled === true, timezone: data?.timezone ?? "America/Sao_Paulo" };
}

type BookableResource = { id: string; enabled: boolean; weekly_hours: unknown[] | null };

/**
 * Item link first, then the company default. A company with exactly one
 * enabled calendar with hours needs no extra setup: that calendar is the
 * default, for WhatsApp and the public page alike.
 */
export function resolveAgendaResourceId(itemResourceId: string | null | undefined, defaultResourceId: string | null, resources: readonly BookableResource[]) {
  if (itemResourceId) return itemResourceId;
  if (defaultResourceId) return defaultResourceId;
  const bookable = resources.filter(resource => resource.enabled && resource.weekly_hours?.length);
  return bookable.length === 1 ? bookable[0].id : null;
}

export async function resolveCompanyAgendaResourceId(client: SupabaseClient, companyId: string, itemResourceId: string | null | undefined, defaultResourceId: string | null) {
  if (itemResourceId || defaultResourceId) return itemResourceId || defaultResourceId;
  const { data, error } = await client.from("customer_agenda_resources")
    .select("id,enabled,weekly_hours").eq("organization_id", companyId).eq("enabled", true).limit(2);
  if (error) throw new Error("Não foi possível verificar a agenda da empresa.");
  return resolveAgendaResourceId(null, null, (data ?? []) as BookableResource[]);
}

export async function requireAgendaActivation(client: SupabaseClient, companyId: string) {
  const settings = await readAgendaActivation(client, companyId);
  if (!settings.enabled) throw new Error(agendaDisabledMessage);
  return settings;
}

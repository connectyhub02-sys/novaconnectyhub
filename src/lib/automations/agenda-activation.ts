import type { SupabaseClient } from "@supabase/supabase-js";

export const agendaDisabledMessage = "O agendamento online está desativado nesta empresa. Solicite atendimento para combinar os próximos passos.";

export async function readAgendaActivation(client: SupabaseClient, companyId: string) {
  const { data, error } = await client.from("customer_agenda_settings")
    .select("enabled,timezone").eq("organization_id", companyId).maybeSingle();
  if (error) throw new Error("Não foi possível verificar a agenda da empresa.");
  return { enabled: data?.enabled === true, timezone: data?.timezone ?? "America/Sao_Paulo" };
}

export async function requireAgendaActivation(client: SupabaseClient, companyId: string) {
  const settings = await readAgendaActivation(client, companyId);
  if (!settings.enabled) throw new Error(agendaDisabledMessage);
  return settings;
}

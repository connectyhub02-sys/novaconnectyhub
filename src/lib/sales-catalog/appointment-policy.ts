import type { SupabaseClient } from "@supabase/supabase-js";
import { readAgendaActivation } from "@/lib/automations/agenda-activation";

type AppointmentConfig = { salesDestination: string; fulfillment: { agendaResourceId?: string | null } };

export async function validateProductAgenda(client: SupabaseClient, companyId: string, resourceId?: string | null, destination?: string, previous?: AppointmentConfig | null) {
  const unchanged = previous && previous.salesDestination === destination
    && (previous.fulfillment.agendaResourceId ?? null) === (resourceId ?? null);
  // Disabling the company agenda suspends existing links without erasing them or
  // blocking unrelated edits. A new destination or resource requires activation.
  if (unchanged) return;
  if (destination !== "appointment" && previous && (previous.fulfillment.agendaResourceId ?? null) === (resourceId ?? null)) return;
  if (destination === "appointment" || resourceId) {
    const settings = await readAgendaActivation(client, companyId);
    if (!settings.enabled) throw new Error("Ative a agenda desta empresa em Agenda antes de habilitar agendamento no produto.");
  }
  if (!resourceId) return;
  const { data, error } = await client.from("customer_agenda_resources").select("id")
    .eq("organization_id", companyId).eq("id", resourceId).eq("enabled", true).eq("kind", "service").maybeSingle();
  if (error || !data) throw new Error("Escolha uma agenda de atendimento ativa desta empresa.");
}

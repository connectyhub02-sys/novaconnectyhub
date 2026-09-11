import type { SupabaseClient } from "@supabase/supabase-js";

export async function validateProductAgenda(client: SupabaseClient, companyId: string, resourceId?: string | null) {
  if (!resourceId) return;
  const { data, error } = await client.from("customer_agenda_resources").select("id")
    .eq("organization_id", companyId).eq("id", resourceId).eq("enabled", true).eq("kind", "service").maybeSingle();
  if (error || !data) throw new Error("Escolha uma agenda de atendimento ativa desta empresa.");
}

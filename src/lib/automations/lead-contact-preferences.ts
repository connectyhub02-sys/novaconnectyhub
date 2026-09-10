import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppBaseUrl } from "@/lib/sales-catalog/mercado-pago";

export const validLeadContactKey = (key: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key);
export type LeadContactLink = { public_key: string; enabled: boolean };

export async function loadLeadContactLink(client: SupabaseClient, key: string): Promise<LeadContactLink | null> {
  if (!validLeadContactKey(key)) return null;
  const result = await client.rpc("get_lead_contact_link", { p_key: key });
  if (result.error) throw new Error("Preferência indisponível.");
  return result.data;
}

export async function optOutLeadContact(client: SupabaseClient, organizationId: string, leadId: string, source: "public_link" | "whatsapp_agent") {
  const result = await client.rpc("opt_out_lead_contact", { p_org: organizationId, p_lead: leadId, p_source: source });
  if (result.error || !result.data) throw new Error("Não foi possível registrar a saída da lista.");
}

export async function optOutLeadContactByKey(client: SupabaseClient, key: string) {
  if (!validLeadContactKey(key)) return false;
  const result = await client.from("lead_contact_links").select("organization_id,lead_id").eq("public_key", key).maybeSingle();
  if (result.error) throw new Error("Preferência indisponível.");
  if (!result.data) return false;
  await optOutLeadContact(client, result.data.organization_id, result.data.lead_id, "public_link");
  return true;
}

// Call immediately before claiming delivery. A previous decision is never reset here.
export async function prepareLeadContact(client: SupabaseClient, organizationId: string, leadId: string) {
  const result = await client.rpc("ensure_lead_contact_link", { p_org: organizationId, p_lead: leadId });
  if (result.error || !result.data || !validLeadContactKey(result.data.public_key)) throw new Error("Preferência de contato indisponível.");
  if (!result.data.enabled) return null;
  return `${getAppBaseUrl()}/contato/preferencias/${result.data.public_key}`;
}

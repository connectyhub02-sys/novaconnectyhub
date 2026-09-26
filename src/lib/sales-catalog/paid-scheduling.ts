import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAgendaActivation, resolveCompanyAgendaResourceId } from "@/lib/automations/agenda-activation";
import { availableAppointments } from "@/lib/automations/agenda";

type Row = Record<string, unknown>;
export type PaidSchedulingPlan =
  | { kind: "offer"; text: string; offer: Row }
  | { kind: "later"; text: string; productTitle: string };

const offerValidityMs = 24 * 3600_000;

/**
 * "Pay first, schedule after": when the paid order has a product marked "precisa agendar", the customer
 * receives real calendar times right after the payment confirmation. The reply books through the usual
 * agenda flow. Without a calendar or free times nobody promises a date: the customer is told the
 * company will get back and the paid order is flagged for the responsible person.
 */
export async function planPaidScheduling(client: SupabaseClient, input: {
  organizationId: string; conversationId: string; leadId: string; items: Row[];
}): Promise<PaidSchedulingPlan | null> {
  const item = input.items.find(row => (row.fulfillment as Row | null)?.scheduling_required === true && typeof row.catalog_item_id === "string");
  if (!item) return null;
  const title = String(item.title ?? "seu atendimento");
  const { data: product } = await client.from("intelligence_memory").select("metadata").eq("organization_id", input.organizationId)
    .eq("id", item.catalog_item_id).maybeSingle();
  const itemResource = ((product?.metadata as Row | null)?.fulfillment as Row | undefined)?.agenda_resource_id as string | null | undefined;
  const later = { kind: "later" as const, productTitle: title,
    text: `Agora é só combinar o horário do seu ${title}. Vou verificar a agenda e já te chamo para marcarmos 🙂` };
  const agenda = await readAgendaActivation(client, input.organizationId).catch(() => null);
  if (!agenda?.enabled) return later;
  const resourceId = await resolveCompanyAgendaResourceId(client, input.organizationId, itemResource, agenda.defaultResourceId).catch(() => null);
  if (!resourceId) return later;
  const slots = (await availableAppointments(client, input.organizationId, resourceId, new Date()).catch(() => [])).slice(0, 3);
  if (!slots.length) return later;
  const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: agenda.timezone, weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const options = slots.map(slot => when(slot.starts_at));
  return {
    kind: "offer",
    text: `Agora vamos marcar o seu ${title}. Tenho ${options.length > 1 ? `${options.slice(0, -1).join(", ")} ou ${options.at(-1)}` : options[0]}. Qual fica melhor para você?`,
    offer: { organization_id: input.organizationId, conversation_id: input.conversationId, lead_id: input.leadId, resource_id: resourceId,
      catalog_item_id: item.catalog_item_id, slots, party_size: 1, accepted: false, replace_booking_id: null, replace_version: null,
      expires_at: new Date(Date.now() + offerValidityMs).toISOString() },
  };
}

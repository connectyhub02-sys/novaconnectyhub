import type { SupabaseClient } from "@supabase/supabase-js";
import { readAgendaActivation } from "@/lib/automations/agenda-activation";
import { formatSalesCatalogSalesDestination, type SalesCatalogSalesDestination } from "@/lib/sales-catalog/shared";

type Row = { id: string; content: string | null; metadata: Record<string, unknown> | null };
export type BulkDestination = Extract<SalesCatalogSalesDestination, "connectyhub_checkout" | "appointment" | "manual_handoff">;

export function isBulkDestination(value: unknown): value is BulkDestination {
  return value === "connectyhub_checkout" || value === "appointment" || value === "manual_handoff";
}

/**
 * "Aplicar a todos": after the activity changes, the owner moves every existing product to the new
 * default action at once. Products sold on an external site keep their link, and a food assembly
 * stays in the checkout because it only works there.
 */
export async function applyDestinationToAllProducts(client: SupabaseClient, input: {
  organizationId: string; destination: BulkDestination; userId: string;
}) {
  if (input.destination === "appointment" && !(await readAgendaActivation(client, input.organizationId)).enabled) {
    throw new Error("Ative a agenda desta empresa em Agenda antes de aplicar agendamento a todos os produtos.");
  }
  const { data, error } = await client.from("intelligence_memory").select("id, content, metadata")
    .eq("scope", "organization").eq("organization_id", input.organizationId).eq("memory_type", "sales_catalog_item").limit(1000);
  if (error) throw new Error("Não foi possível carregar os produtos.");
  const label = formatSalesCatalogSalesDestination(input.destination);
  const now = new Date().toISOString();
  const updatedIds: string[] = [];
  let skipped = 0;
  for (const row of (data ?? []) as Row[]) {
    const metadata = row.metadata ?? {};
    const current = metadata.sales_destination;
    if (current === input.destination) continue;
    const food = (metadata.food_composition as { enabled?: boolean } | null)?.enabled === true;
    if (current === "external_site" || (food && input.destination !== "connectyhub_checkout")) { skipped += 1; continue; }
    const content = (row.content ?? "").replace(/^Destino da venda: .*$/m, `Destino da venda: ${label}`);
    const { error: updateError } = await client.from("intelligence_memory").update({
      content, updated_at: now,
      metadata: { ...metadata, sales_destination: input.destination, updated_by: input.userId, updated_from: "sales_catalog_bulk_destination" },
    }).eq("id", row.id).eq("organization_id", input.organizationId);
    if (updateError) throw new Error("Não foi possível atualizar todos os produtos.");
    updatedIds.push(row.id);
  }
  return { updatedIds, skipped };
}

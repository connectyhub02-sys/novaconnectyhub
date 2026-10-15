import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** A delayed health probe must never overwrite a newer billing/admin decision. */
export async function saveGatewayHealthMetadata(
  client: SupabaseClient,
  table: "connectyhub_api_clients" | "whatsapp_instances" | "connectyhub_webhook_endpoints",
  snapshot: { id: string },
  health: Record<string, unknown>,
) {
  // Delivery itself updates the webhook timestamp. Read after the probe so we
  // retain its result while merging into the latest billing/admin metadata.
  const current = await client.from(table).select("metadata, updated_at")
    .eq("id", snapshot.id).maybeSingle();
  if (current.error) throw new Error(`Nao foi possivel carregar saude da API: ${current.error.message}`);
  if (!current.data) return;

  const { error } = await client.from(table)
    .update({ metadata: { ...(current.data.metadata ?? {}), ...health } })
    .eq("id", snapshot.id)
    .eq("updated_at", current.data.updated_at);

  if (error) throw new Error(`Nao foi possivel salvar saude da API: ${error.message}`);
  // On conflict keep the newer row; the next scheduled probe refreshes health.
}

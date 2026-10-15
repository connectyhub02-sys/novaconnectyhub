import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** A delayed health probe must never overwrite a newer billing/admin decision. */
export async function saveGatewayHealthMetadata(
  client: SupabaseClient,
  table: "connectyhub_api_clients" | "whatsapp_instances" | "connectyhub_webhook_endpoints",
  snapshot: { id: string; updated_at: string; metadata?: Record<string, unknown> | null },
  health: Record<string, unknown>,
) {
  const { error } = await client.from(table)
    .update({ metadata: { ...(snapshot.metadata ?? {}), ...health } })
    .eq("id", snapshot.id)
    .eq("updated_at", snapshot.updated_at);

  if (error) throw new Error(`Nao foi possivel salvar saude da API: ${error.message}`);
  // On conflict keep the newer row; the next scheduled probe refreshes health.
}

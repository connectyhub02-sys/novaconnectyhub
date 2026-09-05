import type { SupabaseClient } from "@supabase/supabase-js";

type Metadata = Record<string, unknown>;

/** Rebase each write on the stored row; a slow AI completion must not undo CRM capture. */
export async function updateLeadMetadata(input: {
  client: SupabaseClient;
  organizationId: string;
  leadId: string;
  buildUpdate: (metadata: Metadata) => { metadata: Metadata; display_name?: string };
}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: current, error: readError } = await input.client
      .from("leads")
      .select("metadata, updated_at")
      .eq("id", input.leadId)
      .eq("organization_id", input.organizationId)
      .maybeSingle<{ metadata: Metadata | null; updated_at: string }>();

    if (readError || !current) {
      throw new Error(`Não foi possível carregar os dados do lead: ${readError?.message ?? "lead não encontrado"}`);
    }

    const patch = input.buildUpdate(current.metadata ?? {});
    const query = input.client.from("leads").update(patch)
      .eq("id", input.leadId)
      .eq("organization_id", input.organizationId)
      .eq("updated_at", current.updated_at);
    const { data: saved, error: writeError } = await query.select("metadata").maybeSingle<{ metadata: Metadata }>();

    if (writeError) {
      throw new Error(`Não foi possível salvar os dados do lead: ${writeError.message}`);
    }
    if (saved) return { ...patch, metadata: saved.metadata };
  }

  throw new Error("Os dados do lead mudaram durante a atualização. Tente novamente.");
}

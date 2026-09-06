import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { readLeadProfileImageUrl } from "@/lib/whatsapp/lead-avatar-sync";

/** Reuse the CRM identity belonging to this checkout; never look up a public phone across stores. */
export async function loadCheckoutLeadAvatar(client: SupabaseClient, input: {
  organizationId: string;
  leadId: string | null;
  conversationId: string | null;
}): Promise<string | null> {
  if (!input.leadId) return null;
  try {
    const { data: lead, error } = await client.from("leads")
      .select("metadata")
      .eq("organization_id", input.organizationId)
      .eq("id", input.leadId)
      .maybeSingle();
    if (error || !lead) return null;
    const avatar = readLeadProfileImageUrl(lead.metadata);
    if (avatar || !input.conversationId) return avatar;

    const { data: conversation } = await client.from("conversations")
      .select("metadata")
      .eq("organization_id", input.organizationId)
      .eq("lead_id", input.leadId)
      .eq("id", input.conversationId)
      .maybeSingle();
    return readLeadProfileImageUrl(conversation?.metadata);
  } catch {
    // An unavailable profile photo must never prevent payment.
    return null;
  }
}

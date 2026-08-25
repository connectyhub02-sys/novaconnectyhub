import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationPanelScope = "platform_internal";

export const platformWhatsappOrganizationSlug = "connectyhub-platform-whatsapp";

export function parseConversationPanelScope(value: unknown): ConversationPanelScope | null {
  return value === "platform_internal" ? value : null;
}

export async function ensureConversationPanelScope(input: {
  client: SupabaseClient;
  organizationId: string;
  panelScope: ConversationPanelScope | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!input.panelScope) {
    return { ok: true };
  }

  if (input.panelScope === "platform_internal") {
    const { data, error } = await input.client
      .from("organizations")
      .select("id")
      .eq("id", input.organizationId)
      .eq("slug", platformWhatsappOrganizationSlug)
      .maybeSingle<{ id: string }>();

    if (error) {
      return { ok: false, error: error.message, status: 500 };
    }

    if (!data) {
      return {
        ok: false,
        error: "Esta conversa nao pertence ao WhatsApp Interno da ConnectyHub.",
        status: 403,
      };
    }
  }

  return { ok: true };
}

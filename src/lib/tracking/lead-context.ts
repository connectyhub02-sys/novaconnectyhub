import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

type LeadContextInput = {
  organizationId: string | null;
  leadId?: string | null;
  conversationId?: string | null;
  leadPhone?: string | null;
};

type LeadRow = {
  id: string;
  organization_id: string;
  phone_number: string | null;
};

type ConversationRow = {
  id: string;
  organization_id: string;
  lead_id: string | null;
};

export type ResolvedLeadTrackingContext = {
  leadId: string | null;
  conversationId: string | null;
  leadPhone: string | null;
};

export async function resolveLeadTrackingContext(
  client: SupabaseClient,
  input: LeadContextInput,
): Promise<ResolvedLeadTrackingContext> {
  const organizationId = readUuid(input.organizationId);
  const requestedLeadId = readUuid(input.leadId);
  const requestedConversationId = readUuid(input.conversationId);
  const requestedPhone = normalizePhone(input.leadPhone);
  const unresolved: ResolvedLeadTrackingContext = { leadId: null, conversationId: null, leadPhone: null };

  if (!organizationId) {
    return { ...unresolved, leadPhone: requestedPhone };
  }

  if (requestedConversationId) {
    const { data, error } = await client
      .from("conversations")
      .select("id, organization_id, lead_id")
      .eq("id", requestedConversationId)
      .eq("organization_id", organizationId)
      .maybeSingle<ConversationRow>();

    if (error) return unresolved;

    if (data) {
      // The stored conversation owns its lead relation. URL fields must not
      // combine this conversation with another person's lead or phone.
      const linkedLeadId = readUuid(data.lead_id);
      const linkedLead = linkedLeadId ? await loadScopedLead(client, organizationId, linkedLeadId) : null;
      return {
        leadId: linkedLead?.id ?? null,
        conversationId: data.id,
        leadPhone: normalizePhone(linkedLead?.phone_number),
      };
    }
  }

  if (requestedLeadId) {
    const lead = await loadScopedLead(client, organizationId, requestedLeadId);
    if (lead) {
      return { leadId: lead.id, conversationId: null, leadPhone: normalizePhone(lead.phone_number) };
    }
  }

  // Keep the existing phone-only attribution lookup. A rejected explicit ID
  // must not silently switch identities through a separate phone parameter.
  if (readString(input.leadId) || readString(input.conversationId)) return unresolved;

  if (requestedPhone) {
    const { data, error } = await client
      .from("leads")
      .select("id, organization_id, phone_number")
      .eq("organization_id", organizationId)
      .eq("phone_number", requestedPhone)
      .neq("status", "archived")
      .maybeSingle<LeadRow>();

    if (error) return unresolved;
    if (data) {
      return { leadId: data.id, conversationId: null, leadPhone: normalizePhone(data.phone_number) };
    }
  }

  return { ...unresolved, leadPhone: requestedPhone };
}

async function loadScopedLead(client: SupabaseClient, organizationId: string, leadId: string) {
  const { data, error } = await client
    .from("leads")
    .select("id, organization_id, phone_number")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .maybeSingle<LeadRow>();

  return error ? null : data;
}

export function normalizePhone(value: unknown) {
  const phone = readString(value)?.replace(/\D/g, "") ?? "";
  return phone ? phone.slice(0, 32) : null;
}

export function readUuid(value: unknown) {
  const text = readString(value);

  if (!text || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    return null;
  }

  return text;
}

export function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

export function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

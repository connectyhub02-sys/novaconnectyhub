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
  let leadId: string | null = null;
  let conversationId: string | null = null;
  let leadPhone: string | null = requestedPhone;

  if (!organizationId) {
    return { leadId: null, conversationId: null, leadPhone };
  }

  if (requestedConversationId) {
    const { data } = await client
      .from("conversations")
      .select("id, organization_id, lead_id")
      .eq("id", requestedConversationId)
      .eq("organization_id", organizationId)
      .maybeSingle<ConversationRow>();

    if (data) {
      conversationId = data.id;
      leadId = data.lead_id;
    }
  }

  if (requestedLeadId) {
    const { data } = await client
      .from("leads")
      .select("id, organization_id, phone_number")
      .eq("id", requestedLeadId)
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .maybeSingle<LeadRow>();

    if (data) {
      leadId = data.id;
      leadPhone = normalizePhone(data.phone_number) ?? leadPhone;
    }
  }

  if (!leadId && leadPhone) {
    const { data } = await client
      .from("leads")
      .select("id, organization_id, phone_number")
      .eq("organization_id", organizationId)
      .eq("phone_number", leadPhone)
      .neq("status", "archived")
      .maybeSingle<LeadRow>();

    if (data) {
      leadId = data.id;
      leadPhone = normalizePhone(data.phone_number) ?? leadPhone;
    }
  }

  return {
    leadId,
    conversationId,
    leadPhone,
  };
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

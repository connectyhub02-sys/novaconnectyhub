import { describe, expect, it } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as LeadContext from "@/lib/tracking/lead-context";

const api = serverModuleHarness<typeof LeadContext>("src/lib/tracking/lead-context.ts");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const organizationId = uuid(1), otherOrganizationId = uuid(2);
const leadId = uuid(3), otherLeadId = uuid(4), foreignLeadId = uuid(5);
const conversationId = uuid(6), unlinkedConversationId = uuid(7), foreignConversationId = uuid(8);
const phone = "556799990001", otherPhone = "556799990002";
const empty = { leadId: null, conversationId: null, leadPhone: null };
type Input = Parameters<typeof api.resolveLeadTrackingContext>[1];

function tables() {
  return {
    leads: [
      { id: leadId, organization_id: organizationId, phone_number: phone, status: "active" },
      { id: otherLeadId, organization_id: organizationId, phone_number: otherPhone, status: "active" },
      { id: foreignLeadId, organization_id: otherOrganizationId, phone_number: phone, status: "active" },
    ],
    conversations: [
      { id: conversationId, organization_id: organizationId, lead_id: leadId as string | null },
      { id: unlinkedConversationId, organization_id: organizationId, lead_id: null },
      { id: foreignConversationId, organization_id: otherOrganizationId, lead_id: foreignLeadId },
    ],
  };
}

async function resolve(input: Omit<Input, "organizationId">, rows = tables()) {
  const db = commerceDatabase(rows);
  const before = structuredClone(db.tables);
  const result = await api.resolveLeadTrackingContext(db.client as never, { organizationId, ...input });
  expect(db.tables).toEqual(before);
  return result;
}

describe("lead tracking context consistency", () => {
  it("keeps a consistent conversation, lead and canonical phone", async () => {
    expect(await resolve({ conversationId, leadId, leadPhone: "+55 (67) 9999-0001" }))
      .toEqual({ conversationId, leadId, leadPhone: phone });
  });

  it("loads the conversation lead's phone even when the caller only knows the conversation", async () => {
    expect(await resolve({ conversationId })).toEqual({ conversationId, leadId, leadPhone: phone });
  });

  it("does not combine a conversation with a different valid lead and phone from the same company", async () => {
    expect(await resolve({ conversationId, leadId: otherLeadId, leadPhone: otherPhone }))
      .toEqual({ conversationId, leadId, leadPhone: phone });
  });

  it("ignores another company's requested lead when a local conversation is canonical", async () => {
    expect(await resolve({ conversationId, leadId: foreignLeadId, leadPhone: otherPhone }))
      .toEqual({ conversationId, leadId, leadPhone: phone });
  });

  it("uses the stored lead phone instead of a conflicting caller phone without a conversation", async () => {
    expect(await resolve({ leadId, leadPhone: otherPhone })).toEqual({ ...empty, leadId, leadPhone: phone });
  });

  it.each([true, false])("does not attach the caller phone to a known lead without a stored phone (conversation: %s)", async withConversation => {
    const rows = tables();
    Object.assign(rows.leads[0], { phone_number: null });
    expect(await resolve({ leadId, conversationId: withConversation ? conversationId : null, leadPhone: otherPhone }, rows))
      .toEqual({ leadId, conversationId: withConversation ? conversationId : null, leadPhone: null });
  });

  it("keeps an unlinked conversation unlinked despite a valid requested lead or matching phone", async () => {
    expect(await resolve({ conversationId: unlinkedConversationId, leadId, leadPhone: phone }))
      .toEqual({ ...empty, conversationId: unlinkedConversationId });
  });

  it("does not resolve a corrupt conversation link to a lead in another company", async () => {
    const rows = tables();
    rows.conversations[0].lead_id = foreignLeadId;
    expect(await resolve({ conversationId, leadId, leadPhone: phone }, rows)).toEqual({ ...empty, conversationId });
  });

  it("does not replace a conversation's archived lead with another requested lead", async () => {
    const rows = tables();
    rows.leads[0].status = "archived";
    expect(await resolve({ conversationId, leadId: otherLeadId, leadPhone: otherPhone }, rows))
      .toEqual({ ...empty, conversationId });
  });

  it("discards a foreign conversation while preserving a separately valid local lead", async () => {
    expect(await resolve({ conversationId: foreignConversationId, leadId, leadPhone: otherPhone }))
      .toEqual({ ...empty, leadId, leadPhone: phone });
  });

  it.each([
    { leadId: foreignLeadId },
    { conversationId: foreignConversationId },
    { leadId: uuid(99) },
    { conversationId: uuid(99) },
    { leadId: "invalid" },
    { conversationId: "invalid" },
  ])("does not switch through phone lookup after rejecting an explicit identity: %j", async identity => {
    expect(await resolve({ ...identity, leadPhone: otherPhone })).toEqual(empty);
  });

  it("preserves phone-only attribution within the selected organization", async () => {
    expect(await resolve({ leadPhone: "+55 (67) 9999-0001" })).toEqual({ ...empty, leadId, leadPhone: phone });
  });

  it("keeps an unknown phone as unlinked contact data without borrowing another company's lead", async () => {
    const rows = tables();
    rows.leads = rows.leads.filter(lead => lead.organization_id !== organizationId);
    expect(await resolve({ leadPhone: phone }, rows)).toEqual({ ...empty, leadPhone: phone });
  });

  it("excludes archived leads from the existing phone-only lookup", async () => {
    const rows = tables();
    rows.leads[0].status = "archived";
    expect(await resolve({ leadPhone: phone }, rows)).toEqual({ ...empty, leadPhone: phone });
  });

  it("does not query identities without an organization", async () => {
    const client = { from() { throw new Error("No organization-scoped query expected"); } };
    expect(await api.resolveLeadTrackingContext(client as never, { organizationId: null, leadId, conversationId, leadPhone: phone }))
      .toEqual({ ...empty, leadPhone: phone });
  });

  it("does not resolve a different lead after a conversation lookup failure", async () => {
    const { client } = commerceDatabase(tables(), { table: "conversations", operation: "select" });
    expect(await api.resolveLeadTrackingContext(client as never, { organizationId, conversationId, leadId: otherLeadId, leadPhone: otherPhone }))
      .toEqual(empty);
  });

  it("keeps a conversation unlinked when its lead lookup fails", async () => {
    const { client } = commerceDatabase(tables(), { table: "leads", operation: "select" });
    expect(await api.resolveLeadTrackingContext(client as never, { organizationId, conversationId, leadId: otherLeadId, leadPhone: otherPhone }))
      .toEqual({ ...empty, conversationId });
  });
});

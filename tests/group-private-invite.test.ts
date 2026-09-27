import { describe, expect, it } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as groupRules from "../src/lib/whatsapp/group-rules";

type Invite = typeof import("../src/lib/whatsapp/group-private-invite");
const now = new Date("2026-09-27T19:40:00Z");

function setup(lead?: Record<string, unknown>) {
  const db = commerceDatabase({
    agent_registry: [{ id: "agent", name: "Luna", persona_name: "Luna", metadata: { responsible_human: { phone: "5547988118255" } } }],
    leads: lead ? [{ id: "lead", organization_id: "org", phone_number: "554788577996", metadata: {}, ...lead }] : [],
    conversation_messages: [],
  });
  const sent: Array<Record<string, unknown>> = [];
  const invite = serverModuleHarness<Invite>("src/lib/whatsapp/group-private-invite.ts", {
    "@/lib/whatsapp/group-rules": groupRules,
    "@/lib/whatsapp/channel-operations": {
      resolveClientWhatsappOperationalContext: async () => ({ instance: { id: "inst", status: "connected" } }),
      callWhatsappProvider: async (_ctx: unknown, _path: string, body: Record<string, unknown>) => { sent.push(body); return { messageid: "OUT" }; },
    },
    "@/lib/whatsapp/webhook-ingest": {
      ensureDirectLeadConversation: async () => ({ lead: { id: "lead", metadata: {} }, conversation: { id: "dm" } }),
    },
  });
  const call = (extra: Record<string, unknown> = {}) => invite.inviteGroupParticipantToPrivate(db.client as never, {
    organizationId: "org", agentId: "agent", whatsappInstanceId: "inst", senderJid: "554788577996@s.whatsapp.net", senderName: "Rodrigo Silva",
    question: "como eu faço para comprar esses produtos", now, ...extra,
  });
  return { db, sent, call };
}

describe("calling a group participant in private to close the order", () => {
  it("sends a private message mentioning the question and keeps it in the private conversation", async () => {
    const { db, sent, call } = setup({});
    expect(await call()).toMatchObject({ invited: true, conversationId: "dm" });
    expect(sent[0]).toMatchObject({ number: "554788577996" });
    expect(String(sent[0].text)).toContain("Rodrigo");
    expect(String(sent[0].text)).toContain("como eu faço para comprar esses produtos");
    expect(db.tables.conversation_messages[0]).toMatchObject({ conversation_id: "dm", direction: "outbound", payload: expect.objectContaining({ delivery_source: "group_private_invite" }) });
  });

  it("does nothing without purchase intent, for the responsible human, after an opt-out or twice in a day", async () => {
    expect(await setup({}).call({ question: "qual produto para secar?" })).toEqual({ skipped: "no_intent" });
    expect(await setup({}).call({ senderJid: "554788118255@s.whatsapp.net" })).toEqual({ skipped: "responsible" });
    expect(await setup({ metadata: { whatsapp_opt_out: true } }).call()).toEqual({ skipped: "opt_out" });
    expect(await setup({ metadata: { group_private_invite_at: new Date(now.getTime() - 3600_000).toISOString() } }).call()).toEqual({ skipped: "recent" });
  });
});

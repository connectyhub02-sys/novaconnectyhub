import { describe, expect, it } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as groupRules from "../src/lib/whatsapp/group-rules";
import * as metadataUpdate from "../src/lib/leads/metadata-update";

type Invite = typeof import("../src/lib/whatsapp/group-private-invite");
const now = new Date("2026-09-27T19:40:00Z");

function setup(lead?: Record<string, unknown>) {
  const db = commerceDatabase({
    agent_registry: [{ id: "agent", name: "Luna", persona_name: "Luna", metadata: { responsible_human: { phone: "5547988118255" } } }],
    leads: lead ? [{ id: "lead", organization_id: "org", phone_number: "554788577996", updated_at: "2026-09-27T00:00:00Z", metadata: {}, ...lead }] : [],
    whatsapp_instances: [],
    conversation_messages: [],
    whatsapp_group_invites: [],
    whatsapp_channel_targets: [{ id: "g1", whatsapp_instance_id: "inst", provider_jid: "grupo@g.us", reply_mode: "all" }],
  });
  const sent: Array<Record<string, unknown>> = [];
  const invite = serverModuleHarness<Invite>("src/lib/whatsapp/group-private-invite.ts", {
    "@/lib/whatsapp/group-rules": groupRules,
    "@/lib/leads/metadata-update": metadataUpdate,
    "@/lib/whatsapp/channel-operations": {
      resolveClientWhatsappOperationalContext: async () => ({ instance: { id: "inst", status: "connected" } }),
      isOperationalAgentEnabled: () => true,
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
  return { db, sent, call, invite };
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

describe("group participants are called in private after the room closes", () => {
  it("notes each person once, keeping the latest question, and waits while the room is open", async () => {
    const { db, sent, invite } = setup({});
    const note = (question: string) => invite.noteGroupParticipant(db.client as never, { organizationId: "org", agentId: "agent", whatsappInstanceId: "inst",
      groupJid: "grupo@g.us", senderJid: "554788577996@s.whatsapp.net", senderName: "Rodrigo", question, now });
    await note("qual produto para emagrecer?");
    await note("quanto custa o de 60mg?");
    expect(db.tables.whatsapp_group_invites).toHaveLength(1);
    expect(db.tables.whatsapp_group_invites[0]).toMatchObject({ question: "quanto custa o de 60mg?", purchase_intent: true, status: "pending" });
    await invite.sendPendingGroupInvites(db.client as never, new Date(now.getTime() + 10 * 60_000));
    expect(sent).toHaveLength(0);
  });

  it("calls them once the room closes, mentioning their question", async () => {
    const { db, sent, invite } = setup({});
    await invite.noteGroupParticipant(db.client as never, { organizationId: "org", agentId: "agent", whatsappInstanceId: "inst",
      groupJid: "grupo@g.us", senderJid: "554788577996@s.whatsapp.net", senderName: "Rodrigo", question: "qual produto para emagrecer?", now });
    db.tables.whatsapp_channel_targets[0].reply_mode = "off";
    await invite.sendPendingGroupInvites(db.client as never, new Date(now.getTime() + 5 * 60_000));
    expect(sent).toHaveLength(1);
    expect(String(sent[0].text)).toContain("qual produto para emagrecer?");
    expect(String(sent[0].text)).toContain("Valeu por participar do grupo");
    expect(String(sent[0].text)).toContain("Aqui é Luna");
    expect(db.tables.whatsapp_group_invites[0]).toMatchObject({ status: "sent" });
  });
});

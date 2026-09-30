import { describe, expect, it } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as groupRules from "../src/lib/whatsapp/group-rules";
import * as metadataUpdate from "../src/lib/leads/metadata-update";

type Votes = typeof import("../src/lib/whatsapp/poll-votes");
type Invite = typeof import("../src/lib/whatsapp/group-private-invite");

const pollId = "3EB0D4FA80A511D6B8B109";
const question = "Qual é o seu foco principal de evolução para este mês no clube?";
const votedAt = new Date("2026-09-30T13:21:00Z"); // 10h21 in Brasília

function setup(leadMetadata: Record<string, unknown> = {}) {
  const db = commerceDatabase({
    agent_registry: [{ id: "luna", name: "Luna", persona_name: "Luna", metadata: {} }],
    whatsapp_instances: [
      { id: "luna-inst", organization_id: "org", phone_number: "5511915834033", status: "connected", metadata: { agent_id: "luna" } },
      { id: "gustavo-inst", organization_id: "org", phone_number: "5511910188233", status: "connected", metadata: { agent_id: "gustavo" } },
    ],
    conversation_messages: [{ id: "poll", organization_id: "org", message_type: "PollCreationMessage", provider_message_id: `5511915834033:${pollId}`,
      payload: { message: { sender: "5511915834033@s.whatsapp.net", content: { pollCreationMessage: { name: question } } } } }],
    leads: [{ id: "lead", organization_id: "org", phone_number: "557192017346", updated_at: "2026-09-30T00:00:00Z", metadata: leadMetadata }],
    whatsapp_group_invites: [],
    whatsapp_channel_targets: [],
    intelligence_events: [],
  });
  const sent: Array<Record<string, unknown>> = [];
  const ingest = { ensureDirectLeadConversation: async () => ({ lead: { id: "lead", metadata: {} }, conversation: { id: "dm" } }) };
  const votes = serverModuleHarness<Votes>("src/lib/whatsapp/poll-votes.ts", { "@/lib/leads/metadata-update": metadataUpdate, "@/lib/whatsapp/webhook-ingest": ingest });
  const invite = serverModuleHarness<Invite>("src/lib/whatsapp/group-private-invite.ts", {
    "@/lib/whatsapp/group-rules": groupRules, "@/lib/leads/metadata-update": metadataUpdate, "@/lib/whatsapp/webhook-ingest": ingest,
    "@/lib/whatsapp/channel-operations": {
      resolveClientWhatsappOperationalContext: async () => ({ instance: { id: "luna-inst", status: "connected" } }),
      isOperationalAgentEnabled: () => true,
      callWhatsappProvider: async (_ctx: unknown, _path: string, body: Record<string, unknown>) => { sent.push(body); return { messageid: "OUT" }; },
    },
  });
  const vote = (option: string, extra: Record<string, unknown> = {}) => votes.capturePollVote(db.client as never, { organizationId: "org", now: votedAt,
    message: { messageType: "PollUpdateMessage", chatid: "120363420762449237@g.us", sender_pn: "557192017346@s.whatsapp.net", senderName: "Antônio Gomes 😎",
      groupName: "Elite CLUB", vote: option, quoted: pollId, ...extra } });
  return { db, sent, vote, invite };
}

describe("group poll votes", () => {
  it("keeps the latest vote in the lead file and queues one invite for the agent that posted the poll", async () => {
    const { db, vote } = setup();
    expect(await vote("Definição e recomposição")).toMatchObject({ captured: true, queued: true });
    expect(await vote("Controle e emagrecimento", { owner: "5511910188233" })).toMatchObject({ captured: true, queued: true });
    const file = (db.tables.leads[0].metadata as { poll_votes: Record<string, Record<string, unknown>> }).poll_votes[pollId];
    expect(file).toMatchObject({ question, option: "Controle e emagrecimento", agent_id: "luna", whatsapp_instance_id: "luna-inst" });
    expect(db.tables.whatsapp_group_invites).toHaveLength(1);
    expect(db.tables.whatsapp_group_invites[0]).toMatchObject({ whatsapp_instance_id: "luna-inst", agent_id: "luna", poll_option: "Controle e emagrecimento", status: "pending" });
  });

  it("calls the voter in private one hour after the last vote, citing the option, only once", async () => {
    const { db, sent, vote, invite } = setup();
    await vote("Ganho de massa magra");
    expect(await invite.sendPendingGroupInvites(db.client as never, new Date(votedAt.getTime() + 30 * 60_000))).toHaveLength(0);
    await invite.sendPendingGroupInvites(db.client as never, new Date(votedAt.getTime() + 61 * 60_000));
    expect(sent).toHaveLength(1);
    expect(String(sent[0].text)).toBe("Oi, Antônio! Aqui é Luna 😊 Vi que você votou em *Ganho de massa magra* na enquete do grupo Elite CLUB. Quer que eu te mostre o que temos para isso?");
    expect((db.tables.leads[0].metadata as { poll_votes: Record<string, Record<string, unknown>> }).poll_votes[pollId].invited_at).toBeTruthy();
    expect(await vote("Definição e recomposição")).toMatchObject({ captured: true, queued: false });
  });

  it("never calls at night, agents' own numbers, or unknown polls", async () => {
    const { db, sent, vote, invite } = setup();
    await vote("Ganho de massa magra");
    await invite.sendPendingGroupInvites(db.client as never, new Date("2026-10-01T02:00:00Z")); // 23h in Brasília
    expect(sent).toHaveLength(0);
    expect(await vote("Ganho de massa magra", { sender_pn: "5511910188233@s.whatsapp.net" })).toEqual({ skipped: "voter_is_agent" });
    expect(await vote("Ganho de massa magra", { quoted: "OTHER" })).toEqual({ skipped: "poll_unknown" });
    expect(await vote("")).toEqual({ skipped: "vote_removed" });
  });
});

import { describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Watch = typeof import("../src/lib/whatsapp/lead-status-watch");

const now = new Date("2026-09-27T18:00:00Z");
const providerStatus = (extra: Record<string, unknown> = {}) => ({
  messageid: "3EB0STATUS1", chatid: "status@broadcast", sender: "123@lid", sender_pn: "554799990000@s.whatsapp.net",
  fromMe: false, messageType: "ImageMessage", text: "Treino pago hoje 💪", messageTimestamp: now.getTime() - 3600_000, ...extra,
});

function setup(options: { statuses?: Array<Record<string, unknown>>; leadMetadata?: Record<string, unknown>; recentOutbound?: boolean } = {}) {
  const db = commerceDatabase({
    whatsapp_traffic_routines: [{ id: "r1", organization_id: "org", agent_id: "agent", lead_status_view: true, lead_status_react: true, lead_status_comment: true }],
    leads: [{ id: "lead", organization_id: "org", phone_number: "554799990000", display_name: "Rodrigo Silva", metadata: options.leadMetadata ?? {} }],
    whatsapp_lead_statuses: [],
    agent_registry: [{ id: "agent", name: "Luna", persona_name: "Luna" }],
    organizations: [{ id: "org", name: "BuffaloMass" }],
    conversations: [{ id: "conv", organization_id: "org", lead_id: "lead", whatsapp_instance_id: "inst", provider_chat_id: "554799990000@s.whatsapp.net", updated_at: "1" }],
    conversation_messages: options.recentOutbound ? [{ id: "m0", lead_id: "lead", direction: "outbound", occurred_at: new Date(now.getTime() - hourMs).toISOString() }] : [],
  });
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const meter = vi.fn(async () => ({}));
  const watch = serverModuleHarness<Watch>("src/lib/whatsapp/lead-status-watch.ts", {
    "@/lib/whatsapp/channel-operations": {
      resolveClientWhatsappOperationalContext: async () => ({ instance: { id: "inst", status: "connected" } }),
      fetchRecentStatusMessages: async () => options.statuses ?? [providerStatus()],
      callWhatsappProvider: async (_ctx: unknown, path: string, body: Record<string, unknown>) => { calls.push({ path, body }); return { messageid: "OUT1" }; },
      generateWhatsappShortText: async () => ({ text: "\"Que foco, Rodrigo! Treino de hoje foi pesado?\"", modelId: "gemini", responseData: {} }),
    },
    "@/lib/billing/gemini-metering": { meterGeminiGenerationUsage: meter },
  });
  const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
  return { db, watch, calls, meter, later };
}
const hourMs = 3600_000;

describe("reading a contact's status", () => {
  it("uses the real number behind a hidden id and ignores own posts, expired ones and protocol messages", async () => {
    const { watch } = setup();
    expect(watch.readStatusRecord(providerStatus(), now)).toMatchObject({ messageId: "3EB0STATUS1", phone: "554799990000", caption: "Treino pago hoje 💪" });
    expect(watch.readStatusRecord(providerStatus({ fromMe: true }), now)).toBeNull();
    expect(watch.readStatusRecord(providerStatus({ sender_pn: null }), now)).toBeNull();
    expect(watch.readStatusRecord(providerStatus({ messageTimestamp: now.getTime() - 25 * hourMs }), now)).toBeNull();
    expect(watch.readStatusRecord(providerStatus({ messageType: "ProtocolMessage" }), now)).toBeNull();
    expect(watch.readStatusRecord(providerStatus({ chatid: "5547@s.whatsapp.net" }), now)).toBeNull();
  });

  it("picks an emoji that fits what was posted", async () => {
    const { watch } = setup();
    expect(watch.pickStatusReaction("Treino pago hoje", "ImageMessage", "a")).toBe("💪");
    expect(watch.pickStatusReaction("Gratidão a Deus", null, "a")).toBe("🙏");
    expect(["🔥", "😍", "👏", "❤️"]).toContain(watch.pickStatusReaction(null, "ImageMessage", "x"));
  });
});

describe("interacting with the leads' statuses", () => {
  it("keeps only statuses of known leads, including ones posted before the option was turned on", async () => {
    const { db, watch } = setup({ statuses: [providerStatus(), providerStatus({ messageid: "OTHER", sender_pn: "551100000000@s.whatsapp.net" })] });
    const result = await watch.pollLeadStatuses(db.client as never, now);
    expect(result).toEqual([{ routineId: "r1", found: 2, leads: 1 }]);
    expect(db.tables.whatsapp_lead_statuses).toHaveLength(1);
    expect(db.tables.whatsapp_lead_statuses[0]).toMatchObject({ lead_id: "lead", provider_message_id: "3EB0STATUS1", source: "poll" });
  });

  it("views, then reacts, then comments quoting the status, a few minutes apart, and records the comment in the conversation", async () => {
    const { db, watch, calls, meter, later } = setup();
    await watch.pollLeadStatuses(db.client as never, now);
    db.tables.whatsapp_lead_statuses[0].created_at = now.toISOString();
    await watch.actOnLeadStatuses(db.client as never, now);
    expect(calls).toHaveLength(0);
    await watch.actOnLeadStatuses(db.client as never, later(15));
    await watch.actOnLeadStatuses(db.client as never, later(20));
    await watch.actOnLeadStatuses(db.client as never, later(25));
    expect(calls.map(call => call.path)).toEqual(["/message/markread", "/message/react", "/send/text"]);
    expect(calls[0].body).toEqual({ id: ["3EB0STATUS1"] });
    expect(calls[1].body).toEqual({ id: "3EB0STATUS1", text: "💪" });
    expect(calls[2].body).toMatchObject({ number: "554799990000", replyid: "3EB0STATUS1", text: "Que foco, Rodrigo! Treino de hoje foi pesado?" });
    expect(meter).toHaveBeenCalledWith(expect.objectContaining({ featureCode: "content_generation", leadId: "lead" }));
    expect(db.tables.conversation_messages.at(-1)).toMatchObject({ conversation_id: "conv", direction: "outbound", text_content: "Que foco, Rodrigo! Treino de hoje foi pesado?" });
  });

  it("never touches a lead who asked not to be contacted", async () => {
    const { db, watch, calls, later } = setup({ leadMetadata: { whatsapp_opt_out: true } });
    await watch.pollLeadStatuses(db.client as never, now);
    db.tables.whatsapp_lead_statuses[0].created_at = now.toISOString();
    await watch.actOnLeadStatuses(db.client as never, later(15));
    expect(calls).toHaveLength(0);
  });

  it("views and reacts but holds the comment when the lead was contacted in the last hours", async () => {
    const { db, watch, calls, later } = setup({ recentOutbound: true });
    await watch.pollLeadStatuses(db.client as never, now);
    db.tables.whatsapp_lead_statuses[0].created_at = now.toISOString();
    for (const minutes of [15, 20, 25]) await watch.actOnLeadStatuses(db.client as never, later(minutes));
    expect(calls.map(call => call.path)).toEqual(["/message/markread", "/message/react"]);
  });
});

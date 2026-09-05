import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { historyDatabase } from "./helpers/history-database";
import * as cursors from "@/lib/client-os/attendance-history-cursor";
import * as names from "@/lib/whatsapp/lead-names";
import type * as Crm from "@/lib/client-os/leads-crm";
import type * as Media from "@/lib/whatsapp/message-media";
import { mergeConversationMessages, mergeLiveLeadRecord } from "@/lib/client-os/lead-crm-merge";

const media = serverModuleHarness<typeof Media>("src/lib/whatsapp/message-media.ts");
const crm = serverModuleHarness<typeof Crm>("src/lib/client-os/leads-crm.ts", {
  "./attendance-history-cursor": cursors, "@/lib/whatsapp/message-media": media, "@/lib/whatsapp/lead-names": names,
});
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-09-05T15:00:00.123456+00:00";
const leadId = uuid(1), conversationId = uuid(2), instanceId = uuid(3), organizationId = uuid(4);
const input = { leadId, conversationId, organizationId, isPlatformAdmin: false, kind: "messages" as const, cursor: {} };
function tables() {
  return {
    leads: [{ id: leadId, organization_id: organizationId, phone_number: "554899990000", metadata: {}, created_at: at }],
    conversations: [{ id: conversationId, lead_id: leadId, organization_id: organizationId, whatsapp_instance_id: instanceId, provider_chat_id: "554899990000", created_at: at }],
    whatsapp_instances: [{ id: instanceId, organization_id: organizationId, metadata: { client_agent: true } }],
    conversation_messages: Array.from({ length: 101 }, (_, n) => ({
      id: uuid(100 + n), conversation_id: conversationId, lead_id: leadId, organization_id: organizationId,
      message_type: "text", text_content: `Parte ${n}`, direction: "outbound", occurred_at: at,
      payload: { delivery_mode: "text", generated_audio_media_id: null, author_type: "ai" },
    })),
    commerce_agent_messages: Array.from({ length: 101 }, (_, n) => ({
      id: uuid(300 + n), conversation_id: null, lead_id: leadId, organization_id: organizationId,
      role: "lead", content: `Loja ${n}`, channel: "storefront", created_at: at, metadata: {},
    })),
    intelligence_events: [] as Record<string, unknown>[],
  };
}

describe("attendance history", () => {
  it("pages every message from WhatsApp and storefront without dropping equal timestamps", async () => {
    const data = tables();
    const { client } = historyDatabase(data);
    const messages: Crm.ClientLeadMessage[] = [];
    let cursor: cursors.AttendanceHistoryCursor | null = {};
    for (let page = 0; cursor && page < 5; page++) {
      const result = await crm.getAttendanceHistory({ ...input, client: client as never, cursor });
      expect(result).not.toBeNull();
      messages.push(...result!.messages);
      cursor = result!.cursor;
      if (page === 0) data.conversation_messages.push({ ...data.conversation_messages[0], id: uuid(999), occurred_at: "2026-09-05T16:00:00.000000+00:00" });
    }
    expect(cursor).toBeNull();
    expect(messages).toHaveLength(202);
    expect(new Set(messages.map(message => message.id)).size).toBe(202);
    expect(messages.every(message => message.mediaKind !== "audio")).toBe(true);
  });

  it("does not read another company's history", async () => {
    const { client, calls } = historyDatabase(tables());
    expect(await crm.getAttendanceHistory({ ...input, client: client as never, organizationId: uuid(9) })).toBeNull();
    expect(calls).toEqual(["leads"]);
  });

  it("rejects a conversation that does not belong to the selected lead", async () => {
    const { client, calls } = historyDatabase(tables());
    expect(await crm.getAttendanceHistory({ ...input, client: client as never, conversationId: uuid(9) })).toBeNull();
    expect(calls).not.toContain("conversation_messages");
  });

  it("keeps API customer instances outside the attendance history", async () => {
    const data = tables();
    Object.assign(data.whatsapp_instances[0], { connectyhub_api_visibility: "api_customer" });
    const { client } = historyDatabase(data);
    expect(await crm.getAttendanceHistory({ ...input, client: client as never })).toBeNull();
  });

  it("reports storage failure instead of pretending the history is empty", async () => {
    const { client } = historyDatabase(tables(), "conversation_messages");
    await expect(crm.getAttendanceHistory({ ...input, client: client as never })).rejects.toEqual({ message: "Database unavailable" });
  });

  it("finds old events beyond a busy organization's first page and matches conversation references", async () => {
    const data = tables();
    data.intelligence_events = Array.from({ length: 1502 }, (_, n) => ({
      id: uuid(1000 + n), organization_id: organizationId, source_id: uuid(9), occurred_at: at,
      title: "Checkout visitado", event_type: "checkout.clicked", payload: n === 0 ? { conversation_id: conversationId } : { lead_id: uuid(9) },
    }));
    const { client } = historyDatabase(data);
    const first = await crm.getAttendanceHistory({ ...input, client: client as never, kind: "events" });
    expect(first!.trackingEvents).toHaveLength(0);
    expect(first!.cursor).not.toBeNull();
    const second = await crm.getAttendanceHistory({ ...input, client: client as never, kind: "events", cursor: first!.cursor! });
    expect(second!.trackingEvents.map(event => event.id)).toEqual([uuid(1000)]);
    expect(second!.cursor).toBeNull();
  });
});

describe("history cursors", () => {
  it.each(['{"events":{"at":"now(),organization_id.neq.x","id":"bad"}}', '[]', '{"other":null}', '{"events":{"at":"2026-09-05","id":"bad"}}'])("rejects invalid cursor %s", (value) => {
    expect(() => cursors.parseAttendanceHistoryCursor(value)).toThrow();
  });
  it("preserves microseconds for stable keyset pagination", () => {
    const value = { whatsapp: { at, id: uuid(5) }, commerce: null };
    expect(cursors.parseAttendanceHistoryCursor(JSON.stringify(value))).toEqual(value);
  });
});

describe("live attendance merge", () => {
  const message = (n: number, text = `Mensagem ${n}`) => ({ id: uuid(n), provider: "uazapi", providerMessageId: null, providerChatId: "chat", occurredAt: at, text }) as Crm.ClientLeadMessage;
  function lead(messages: Crm.ClientLeadMessage[], id = conversationId): Crm.ClientLeadRecord {
    return { id: leadId, conversation: { id, messages }, activities: [], technical: {},
      leadFile: { conversations: [{ id, messages }], trackingEvents: [], intelligenceEvents: [] },
    } as unknown as Crm.ClientLeadRecord;
  }
  it("preserves 50 initial messages after a 40-message refresh and applies newer transcriptions", () => {
    const current = lead(Array.from({ length: 50 }, (_, n) => message(n)));
    const next = lead(Array.from({ length: 40 }, (_, n) => message(n + 10, "Atualizada")));
    const result = mergeLiveLeadRecord(current, next);
    expect(result.conversation.messages).toHaveLength(50);
    expect(result.leadFile.conversations[0].messages).toHaveLength(50);
    expect(result.leadFile.messageCount).toBe(50);
    expect(result.conversation.messages.at(-1)?.text).toBe("Atualizada");
  });
  it("does not mix messages when the conversation is replaced", () => {
    expect(mergeLiveLeadRecord(lead([message(1)]), lead([message(2)], uuid(88))).conversation.messages.map(item => item.id)).toEqual([uuid(2)]);
  });
  it("deduplicates a persisted message and its manual-send preview", () => {
    const saved = { ...message(1), providerMessageId: "same" };
    const local = { ...message(2), providerMessageId: "same" };
    expect(mergeConversationMessages([saved], [local])).toEqual([saved]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { selectReconnectUnansweredInbound } from "../src/lib/whatsapp/reconnect-catchup";

const reconnectCatchupSource = readFileSync("src/lib/whatsapp/reconnect-catchup.ts", "utf8");
const webhookIngestSource = readFileSync("src/lib/whatsapp/webhook-ingest.ts", "utf8");

describe("WhatsApp reconnect catch-up", () => {
  it("selects the latest inbound message when the lead is still unanswered", () => {
    const selected = selectReconnectUnansweredInbound([
      {
        direction: "outbound",
        provider_message_id: "agent-old",
        provider_chat_id: "5511999999999@s.whatsapp.net",
        message_type: "text",
        text_content: "Oi, posso ajudar?",
        occurred_at: "2026-08-26T14:00:00.000Z",
        created_at: "2026-08-26T14:00:01.000Z",
      },
      {
        direction: "inbound",
        provider_message_id: "lead-new",
        provider_chat_id: "5511999999999@s.whatsapp.net",
        message_type: "text",
        text_content: "Ainda quero comprar.",
        occurred_at: "2026-08-26T14:05:00.000Z",
        created_at: "2026-08-26T14:05:01.000Z",
      },
    ]);

    expect(selected?.provider_message_id).toBe("lead-new");
  });

  it("does not select old inbound messages when a newer outbound reply exists", () => {
    const selected = selectReconnectUnansweredInbound([
      {
        direction: "inbound",
        provider_message_id: "lead-old",
        provider_chat_id: "5511999999999@s.whatsapp.net",
        message_type: "text",
        text_content: "Tem esse produto?",
        occurred_at: "2026-08-26T14:00:00.000Z",
        created_at: "2026-08-26T14:00:01.000Z",
      },
      {
        direction: "outbound",
        provider_message_id: "agent-new",
        provider_chat_id: "5511999999999@s.whatsapp.net",
        message_type: "text",
        text_content: "Tenho sim.",
        occurred_at: "2026-08-26T14:03:00.000Z",
        created_at: "2026-08-26T14:03:01.000Z",
      },
    ]);

    expect(selected).toBeNull();
  });

  it("respects the reconnect catch-up cutoff window", () => {
    const selected = selectReconnectUnansweredInbound(
      [{
        direction: "inbound",
        provider_message_id: "lead-too-old",
        provider_chat_id: "5511999999999@s.whatsapp.net",
        message_type: "text",
        text_content: "Mensagem antiga.",
        occurred_at: "2026-08-25T14:00:00.000Z",
        created_at: "2026-08-25T14:00:01.000Z",
      }],
      { cutoffIso: "2026-08-26T00:00:00.000Z" },
    );

    expect(selected).toBeNull();
  });

  it("canonicalizes provider LID aliases before replaying missed inbound messages", () => {
    expect(reconnectCatchupSource).toContain("original_chatid: extractMessageChatId(input.providerMessage)");
    expect(reconnectCatchupSource).toContain("chatid: input.chatId");
    expect(reconnectCatchupSource).toContain("remoteJid: input.chatId");
  });

  it("resolves Uazapi LID chat ids to the canonical WhatsApp phone chat id", () => {
    expect(webhookIngestSource).toContain("resolveCanonicalProviderChatId(payload, messageRecord, rawProviderChatId)");
    expect(webhookIngestSource).toContain('"sender_pn"');
    expect(webhookIngestSource).toContain('"wa_chatlid"');
    expect(webhookIngestSource).toContain('"wa_chatid"');
  });
});

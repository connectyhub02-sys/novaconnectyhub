import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leadsCrmSource = readFileSync("src/lib/client-os/leads-crm.ts", "utf8");
const leadsCrmConsoleSource = readFileSync("src/components/connectyhub-os/leads-crm-console.tsx", "utf8");
const attendanceMediaRouteSource = readFileSync("src/app/api/dashboard/attendance/media/[messageId]/route.ts", "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("Lead CRM quoted message preview", () => {
  it("maps WhatsApp quoted context into client messages", () => {
    const messageType = sourceBetween(leadsCrmSource, "export type ClientLeadQuotedMessage", "export type ClientLeadActivity");
    const mapper = sourceBetween(leadsCrmSource, "function mapMessage", "function resolveMessageAuthor");

    expect(messageType).toContain("providerMessageId: string | null");
    expect(messageType).toContain("quotedMessage: ClientLeadQuotedMessage | null");
    expect(mapper).toContain("const quotedMessage = buildQuotedMessagePreview(row, conversationMessages)");
    expect(mapper).toContain("quotedMessage,");
  });

  it("extracts direct quoted text and provider-id fallbacks from WhatsApp payloads", () => {
    const previewBuilder = sourceBetween(leadsCrmSource, "function buildQuotedMessagePreview", "function resolveMessageAuthor");

    expect(previewBuilder).toContain('findNestedQuotedMessageContext(payload, "quotedMsg")');
    expect(previewBuilder).toContain('findNestedQuotedMessageContext(payload, "quotedMessage")');
    expect(previewBuilder).toContain('findNestedQuotedMessageContext(payload, "contextInfo")');
    expect(previewBuilder).toContain("findQuotedMessageByProviderId(conversationMessages, quotedProviderMessageId, row.id)");
    expect(previewBuilder).toContain("providerMessageIdsMatch");
    expect(previewBuilder).toContain("formatQuotedMediaKind");
  });

  it("renders quoted context inside the attendance chat bubble", () => {
    const chatMessages = sourceBetween(leadsCrmConsoleSource, "function ChatMessages", "function MiniChat");

    expect(chatMessages).toContain("message.quotedMessage");
    expect(chatMessages).toContain("Mensagem citada");
    expect(chatMessages).toContain("line-clamp-2");
    expect(chatMessages).toContain("redactInternalProviderNames(message.quotedMessage.text)");
  });

  it("exposes audio media with playback and transcription in the shared chat UI", () => {
    const messageType = sourceBetween(leadsCrmSource, "export type ClientLeadMessage", "export type ClientLeadActivity");
    const mapper = sourceBetween(leadsCrmSource, "function mapMessage", "function resolveMessageAuthor");
    const chatMessages = sourceBetween(leadsCrmConsoleSource, "function ChatMessages", "function MiniChat");
    const audioMessage = sourceBetween(leadsCrmConsoleSource, "function ChatAudioMessage", "function MiniChat");

    expect(messageType).toContain("mediaKind: WhatsappMessageMediaKind");
    expect(messageType).toContain("mediaTranscription");
    expect(mapper).toContain("resolveConversationMessageMedia(row");
    expect(mapper).toContain('proxyBasePath: "/api/dashboard/attendance/media"');
    expect(chatMessages).toContain('message.mediaKind === "audio"');
    expect(chatMessages).toContain("<ChatAudioMessage");
    expect(audioMessage).toContain("<audio");
    expect(audioMessage).toContain("controls");
    expect(audioMessage).toContain("Áudio do atendimento");
    expect(audioMessage).toContain("Transcrição");
    expect(attendanceMediaRouteSource).toContain("buildUazapiDownloadBodies");
    expect(attendanceMediaRouteSource).toContain("/message/download");
    expect(attendanceMediaRouteSource).toContain("Range");
  });

  it("surfaces storefront agent messages in the same lead timeline with origin labels", () => {
    const messageType = sourceBetween(leadsCrmSource, "export type ClientLeadMessage", "export type ClientLeadActivity");
    const loader = sourceBetween(leadsCrmSource, "async function loadCommerceAgentMessageRows", "function isLeadCrmWhatsappInstance");
    const mapper = sourceBetween(leadsCrmSource, "function mapCommerceAgentMessageToConversationMessage", "function normalizeCommerceMessageChannel");
    const originResolver = sourceBetween(leadsCrmSource, "function resolveMessageOrigin", "function normalizeMessageAuthor");
    const chatMessages = sourceBetween(leadsCrmConsoleSource, "function formatMessageOriginBadge", "function ChatMessages");

    expect(messageType).toContain("originSource: string");
    expect(messageType).toContain("originDevice: string | null");
    expect(messageType).toContain('originConfidence: "high" | "medium" | "low"');
    expect(loader).toContain('.from("commerce_agent_messages")');
    expect(loader).toContain('.in("role", ["lead", "assistant"])');
    expect(mapper).toContain('provider: "connectyhub_storefront"');
    expect(mapper).toContain('origin_source: readString(metadata.origin_source) ?? originSource');
    expect(originResolver).toContain("connectyhub_ai_storefront");
    expect(originResolver).toContain("connected_whatsapp_mobile");
    expect(chatMessages).toContain("Celular WhatsApp");
    expect(chatMessages).toContain("return `IA ${channelLabel}`");
    expect(chatMessages).toContain("return `Lead ${channelLabel}`");
    expect(chatMessages).toContain("Humano Painel");
  });

  it("keeps the attendance panel polling fast enough for live WhatsApp handoff", () => {
    const livePolling = sourceBetween(
      leadsCrmConsoleSource,
      "const getNextDelay = () =>",
      "const refreshNow = () =>",
    );

    expect(livePolling).toContain(": 2_000");
    expect(leadsCrmConsoleSource).toContain("schedule(350)");
  });
});

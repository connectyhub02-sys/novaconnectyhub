import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leadsCrmSource = readFileSync("src/lib/client-os/leads-crm.ts", "utf8");
const leadsCrmConsoleSource = readFileSync("src/components/connectyhub-os/leads-crm-console.tsx", "utf8");

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
});

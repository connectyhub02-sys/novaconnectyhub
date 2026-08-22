import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agentRuntimeSource = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");

function sourceBetween(start: string, end: string) {
  const startIndex = agentRuntimeSource.indexOf(start);
  const endIndex = agentRuntimeSource.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return agentRuntimeSource.slice(startIndex, endIndex);
}

describe("WhatsApp quoted reply context", () => {
  it("passes the enriched active inbound text into Gemini contents", () => {
    const generator = sourceBetween("async function generateAgentResponse", "function buildSystemInstruction");
    const contentsBuilder = sourceBetween("function buildGeminiContents", "function extractQuotedMessageContext");
    const messageBuilder = sourceBetween("function buildMessageText", "function readConversationMessageAgentName");

    expect(generator).toContain("contents: buildGeminiContents(input.messages, input.userText, input.latestInbound?.id ?? null, input.userText)");
    expect(contentsBuilder).toContain("activeInboundText: string | null = null");
    expect(contentsBuilder).toContain("buildMessageText(message, { activeInboundMessageId, activeInboundText })");
    expect(messageBuilder).toContain("const activeInboundText = options.activeInboundText?.trim();");
    expect(messageBuilder).toContain("message.id === options.activeInboundMessageId");
    expect(messageBuilder).toContain("return activeInboundText;");
  });

  it("extracts quoted text from common WhatsApp provider payload shapes", () => {
    const extractor = sourceBetween("function extractQuotedMessageContext", "function findNestedQuotedText");

    expect(extractor).toContain('findNestedQuotedText(payload, "quotedMsg")');
    expect(extractor).toContain('findNestedQuotedText(payload, "quotedMessage")');
    expect(extractor).toContain('findNestedQuotedText(payload, "contextInfo")');
    expect(extractor).toContain("trimmed.slice(0, 500)");
  });

  it("resolves provider quoted ids against the loaded conversation history", () => {
    const extractor = sourceBetween("function extractQuotedMessageContext", "function findNestedQuotedText");
    const idExtractor = sourceBetween("function findQuotedProviderMessageId", "function findQuotedMessageTextByProviderId");
    const historyResolver = sourceBetween("function findQuotedMessageTextByProviderId", "function providerMessageIdsMatch");
    const matcher = sourceBetween("function providerMessageIdsMatch", "function isRecord");

    expect(extractor).toContain("findQuotedMessageTextByProviderId(messages, quotedProviderMessageId, message.id)");
    expect(idExtractor).toContain('"quoted"');
    expect(idExtractor).toContain('"quotedMessageId"');
    expect(idExtractor).toContain('"stanzaId"');
    expect(historyResolver).toContain("candidate.provider_message_id");
    expect(historyResolver).toContain("buildMessageText(candidate)");
    expect(matcher).toContain("normalizeProviderMessageId");
    expect(matcher).toContain("normalizedLeft.endsWith(normalizedRight)");
  });
});

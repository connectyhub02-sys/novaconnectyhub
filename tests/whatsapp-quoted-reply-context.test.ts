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
    const extractor = sourceBetween("function extractQuotedMessageContext", "function findNestedQuotedMessageContext");
    const nestedExtractor = sourceBetween("function findNestedQuotedMessageContext", "function findQuotedProviderMessageId");

    expect(extractor).toContain('findNestedQuotedMessageContext(payload, "quotedMsg")');
    expect(extractor).toContain('findNestedQuotedMessageContext(payload, "quotedMessage")');
    expect(extractor).toContain('findNestedQuotedMessageContext(payload, "contextInfo")');
    expect(extractor).toContain("trimmed.slice(0, 500)");
    expect(nestedExtractor).toContain("describeQuotedMessageContext(value)");
    expect(nestedExtractor).toContain("detectQuotedPayloadMediaKind(value)");
    expect(nestedExtractor).toContain("formatQuotedMediaKind(mediaKind)");
  });

  it("resolves provider quoted ids against the loaded conversation history", () => {
    const extractor = sourceBetween("function extractQuotedMessageContext", "function findNestedQuotedMessageContext");
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

  it("teaches all agents how to use quoted WhatsApp context without treating it as a new message", () => {
    const systemInstruction = sourceBetween("function buildSystemInstruction", "function resolveRuntimeAgentPrompt");

    expect(systemInstruction).toContain("Quando a mensagem do lead vier com '[Respondendo a mensagem: ...]'");
    expect(systemInstruction).toContain("Nao responda a mensagem citada como se ela tivesse acabado de chegar");
    expect(systemInstruction).toContain("Se a citacao for audio, imagem, video ou documento sem texto legivel");
  });
});

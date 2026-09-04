import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeSource = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");
const inngestFunctionsSource = readFileSync("src/lib/inngest/functions.ts", "utf8");

function sourceBetween(start: string, end: string) {
  const startIndex = runtimeSource.indexOf(start);
  const endIndex = runtimeSource.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return runtimeSource.slice(startIndex, endIndex);
}

describe("WhatsApp runtime external call timeouts", () => {
  it("bounds Gemini response generation so runs do not stay stuck indefinitely", () => {
    const generator = sourceBetween("async function generateAgentResponse", "function buildSystemInstruction");

    expect(runtimeSource).toContain("const geminiAgentResponseTimeoutMs = 60000");
    expect(generator).toContain("fetchWithTimeout(url");
    expect(generator).toContain("Gemini generateContent do agente WhatsApp");
    expect(generator).toContain("withTimeout(readProviderResponse(response)");
  });

  it("bounds outbound WhatsApp text, menu and catalog media delivery", () => {
    const textSender = sourceBetween("async function sendWhatsappText", "async function sendWhatsappInteractiveButtons");
    const menuSender = sourceBetween("async function sendWhatsappInteractiveButtons", "function resolveInteractiveButtonFooterText");
    const mediaSender = sourceBetween("async function sendSalesCatalogMediaAttachments", "function buildSalesCatalogMediaCaption");

    expect(runtimeSource).toContain("const outboundTextDeliveryTimeoutMs = 30000");
    expect(textSender).toContain("timeoutMs: outboundTextDeliveryTimeoutMs");
    expect(menuSender).toContain("timeoutMs: outboundTextDeliveryTimeoutMs");
    expect(mediaSender).toContain("timeoutMs: outboundTextDeliveryTimeoutMs");
  });

  it("keeps optional presence, read receipt and reaction calls from blocking replies", () => {
    const readMarker = sourceBetween("async function markConversationRead", "async function ensureWhatsappPresencePrivacy");
    const privacy = sourceBetween("async function ensureWhatsappPresencePrivacy", "async function setChatPresence");
    const presence = sourceBetween("async function setChatPresence", "async function setPresenceAvailable");
    const available = sourceBetween("async function setPresenceAvailable", "async function maybeSetInstanceAvailable");
    const reaction = sourceBetween("async function sendEmojiReaction", "function pickContextualEmoji");

    expect(runtimeSource).toContain("const whatsappPresenceTimeoutMs = 12000");
    expect(runtimeSource).toContain("const whatsappReactionTimeoutMs = 8000");
    expect(readMarker).toContain("try {");
    expect(readMarker).toContain("timeoutMs: whatsappPresenceTimeoutMs");
    expect(privacy).toContain("try {");
    expect(privacy).toContain("timeoutMs: whatsappPresenceTimeoutMs");
    expect(presence).toContain("try {");
    expect(presence).toContain("timeoutMs: whatsappPresenceTimeoutMs");
    expect(available).toContain("try {");
    expect(available).toContain("timeoutMs: whatsappPresenceTimeoutMs");
    expect(reaction).toContain("try {");
    expect(reaction).toContain("timeoutMs: whatsappReactionTimeoutMs");
  });

  it("sweeps queued WhatsApp runs every minute as a fallback for delayed event dispatch", () => {
    expect(inngestFunctionsSource).toContain("connectyhub-whatsapp-agent-sweep");
    expect(inngestFunctionsSource).toContain('triggers: [{ cron: "* * * * *" }]');
    expect(inngestFunctionsSource).toContain("processQueuedWhatsappAgentRuns({ limit: 10 })");
  });

  it("does not classify quoted replies as edit/delete or reaction just because payload keys exist", () => {
    const signature = sourceBetween("function buildMessageEventSignature", "function detectSignalMediaKind");

    expect(signature).not.toContain("rawPayload");
    expect(signature).toContain("formatTruthyEventFlag(providerMessage?.edited, \"edited\")");
    expect(signature).toContain("formatTruthyEventFlag(providerMessage?.reaction, \"reaction\")");
    expect(signature).toContain("function formatTruthyEventFlag");
  });
});

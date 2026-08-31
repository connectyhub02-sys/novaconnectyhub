import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhookIngestSource = readFileSync("src/lib/whatsapp/webhook-ingest.ts", "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("WhatsApp webhook ingest resilience", () => {
  it("does not use the organization global WhatsApp agent as a lead-facing fallback", () => {
    const start = webhookIngestSource.indexOf("async function findOrganizationWhatsappAgent");
    const end = webhookIngestSource.indexOf("async function resolveWebhookBehaviorConfig", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const resolverSource = webhookIngestSource.slice(start, end);

    expect(resolverSource).toContain('contains("metadata", { client_created: true, agent_kind: "whatsapp" })');
    expect(resolverSource).not.toContain('eq("agent_code", "agente-whatsapp-global")');
    expect(resolverSource).toContain("return null;");
  });

  it("keeps auxiliary webhook side effects out of the critical agent enqueue path", () => {
    expect(webhookIngestSource).toContain('runWebhookSideEffect("lead-avatar-sync"');
    expect(webhookIngestSource).toContain('runWebhookSideEffect("lead-reply-push"');
    expect(webhookIngestSource).not.toContain("await syncLeadAvatarFromUazapi({");
    expect(webhookIngestSource).not.toContain("await sendLeadReplyPushNotifications({");
  });

  it("audits outbound WhatsApp origin without confusing external replies with the agent", () => {
    expect(webhookIngestSource).toContain("resolveWebhookMessageOrigin");
    expect(webhookIngestSource).toContain('origin_channel: "whatsapp"');
    expect(webhookIngestSource).toContain("origin_confidence: origin.confidence");
    expect(webhookIngestSource).toContain("connected_whatsapp_mobile");
    expect(webhookIngestSource).toContain("connected_whatsapp_web");
    expect(webhookIngestSource).toContain("connected_whatsapp_external");
    expect(webhookIngestSource).toContain("connectyhub_dashboard_human");
    expect(webhookIngestSource).toContain("connectyhub_ai_whatsapp");
    expect(webhookIngestSource).toContain('trackId?.startsWith("dashboard_human_reply_")');
    expect(webhookIngestSource).toContain('trackId?.startsWith("admin_human_reply_")');
  });

  it("keeps external WhatsApp outbound replies attached to the remote lead conversation", () => {
    const extractor = webhookIngestSource.slice(
      webhookIngestSource.indexOf("function extractMessageSnapshot"),
      webhookIngestSource.indexOf("type MessageAuthorType"),
    );
    const remoteChatResolver = sourceBetween(
      webhookIngestSource,
      "function resolveRawProviderChatId",
      "function resolveCanonicalProviderChatId",
    );
    const canonicalChatResolver = sourceBetween(
      webhookIngestSource,
      "function resolveCanonicalProviderChatId",
      "function findMatchingChatRecord",
    );
    const leadEnsurer = webhookIngestSource.slice(
      webhookIngestSource.indexOf("async function ensureLead"),
      webhookIngestSource.indexOf("async function ensureConversation"),
    );

    expect(extractor).toContain("resolveRawProviderChatId(messageRecord, fromMe, sentByApi)");
    expect(extractor).toContain("resolveCanonicalProviderChatId(payload, messageRecord, rawProviderChatId, fromMe === true || sentByApi === true)");
    expect(remoteChatResolver).toContain("return to ?? directChatId ?? from;");
    expect(remoteChatResolver).toContain("return from ?? directChatId ?? to;");
    expect(webhookIngestSource).toContain("const selfEcho = isOutboundSelfEcho(message, instance);");
    expect(webhookIngestSource).toContain('Ignorado eco externo sem contato remoto.');
    expect(canonicalChatResolver).toContain("if (isCanonicalWhatsappChatId(rawProviderChatId))");
    expect(canonicalChatResolver).toContain("!isOutbound ? findString(messageRecord, [\"sender_pn\"");
    expect(leadEnsurer).toContain("const existingPersonalName = resolveLeadPersonalName");
    expect(leadEnsurer).toContain("!existingPersonalName");
    expect(leadEnsurer).toContain('input.messageDirection === "inbound"');
    expect(leadEnsurer).toContain("last_provider_display_name");
  });
});

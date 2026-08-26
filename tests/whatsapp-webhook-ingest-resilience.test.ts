import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhookIngestSource = readFileSync("src/lib/whatsapp/webhook-ingest.ts", "utf8");

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
});

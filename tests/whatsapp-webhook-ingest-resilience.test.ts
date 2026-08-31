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
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhookIngestSource = readFileSync("src/lib/whatsapp/webhook-ingest.ts", "utf8");

describe("WhatsApp webhook ingest resilience", () => {
  it("falls back to the organization global WhatsApp agent when no instance agent is linked", () => {
    expect(webhookIngestSource).toContain('eq("agent_code", "agente-whatsapp-global")');
    expect(webhookIngestSource).toContain("return globalAgent ?? null");
  });

  it("keeps auxiliary webhook side effects out of the critical agent enqueue path", () => {
    expect(webhookIngestSource).toContain('runWebhookSideEffect("lead-avatar-sync"');
    expect(webhookIngestSource).toContain('runWebhookSideEffect("lead-reply-push"');
    expect(webhookIngestSource).not.toContain("await syncLeadAvatarFromUazapi({");
    expect(webhookIngestSource).not.toContain("await sendLeadReplyPushNotifications({");
  });
});

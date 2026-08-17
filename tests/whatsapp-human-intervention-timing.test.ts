import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const humanInterventionSource = readFileSync("src/lib/whatsapp/human-intervention.ts", "utf8");
const webhookIngestSource = readFileSync("src/lib/whatsapp/webhook-ingest.ts", "utf8");
const replyRouteSource = readFileSync("src/app/api/dashboard/conversations/reply/route.ts", "utf8");
const handoffRouteSource = readFileSync("src/app/api/dashboard/conversations/handoff/route.ts", "utf8");

describe("WhatsApp human intervention timing", () => {
  it("resolves the reactivation delay from saved behavior config", () => {
    expect(humanInterventionSource).toContain("resolveHumanInterventionMinutesForInstance");
    expect(humanInterventionSource).toContain("normalizeWhatsappBehaviorConfig(instanceConfig).humanInterventionMinutes");
    expect(humanInterventionSource).toContain("whatsapp_behavior_config");
    expect(humanInterventionSource).toContain("agente-whatsapp-global");
  });

  it("uses configured reactivation minutes for all dashboard and WhatsApp human handoff paths", () => {
    expect(replyRouteSource).toContain("resolveHumanInterventionMinutesForInstance");
    expect(replyRouteSource).toContain("configured_minutes: humanInterventionMinutes");
    expect(handoffRouteSource).toContain("resolveConversationHumanInterventionMinutes");
    expect(handoffRouteSource).toContain("configured_minutes: minutes");
    expect(webhookIngestSource).toContain("resolveHumanInterventionMinutesForInstance");
    expect(webhookIngestSource).toContain("configured_minutes: humanInterventionMinutes");
  });

  it("does not use a hard-coded sixty minute pause in backend handoff logic", () => {
    expect(replyRouteSource).not.toContain("HUMAN_INTERVENTION_DEFAULT_MS");
    expect(webhookIngestSource).not.toContain("HUMAN_INTERVENTION_DEFAULT_MS");
    expect(handoffRouteSource).not.toContain("clampMinutes(body?.minutes)");
  });
});

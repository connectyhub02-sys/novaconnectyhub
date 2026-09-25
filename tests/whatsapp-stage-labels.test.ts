import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

type LabelsModule = typeof import("@/lib/whatsapp/stage-labels");
const labels = serverModuleHarness<LabelsModule>("src/lib/whatsapp/stage-labels.ts", {
  "@/lib/security/credentials-crypto": { decryptCredentialValue: () => "token" },
  "./uazapi-credentials": { loadUazapiCredentials: async () => ({ baseUrl: "https://whatsapp.invalid" }) },
  "./human-intervention": { isHumanInterventionActive: (metadata: { human?: boolean } | null) => metadata?.human === true },
});

describe("WhatsApp Business stage labels", () => {
  it("derives the stage from a human in charge and the latest order", () => {
    const order = (status: string, payment_status: string | null, session: string | null = "session") => ({ status, payment_status, latest_payment_session_id: session });
    expect(labels.resolveConversationStage({ conversationMetadata: {}, latestOrder: null })).toBe("new_lead");
    expect(labels.resolveConversationStage({ conversationMetadata: {}, latestOrder: order("draft", "pending", null) })).toBe("new_lead");
    expect(labels.resolveConversationStage({ conversationMetadata: {}, latestOrder: order("pending_payment", "pending") })).toBe("awaiting_payment");
    expect(labels.resolveConversationStage({ conversationMetadata: {}, latestOrder: order("paid", "confirmed") })).toBe("paid");
    expect(labels.resolveConversationStage({ conversationMetadata: {}, latestOrder: order("cancelled", "pending") })).toBe("new_lead");
    expect(labels.resolveConversationStage({ conversationMetadata: { human: true }, latestOrder: order("paid", "confirmed") })).toBe("human");
  });

  it("moves only the system's stage labels and keeps the owner's own labels", () => {
    expect(labels.planStageLabelChange(["5511:2", "5511:5"], "7", ["5", "6", "7", "8"])).toEqual({ remove: ["5"], add: "7" });
    expect(labels.planStageLabelChange(["5511:7", "5511:2"], "7", ["5", "6", "7", "8"])).toEqual({ remove: [], add: null });
  });
});

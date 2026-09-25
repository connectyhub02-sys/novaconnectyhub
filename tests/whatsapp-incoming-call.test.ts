import { describe, expect, it } from "vitest";
import { defaultWhatsappBehaviorConfig as defaults } from "@/lib/whatsapp/agent-behavior";
import { serverModuleHarness } from "./helpers/server-module-harness";

type CallModule = typeof import("@/lib/whatsapp/incoming-call");
const call = serverModuleHarness<CallModule>("src/lib/whatsapp/incoming-call.ts", {
  "@/lib/security/credentials-crypto": { decryptCredentialValue: () => "token" },
  "./uazapi-credentials": { loadUazapiCredentials: async () => ({ baseUrl: "https://whatsapp.invalid" }) },
});

describe("incoming WhatsApp calls", () => {
  it("reads a ringing call and ignores the other stages of the same call and group calls", () => {
    const offer = { EventType: "call", event: { type: "CallOffer", CallID: "ABC123", CallCreator: "554788577996@s.whatsapp.net", From: "554788577996@s.whatsapp.net" } };
    expect(call.readIncomingCallOffer(offer)).toMatchObject({ callId: "ABC123", phoneNumber: "554788577996", providerChatId: "554788577996@s.whatsapp.net" });
    expect(call.readIncomingCallOffer({ EventType: "call", event: { type: "CallTerminate", CallID: "ABC123", From: "554788577996@s.whatsapp.net", reason: "offer timeout" } })).toBeNull();
    expect(call.readIncomingCallOffer({ EventType: "call", event: { type: "CallOffer", CallID: "G1", From: "1203630@g.us" } })).toBeNull();
    expect(call.readIncomingCallOffer({ EventType: "call", event: { type: "CallOffer", CallID: "L1", From: "123456789@lid" } })).toBeNull();
  });

  it("only rejects automatically inside the AI window", () => {
    const window = { ...defaults, aiScheduleEnabled: true, aiScheduleTimezone: "America/Sao_Paulo", aiScheduleStart: "09:00", aiScheduleEnd: "18:00" };
    expect(call.isInsideAiWindow(window, new Date("2026-09-25T15:00:00Z"))).toBe(true);
    expect(call.isInsideAiWindow(window, new Date("2026-09-25T23:30:00Z"))).toBe(false);
    expect(call.isInsideAiWindow({ ...window, aiScheduleEnabled: false }, new Date("2026-09-25T23:30:00Z"))).toBe(true);
  });
});

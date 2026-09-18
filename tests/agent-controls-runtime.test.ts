import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultWhatsappBehaviorConfig as defaults, normalizeWhatsappBehaviorSettings } from "../src/lib/whatsapp/agent-behavior";
import { conversationStyleInstructions } from "../src/lib/whatsapp/conversation-style";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

afterEach(() => vi.useRealTimers());
const message = (kind: string, text = "", seconds = 0) => ({ id: `message-${kind}-${seconds}`, direction: "inbound", message_type: kind, text_content: text, payload: {}, provider_message_id: `provider-${seconds}`, provider_chat_id: "chat", occurred_at: new Date(Date.UTC(2026, 8, 18, 15, 0, seconds)).toISOString() });

describe("agent controls connected to the real runtime", () => {
  it.each(["focused", "natural", "always"] as const)("honors the AI schedule with %s presence", presenceMode => {
    vi.useFakeTimers(); vi.setSystemTime("2026-09-18T15:00:00Z");
    const run = runtimeHarness();
    const config = normalizeWhatsappBehaviorSettings({ ...defaults, presenceMode, aiScheduleEnabled: true, aiScheduleTimezone: "America/Sao_Paulo", aiScheduleStart: "18:00", aiScheduleEnd: "23:00" });
    expect(run("isWithinSchedule", config)).toBe(false);
    expect(run("isWithinSchedule", { ...config, aiScheduleStart: "09:00", aiScheduleEnd: "17:00" })).toBe(true);
    expect(run("isWithinSchedule", { ...config, aiScheduleEnabled: false })).toBe(true);
    expect(run("isAlwaysPresenceMode", config)).toBe(presenceMode === "always");
    expect(run("isNaturalPresenceMode", config)).toBe(presenceMode === "natural");
  });
  it("supports overnight schedules", () => {
    vi.useFakeTimers(); vi.setSystemTime("2026-09-19T04:00:00Z");
    expect(runtimeHarness()("isWithinSchedule", { ...defaults, aiScheduleEnabled: true, aiScheduleTimezone: "America/Sao_Paulo", aiScheduleStart: "22:00", aiScheduleEnd: "06:00" })).toBe(true);
  });
  const timingCases = [
    ["text", "Olá", null, "timingTextSeconds"], ["text", "Olá", "text", "timingTextBurstSeconds"],
    ["image", "Legenda", null, "timingMediaCaptionSeconds"], ["image", "", "text", "timingMediaThenTextSeconds"], ["image", "", null, "timingMediaOnlySeconds"],
    ["audio", "Áudio transcrito", null, "timingAudioSeconds"], ["audio", "Áudio transcrito", "text", "timingAudioThenTextSeconds"],
    ["video", "Legenda", null, "timingVideoCaptionSeconds"], ["video", "", null, "timingVideoOnlySeconds"],
    ["document", "Legenda", null, "timingDocumentCaptionSeconds"], ["document", "", null, "timingDocumentOnlySeconds"],
    ["button", "Continuar", null, "timingButtonDelaySeconds"],
  ] as const;
  it.each(timingCases)("reads the %s/%s/%s timer (%s)", (kind, text, previousKind, field) => {
    const run = runtimeHarness();
    const latest = message(kind, text, 5), previous = previousKind ? message(previousKind, "Contexto", 0) : null;
    const context = { behavior: { ...defaults, smartTiming: true, audioQualityGuard: false, mediaBurstGuard: false, [field]: 37 }, messageType: kind, debounced: false, deferredUntil: null, latestInbound: latest, recentInboundMessages: previous ? [previous, latest] : [latest] };
    expect(run("resolveWhatsappAgentRunDelaySeconds", context)).toBe(37);
    expect(run("resolveWhatsappAgentRunDelaySeconds", { ...context, behavior: { ...context.behavior, smartTiming: false } })).toBe(0);
  });
  it.each(["image", "video", "document"] as const)("applies the %s batch limit", kind => {
    const run = runtimeHarness(), messages = Array.from({ length: 5 }, (_, index) => message(kind, "", index));
    const field = { image: "mediaBatchImageLimit", video: "mediaBatchVideoLimit", document: "mediaBatchDocumentLimit" }[kind];
    expect(run<unknown[]>("selectRecentVisualMediaBatch", { behavior: { ...defaults, [field]: 2 }, messages }, messages[4])).toHaveLength(2);
  });
  it("changes delivery according to text/audio/mirror, not the voice ID", () => {
    const run = runtimeHarness();
    const base = { run: { id: "run" }, conversationId: "conversation", providerMessageId: "message", messageType: "text", behavior: { ...defaults, audioVoiceId: "custom-voice", mirrorTextFallbackProbability: 0, spontaneousAudio: false } };
    for (const responseMode of ["text", "audio", "mirror"]) {
      const ctx = { ...base, behavior: { ...base.behavior, responseMode } };
      expect(run("shouldSendAudioResponse", ctx, message("text", "Olá"))).toBe(responseMode === "audio");
      expect(run("shouldSendAudioResponse", ctx, message("audio", "Olá"))).toBe(responseMode !== "text");
      expect(run("shouldSendAudioResponse", ctx, message("text", "Responda por texto, não posso ouvir áudio."))).toBe(false);
    }
  });
  it("turns quoting off, always on, or contextual", async () => {
    const run = runtimeHarness(), inbound = message("text", "Olá");
    for (const quoteReplyMode of ["off", "always", "smart"]) {
      const result = await run<Promise<unknown[]>>("resolveOutboundReplyTargets", {}, { behavior: { ...defaults, quoteReplyMode }, messages: [inbound] }, ["Resposta"]);
      expect(result).toEqual([quoteReplyMode === "always" ? inbound : null]);
    }
  });
  it("actually changes prompt instructions for media, small talk and rapport", () => {
    vi.useFakeTimers(); vi.setSystemTime("2026-09-18T15:00:00Z");
    const run = runtimeHarness();
    expect(run("buildProactiveMediaInstruction", { ...defaults, proactiveMedia: false })).toEqual([]);
    expect(run<string[]>("buildProactiveMediaInstruction", { ...defaults, proactiveMedia: true }).join("\n")).toContain("MIDIA PROATIVA");
    expect(run("buildSmallTalkContext", { ...defaults, smallTalk: false })).toEqual([]);
    expect(run<string[]>("buildSmallTalkContext", { ...defaults, smallTalk: true }).join("\n")).toContain("SMALL TALK");
    const instructions = ["off", "soft", "strong"].map(adaptiveRapportMode => conversationStyleInstructions({ ...defaults, adaptiveRapportMode: adaptiveRapportMode as typeof defaults.adaptiveRapportMode }).join("\n"));
    expect(new Set(instructions).size).toBe(3);
    expect(instructions[0]).toContain("sem imitar");
  });
  it.each(["Olá, bom dia", "Obrigado", "Combinado", "haha", "Vou verificar"])("resolves %s to an existing first-party sticker", text => {
    const url = new URL(runtimeHarness()<string>("pickContextualStickerUrl", text));
    expect(url.pathname).toMatch(/^\/whatsapp-stickers\/.+\.webp$/);
    expect(existsSync(`public${url.pathname}`)).toBe(true);
  });
});

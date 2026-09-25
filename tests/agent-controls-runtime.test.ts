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

describe("AI window keeps messages for when it opens", () => {
  const window = { ...defaults, aiScheduleEnabled: true, aiScheduleTimezone: "America/Sao_Paulo", aiScheduleStart: "18:00", aiScheduleEnd: "23:00" };
  function fakeRuns() {
    const updates: Array<Record<string, unknown>> = [];
    const client = { from: () => ({ update: (row: Record<string, unknown>) => { updates.push(row); const chain = { eq: () => chain, then: (resolve: (value: unknown) => void) => resolve({ error: null }) }; return chain; } }) };
    return { client, updates };
  }

  it("waits in the queue until the window opens instead of dropping the message", async () => {
    vi.useFakeTimers(); vi.setSystemTime("2026-09-18T15:00:00Z"); // 12:00 in São Paulo, window opens 18:00
    const run = runtimeHarness();
    const opensAt = run<Date>("nextAiWindowOpening", window);
    expect(opensAt.getTime() - Date.now()).toBeGreaterThanOrEqual(6 * 3600_000 + 30_000);
    expect(opensAt.getTime() - Date.now()).toBeLessThanOrEqual(6 * 3600_000 + 150_000);
    const { client, updates } = fakeRuns();
    const result = await run<Promise<Record<string, unknown>>>("deferRunUntilAiWindow", client, { id: "run", metadata: { conversationId: "c" } }, window, message("text", "oi"));
    expect(result).toMatchObject({ status: "deferred", reason: "outside_ai_schedule" });
    expect(updates[0]).toMatchObject({ metadata: { conversationId: "c", ai_schedule_deferred: true } });
    expect(updates[0]).not.toHaveProperty("run_status");
  });

  it("does not answer a kept message that a human already answered", () => {
    const run = runtimeHarness();
    const inbound = message("text", "oi", 0);
    const reply = { ...message("text", "Oi! Já te respondo", 30), direction: "outbound" };
    expect(run("wasHandledAfterInbound", [inbound], inbound)).toBe(false);
    expect(run("wasHandledAfterInbound", [inbound, reply], inbound)).toBe(true);
  });
});

describe("typing indicator while the reply is thought out", () => {
  function presenceHarness() {
    const calls: Array<Record<string, unknown>> = [];
    const run = runtimeHarness({}, { fetch: async (url: string, init: { body: string }) => {
      if (String(url).endsWith("/message/presence")) calls.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => "{}" };
    } });
    const context = (responseMode: string) => ({ credentials: { baseUrl: "https://whatsapp.invalid" }, behavior: { ...defaults, responseMode }, instance: { id: "i" } });
    return { run, calls, context };
  }

  it("shows typing during generation, gravando for a voice reply, and takes it down when nothing is sent", async () => {
    const { run, calls, context } = presenceHarness();
    const result = await run<Promise<{ ok: boolean; thinkingMs: number }>>("withThinkingPresence",
      { context: context("text"), token: "t", phone: "5500", latestInbound: message("text", "oi"), active: true }, async () => ({ ok: true }));
    expect(result.ok).toBe(true);
    expect(calls.at(0)).toMatchObject({ presence: "composing" });
    await run<Promise<unknown>>("withThinkingPresence",
      { context: context("mirror"), token: "t", phone: "5500", latestInbound: message("audio", ""), active: true }, async () => ({}));
    expect(calls.at(-1)).toMatchObject({ presence: "recording" });
    await expect(run<Promise<unknown>>("withThinkingPresence",
      { context: context("text"), token: "t", phone: "5500", latestInbound: null, active: true }, async () => { throw new Error("falhou"); })).rejects.toThrow("falhou");
    expect(calls.at(-1)).toMatchObject({ presence: "paused" });
  });
});

describe("waiting while the lead is typing", () => {
  const presenceClient = (event: Record<string, unknown> | null, secondsAgo: number, filters: string[] = []) => ({
    from: () => {
      const chain = {
        select: () => chain, gte: () => chain, order: () => chain,
        eq: (column: string, value: string) => { filters.push(`${column}=${value}`); return chain; },
        limit: async () => ({ data: event ? [{ received_at: new Date(Date.now() - secondsAgo * 1000).toISOString(), payload: { event } }] : [] }),
      };
      return chain;
    },
  });
  const context = { instance: { id: "instance", metadata: {} }, agent: { metadata: {} }, run: { metadata: {} }, conversationMetadata: {}, phoneNumber: "554788577996", lead: null, providerChatId: "554788577996@s.whatsapp.net", isGroupChat: false };

  it("recognizes typing and recording, and ignores stale or finished typing", async () => {
    const run = runtimeHarness();
    const filters: string[] = [];
    expect(await run("readLeadTypingState", presenceClient({ State: "composing", Media: "" }, 3, filters), context)).toBe("composing");
    expect(filters).toContain("payload->event->>chatid=554788577996@s.whatsapp.net");
    expect(await run("readLeadTypingState", presenceClient({ State: "composing", Media: "audio" }, 20), context)).toBe("recording");
    expect(await run("readLeadTypingState", presenceClient({ State: "composing", Media: "" }, 20), context)).toBeNull();
    expect(await run("readLeadTypingState", presenceClient({ State: "paused", Media: "" }, 1), context)).toBeNull();
    expect(await run("readLeadTypingState", presenceClient(null, 0), context)).toBeNull();
  });
});

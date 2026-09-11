import { describe, expect, it } from "vitest";
import { defaultWhatsappBehaviorConfig, mergeWhatsappHandoffNotificationSettings, normalizeWhatsappBehaviorConfig, normalizeWhatsappBehaviorSettings } from "@/lib/whatsapp/agent-behavior";
import { createActivitySetup, resolveWhatsappBehavior, resolveWhatsappBehaviorSettings } from "@/lib/whatsapp/activity-setup";

describe("WhatsApp activation preferences", () => {
  it("starts with the requested panel preset without copying the example's private voice", () => {
    for (const activity of ["corretor_imoveis", "advogado", "contador"]) {
      const { behavior } = createActivitySetup(activity, "Lia");
      expect(behavior).toMatchObject({ agentEnabled: true, presenceMode: "always", alwaysOnline: true,
        markAsRead: true, responseMode: "mirror", adaptiveRapportMode: "soft", quoteReplyMode: "smart",
        emojiReactions: true, textEmojis: true, sendStickers: true, proactiveMedia: true, smallTalk: true,
        cloneMemory: true, qualityMetrics: true, smartTiming: false, aiScheduleEnabled: false,
        audioVoiceId: "", settingsVersion: 1 });
      expect(behavior.allowGroupChats).toBe(false);
      expect(behavior.campaignBroadcasts).toBe(false);
    }
  });

  it("preserves all editable preferences through pause, storage, reload and reactivation", () => {
    const selected = normalizeWhatsappBehaviorSettings({ ...createActivitySetup("corretor_imoveis", "Lia").behavior,
      emojiReactions: false, textEmojis: false, sendStickers: false, proactiveMedia: false, smallTalk: false,
      cloneMemory: false, qualityMetrics: false, markAsRead: false, responseMode: "text", presenceMode: "focused",
      adaptiveRapportMode: "off", quoteReplyMode: "off", smartTiming: true, timingTextSeconds: 17,
      aiScheduleEnabled: true, aiScheduleStart: "09:00", aiScheduleEnd: "17:00",
      audioVoiceId: "own-voice", audioVoiceName: "Voz escolhida", audioVoiceSource: "own",
      humanHandoffNotifications: true, humanHandoffNotificationNumbers: "5511999999999" });
    const paused = normalizeWhatsappBehaviorSettings({ ...selected, agentEnabled: false });
    const stored = JSON.parse(JSON.stringify(paused));
    const reloaded = resolveWhatsappBehaviorSettings({ instance: stored });
    expect(reloaded).toEqual({ ...selected, agentEnabled: false });
    const resumed = normalizeWhatsappBehaviorSettings({ ...reloaded, agentEnabled: true });
    expect(resumed).toEqual(selected);
    expect(mergeWhatsappHandoffNotificationSettings(paused, paused)).toEqual(paused);
  });

  it("keeps runtime automation inactive while the paused agent retains its preferences", () => {
    const stored = normalizeWhatsappBehaviorSettings({ ...createActivitySetup("corretor_imoveis", "Lia").behavior,
      agentEnabled: false, proactiveFollowUp: true, humanHandoffNotifications: true });
    const effective = resolveWhatsappBehavior({ instance: stored });
    expect(effective).toMatchObject({ agentEnabled: false, alwaysOnline: false, markAsRead: false,
      cloneMemory: false, qualityMetrics: false, proactiveMedia: false, sendStickers: false,
      proactiveFollowUp: false, humanHandoffNotifications: false });
    expect(stored).toMatchObject({ cloneMemory: true, qualityMetrics: true, proactiveMedia: true,
      sendStickers: true, proactiveFollowUp: true });
  });

  it("recovers legacy automatic resets once, preserving marked opt-outs and voice choices", () => {
    const legacy = normalizeWhatsappBehaviorConfig({ ...defaultWhatsappBehaviorConfig, agentEnabled: false,
      audioVoiceId: "customer-voice", customizedStyleFields: ["cloneMemory", "sendStickers"] });
    const recovered = normalizeWhatsappBehaviorSettings(legacy);
    expect(recovered).toMatchObject({ agentEnabled: false, settingsVersion: 1, presenceMode: "always",
      responseMode: "mirror", qualityMetrics: true, cloneMemory: false, sendStickers: false,
      audioVoiceId: "customer-voice" });
    expect(normalizeWhatsappBehaviorSettings(JSON.parse(JSON.stringify(recovered)))).toEqual(recovered);
  });

  it("does not reset an existing active agent or a paused record without the legacy reset signature", () => {
    for (const agentEnabled of [true, false]) {
      const settings = normalizeWhatsappBehaviorSettings({ agentEnabled, responseMode: "text", presenceMode: "natural",
        cloneMemory: false, qualityMetrics: false, sendStickers: false, smallTalk: false });
      expect(settings).toMatchObject({ agentEnabled, responseMode: "text", presenceMode: "natural",
        cloneMemory: false, qualityMetrics: false, sendStickers: false, smallTalk: false });
    }
  });
});

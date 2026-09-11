import { describe, expect, it } from "vitest";
import { defaultWhatsappBehaviorConfig } from "../src/lib/whatsapp/agent-behavior";
import { buildFollowUpPersonalityLines, followUpGenerationMeteringText, validateFollowUpGeneration } from "../src/lib/whatsapp/follow-up-generation";

const behavior = { ...defaultWhatsappBehaviorConfig, textEmojis: false };
const response = (text: string, finishReason = "STOP", thought = false) => ({ candidates: [{ finishReason, content: { parts: [{ text, thought }] } }] });
const message = (text: string) => JSON.stringify({ action: "send", message: text });

describe("follow-up final generation boundary", () => {
  it.each(["Conseguiu conferir as opções de bairro?", "Could you confirm the preferred time?", "¿Pudiste revisar las opciones?"])("accepts a complete structured final message: %s", text => {
    expect(validateFollowUpGeneration(response(message(text)), behavior)).toMatchObject({ outcome: "send", text });
  });
  it.each([
    ['" without accents like "você",', "generation_invalid_format"],
    [message('" without accents like "você",'), "generation_internal_text"],
    [message("Me confirma o bairro,"), "generation_incomplete_message"],
    [message("👍"), "generation_empty_or_fragment"],
    [message("Consulte https://unapproved.invalid."), "generation_unapproved_placeholder_or_link"],
    [message("Olá, [nome], consegue confirmar?"), "generation_unapproved_placeholder_or_link"],
    [JSON.stringify({ action: "send", message: "Conseguiu conferir?", analysis: "extra" }), "generation_invalid_format"],
  ])("blocks invalid output without a customer message", (text, reason) => {
    expect(validateFollowUpGeneration(response(text), behavior)).toMatchObject({ outcome: "invalid", reason, text: "" });
  });
  it("rejects truncation even if a prefix happens to parse", () => {
    expect(validateFollowUpGeneration(response(message("Conseguiu conferir?"), "MAX_TOKENS"), behavior)).toMatchObject({ outcome: "invalid", reason: "generation_truncated" });
  });
  it("does not concatenate reasoning with the final answer", () => {
    const data = response(message("Conseguiu conferir?"));
    data.candidates[0].content.parts.unshift({ text: "Private reasoning", thought: true });
    expect(validateFollowUpGeneration(data, behavior)).toMatchObject({ outcome: "send", text: "Conseguiu conferir?", ignoredThoughtParts: 1 });
    expect(followUpGenerationMeteringText(data)).toContain("Private reasoning");
  });
  it("rejects thought-only, empty, missing completion, blocked and multiple-candidate responses", () => {
    const valid = response(message("Conseguiu conferir?"));
    for (const data of [response("reasoning", "STOP", true), response(""), response(message("Conseguiu conferir?"), ""), { ...valid, promptFeedback: { blockReason: "SAFETY" } }, { candidates: [...valid.candidates, ...valid.candidates] }]) {
      expect(validateFollowUpGeneration(data, behavior).outcome).toBe("invalid");
    }
  });
  it("allows a deliberate skip and honors emoji preferences", () => {
    expect(validateFollowUpGeneration(response(JSON.stringify({ action: "skip", message: "" })), behavior).outcome).toBe("skip");
    expect(validateFollowUpGeneration(response(message("Conseguiu conferir? 👍")), behavior).text).toBe("Conseguiu conferir?");
  });
  it("uses enabled DNA and excludes disabled DNA", () => {
    const profile = { enabled: true, tone: "Consultivo e objetivo" };
    expect(buildFollowUpPersonalityLines({ whatsapp_clone_profile: profile }, behavior).join("\n")).toContain(profile.tone);
    expect(buildFollowUpPersonalityLines({ whatsapp_clone_profile: { ...profile, enabled: false } }, behavior).join("\n")).not.toContain(profile.tone);
  });
});

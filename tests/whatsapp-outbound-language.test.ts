import { describe, expect, it } from "vitest";
import {
  normalizeOutboundLanguageText,
  outboundLanguageQualityPromptLines,
} from "../src/lib/whatsapp/outbound-language";

describe("WhatsApp outbound language quality", () => {
  it("expands chat abbreviations before text or audio delivery", () => {
    expect(normalizeOutboundLanguageText("VC quer q eu mande pra vc dps?")).toBe(
      "você quer que eu mande para você depois?",
    );
    expect(normalizeOutboundLanguageText("tbm posso explicar pq isso ajuda")).toBe(
      "também posso explicar porque isso ajuda",
    );
    expect(normalizeOutboundLanguageText("voce nao precisa mandar audio agora")).toBe(
      "você não precisa mandar áudio agora",
    );
  });

  it("expands English and Spanish abbreviations without changing unrelated language words", () => {
    expect(normalizeOutboundLanguageText("pls send me the audio when u can")).toBe(
      "please send me the audio when you can",
    );
    expect(normalizeOutboundLanguageText("xq tmb quieres el link? dnd lo envio?")).toBe(
      "porque también quieres el link? dónde lo envío?",
    );
  });

  it("keeps links and system tags intact while normalizing surrounding text", () => {
    const text = "Separei pra vc: {{link_produto}}\nhttps://example.com/vc?q=tb";

    expect(normalizeOutboundLanguageText(text)).toBe(
      "Separei para você: {{link_produto}}\nhttps://example.com/vc?q=tb",
    );
  });

  it("documents Portuguese, English and Spanish spelling requirements in the prompt", () => {
    const prompt = outboundLanguageQualityPromptLines.join("\n");

    expect(prompt).toContain("Português");
    expect(prompt).toContain("English");
    expect(prompt).toContain("Español");
    expect(prompt).toContain("Nunca use voce");
  });
});

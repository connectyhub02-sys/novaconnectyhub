import { describe, expect, it } from "vitest";
import {
  normalizeOutboundLanguageText,
  normalizeOutboundSpeechText,
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

  it("normalizes checkout accents and BRL prices before delivery", () => {
    expect(normalizeOutboundLanguageText("Qual forma de pagamento voce prefere: Pix ou cartao de credito? No Pix eu envio o codigo no proximo passo.")).toBe(
      "Qual forma de pagamento você prefere: Pix ou cartão de crédito? No Pix eu envio o código no próximo passo.",
    );
    expect(normalizeOutboundLanguageText("Oxandrolona 10mg / 100 capsulas - Power Lab - 237,99 BRL")).toBe(
      "Oxandrolona 10mg / 100 capsulas - Power Lab - R$ 237,99",
    );
  });

  it("speaks Brazilian currency naturally in generated audio", () => {
    expect(normalizeOutboundSpeechText("Sai por R$ 237,99. Oxandrolona - 237,99 BRL")).toBe(
      "Sai por duzentos e trinta e sete reais e noventa e nove centavos. Oxandrolona - duzentos e trinta e sete reais e noventa e nove centavos",
    );
  });

  it.each([
    ["R$ 950.000,00", "novecentos e cinquenta mil reais"],
    ["950 mil", "novecentos e cinquenta mil reais"],
    ["O valor é 950 mil.", "O valor é novecentos e cinquenta mil reais."],
    ["950000 reais", "novecentos e cinquenta mil reais"],
    ["R$ 2.590,10", "dois mil quinhentos e noventa reais e dez centavos"],
    ["R$ 1,01", "um real e um centavo"],
    ["R$ 0,50", "cinquenta centavos"],
    ["R$ 0,00", "zero reais"],
    ["1,5 milhão de reais", "um milhão e quinhentos mil reais"],
    ["R$ 1.000.000,00", "um milhão de reais"],
    ["R$ 1.001,00", "mil e um reais"],
    ["R$ 100,00", "cem reais"],
  ])("reads a monetary value in full and remains idempotent: %s", (input, output) => {
    expect(normalizeOutboundSpeechText(input)).toBe(output);
    expect(normalizeOutboundSpeechText(output)).toBe(output);
  });
  it("does not turn counts, phone numbers, codes, links or template tags into money", () => {
    for (const value of ["950 mil seguidores", "Código 950000", "+55 67 99262-5652", "https://fixture.invalid/950mil?preco=R$950", "{{preco_R$950}}", "Área de 950 m²"]) {
      expect(normalizeOutboundSpeechText(value)).toBe(value);
    }
  });

  it("documents Portuguese, English and Spanish spelling requirements in the prompt", () => {
    const prompt = outboundLanguageQualityPromptLines.join("\n");

    expect(prompt).toContain("Português");
    expect(prompt).toContain("English");
    expect(prompt).toContain("Español");
    expect(prompt).toContain("Nunca use voce");
  });
});

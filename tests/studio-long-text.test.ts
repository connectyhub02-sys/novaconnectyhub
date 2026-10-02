import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as LongText from "../src/lib/voice-api/studio-long-tts";
import { longTextMaxCharacters, parseStudioInput, studioInputUnits } from "../src/lib/voice-api/studio-contract";

const longText = serverModuleHarness<typeof LongText>("src/lib/voice-api/studio-long-tts.ts");

describe("long text (e-book) parts", () => {
  it("splits by paragraphs and sentences within the limit, without losing or cutting words", () => {
    const paragraph = (n: number) => Array.from({ length: n }, (_, i) => `Frase número ${i + 1} do capítulo, com algumas palavras.`).join(" ");
    const text = [paragraph(30), paragraph(5), "Curto.", paragraph(120)].join("\n\n");
    const parts = longText.splitLongText(text, 1000);
    expect(parts.every(part => part.length <= 1000)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
    expect(parts.length).toBeGreaterThan(5);
    expect(longText.splitLongText(text, 1000)).toEqual(parts);
  });

  it("splits a sentence longer than the limit at a word boundary", () => {
    const words = Array.from({ length: 400 }, (_, i) => `palavra${i}`).join(" ");
    const parts = longText.splitLongText(words, 500);
    expect(parts.every(part => part.length <= 500)).toBe(true);
    expect(parts.join(" ").split(" ")).toEqual(words.split(" "));
  });

  it("keeps small texts in one part and uses shorter parts for v3", () => {
    expect(longText.splitLongText("Olá.\n\nTudo bem?", 4000)).toEqual(["Olá.\n\nTudo bem?"]);
    expect(longText.longTextPartLimit("eleven_v3")).toBe(2400);
    expect(longText.longTextPartLimit("eleven_multilingual_v2")).toBe(4000);
  });

  it("sends neighbouring text for continuity, except on v3, plus settings and language", () => {
    const input = parseStudioInput({ operation: "long_tts", model_id: "eleven_flash_v2_5", voice_id: "voice1", text: "a", voice_settings: { stability: 0.5, speed: 1.1 }, language_code: "pt" });
    const parts = ["Parte um.", "Parte dois.", "Parte três."];
    expect(longText.longTextRequestBody(input, parts, 1)).toEqual({ text: "Parte dois.", model_id: "eleven_flash_v2_5", voice_settings: { stability: 0.5, speed: 1.1 }, language_code: "pt", previous_text: "Parte um.", next_text: "Parte três." });
    expect(longText.longTextRequestBody(input, parts, 0)).not.toHaveProperty("previous_text");
    const v3 = parseStudioInput({ operation: "long_tts", model_id: "eleven_v3", voice_id: "voice1", text: "a" });
    expect(longText.longTextRequestBody(v3, parts, 1)).toEqual({ text: "Parte dois.", model_id: "eleven_v3" });
  });
});

describe("long text contract", () => {
  it("accepts up to the e-book limit and quotes every character", () => {
    const text = "a ".repeat(longTextMaxCharacters / 2).trim();
    const input = parseStudioInput({ operation: "long_tts", voice_id: "v", text });
    expect(input.model_id).toBe("eleven_multilingual_v2");
    expect(studioInputUnits(input)).toEqual({ characters: text.length });
    expect(() => parseStudioInput({ operation: "long_tts", voice_id: "v", text: "a".repeat(longTextMaxCharacters + 1) })).toThrow("volumes");
  });

  it("normalizes spacing and rejects unknown models and settings", () => {
    expect(parseStudioInput({ operation: "long_tts", voice_id: "v", text: "  Um\r\n\r\n\r\n\r\nDois   três  " }).text).toBe("Um\n\nDois três");
    expect(() => parseStudioInput({ operation: "long_tts", voice_id: "v", text: "a", model_id: "eleven_monolingual_v1" })).toThrow("Modelo");
    expect(() => parseStudioInput({ operation: "long_tts", voice_id: "v", text: "a", voice_settings: { speed: 2 } })).toThrow("velocidade");
    expect(() => parseStudioInput({ operation: "long_tts", voice_id: "v", text: "a", extra: 1 })).toThrow("Campo não suportado");
  });
});

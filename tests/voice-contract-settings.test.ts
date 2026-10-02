import { describe, expect, it } from "vitest";
import { parseVoiceInput } from "../src/lib/voice-api/contract";

describe("single text-to-speech settings", () => {
  it("accepts speed and language like the provider, keeping defaults", () => {
    const input = parseVoiceInput({ text: "Olá", voice_id: "voice1", voice_settings: { speed: 1.15, stability: 0.4 }, language_code: "pt" });
    expect(input.voice_settings).toEqual({ stability: 0.4, similarity_boost: 0.78, style: 0.22, use_speaker_boost: true, speed: 1.15 });
    expect(input.language_code).toBe("pt");
    expect(parseVoiceInput({ text: "Olá", voice_id: "voice1" })).not.toHaveProperty("language_code");
    expect(parseVoiceInput({ text: "Olá", voice_id: "voice1" }).voice_settings).not.toHaveProperty("speed");
  });

  it("rejects speeds and languages outside the supported range", () => {
    expect(() => parseVoiceInput({ text: "Olá", voice_id: "v", voice_settings: { speed: 1.5 } })).toThrow("velocidade");
    expect(() => parseVoiceInput({ text: "Olá", voice_id: "v", language_code: "Portuguese" })).toThrow("Idioma");
  });
});

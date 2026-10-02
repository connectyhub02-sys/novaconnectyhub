import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseStudioInput, studioInputUnits } from "../src/lib/voice-api/studio-contract";
import { studioResourceProviderRequest } from "../src/lib/voice-api/studio-resource-provider";

describe("sound effects, music and voice remix", () => {
  it("quotes the chosen output length exactly, per minute", () => {
    expect(studioInputUnits(parseStudioInput({ operation: "sound_effects", text: "Chuva no telhado", duration_seconds: 6 }))).toEqual({ minutes: 0.1 });
    expect(studioInputUnits(parseStudioInput({ operation: "music", prompt: "Trilha calma de piano", music_length_ms: 90000 }))).toEqual({ minutes: 1.5 });
    const sample = "x".repeat(120);
    expect(studioInputUnits(parseStudioInput({ operation: "voice_remix", voice_id: "v1", description: "Mais grave", sample_text: sample }))).toEqual({ characters: 120 });
  });

  it("refuses out-of-range lengths and fields from other operations", () => {
    expect(() => parseStudioInput({ operation: "sound_effects", text: "Chuva", duration_seconds: 45 })).toThrow("0,5 a 30");
    expect(() => parseStudioInput({ operation: "music", prompt: "Trilha calma de piano", music_length_ms: 5000 })).toThrow("10 a 300");
    expect(() => parseStudioInput({ operation: "music", prompt: "Trilha calma de piano", music_length_ms: 30000, duration_seconds: 3 })).toThrow("Campo não suportado");
    expect(() => parseStudioInput({ operation: "voice_remix", voice_id: "v1", description: "Mais grave", sample_text: "curto" })).toThrow();
  });

  it("calls the provider with fixed models, explicit text and audio output", () => {
    const sfx = studioResourceProviderRequest({ operation: "sound_effects", text: "Chuva no telhado", durationSeconds: 6, promptInfluence: 0.3 });
    expect(sfx.url).toBe("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128");
    expect(JSON.parse(String(sfx.body))).toEqual({ text: "Chuva no telhado", model_id: "eleven_text_to_sound_v2", duration_seconds: 6, prompt_influence: 0.3 });
    expect(sfx.audioResult).toBe(true);
    const music = studioResourceProviderRequest({ operation: "music", prompt: "Trilha calma de piano", lengthMs: 90000 });
    expect(JSON.parse(String(music.body))).toEqual({ prompt: "Trilha calma de piano", music_length_ms: 90000, model_id: "music_v1" });
    const remix = studioResourceProviderRequest({ operation: "voice_remix", voiceId: "v1", description: "Mais grave", sampleText: "x".repeat(120) });
    expect(remix.url).toBe("https://api.elevenlabs.io/v1/text-to-voice/v1/remix?output_format=mp3_44100_128");
    expect(JSON.parse(String(remix.body))).toMatchObject({ voice_description: "Mais grave", auto_generate_text: false });
    expect(() => studioResourceProviderRequest({ operation: "voice_remix", voiceId: "../x", description: "Mais grave", sampleText: "x".repeat(120) })).toThrow();
  });
});

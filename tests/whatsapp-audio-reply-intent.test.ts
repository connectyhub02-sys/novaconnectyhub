import { describe, expect, it } from "vitest";
import { isLeadRejectingAudioReply, isLeadRequestingAudioReply } from "../src/lib/whatsapp/audio-reply-intent";

describe("WhatsApp audio reply intent", () => {
  it("detects when the lead asks for audio in text", () => {
    expect(isLeadRequestingAudioReply("me envia um audio pq nao estou entendendo")).toBe(true);
    expect(isLeadRequestingAudioReply("manda audio, estou dirigindo")).toBe(true);
    expect(isLeadRequestingAudioReply("pode explicar por voz?")).toBe(true);
  });

  it("detects driving or reading constraints as audio requests", () => {
    expect(isLeadRequestingAudioReply("to dirigindo, nao consigo ler agora, manda por audio")).toBe(true);
    expect(isLeadRequestingAudioReply("estou no volante, consegue me explicar falando?")).toBe(true);
  });

  it("does not force audio for unrelated mentions", () => {
    expect(isLeadRequestingAudioReply("o audio que eu mandei ficou ruim?")).toBe(false);
    expect(isLeadRequestingAudioReply("vcs tem audio book?")).toBe(false);
  });

  it("respects explicit text-only preference", () => {
    expect(isLeadRejectingAudioReply("nao manda audio, estou no trabalho")).toBe(true);
    expect(isLeadRejectingAudioReply("prefiro por texto")).toBe(true);
    expect(isLeadRequestingAudioReply("nao manda audio, responde por texto")).toBe(false);
  });
});

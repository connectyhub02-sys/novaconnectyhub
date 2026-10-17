import { describe, expect, it } from "vitest";
import { mergeStudioHistory, studioHistoryJobs, type StudioHistoryReceipt } from "../src/lib/voice-api/studio-history";

const receipt: StudioHistoryReceipt = {
  id: "speech-1", operation: "text_to_speech", status: "completed", model_id: "eleven_multilingual_v2",
  voice_id: "voice-1", created_at: "2026-10-17T12:00:00Z", usage: { credits: 12, reserved_credits: 0 }, audio: { path: "/api/v1/voice/generations/speech-1/audio" },
};

describe("Studio history restored from receipts", () => {
  it("restores playable speech without a local blob or transcript", () => {
    const [job] = studioHistoryJobs("project-1", [receipt]);
    expect(job.audioUrl).toBe("/api/dashboard/voice/generations/speech-1/audio?project=project-1");
    expect(job.text).toBeUndefined();
    expect(job.credits).toBe(12);
    expect(studioHistoryJobs("project-2", [receipt])[0].audioUrl).toContain("project=project-2");
  });

  it("excludes cloning, previews and other studio tools", () => {
    const operations = ["voice_clone", "voice_clone_preview", "sound_effects", "transcription"];
    expect(studioHistoryJobs("p", operations.map(operation => ({ ...receipt, operation })))).toEqual([]);
  });

  it("restores audiobooks but never offers audio for pending or deleted results", () => {
    const book = { ...receipt, operation: "long_tts", audio: null, result: { path: "/ignored" } };
    expect(studioHistoryJobs("p", [book])[0].audioUrl).toContain("/operations/speech-1/result?project=p");
    for (const row of [{ ...book, result: null }, { ...book, status: "processing" }, { ...receipt, status: "failed" }]) {
      expect(studioHistoryJobs("p", [row])[0].audioUrl).toBeUndefined();
    }
  });

  it("merges a refreshed receipt once, preserves session text, and drops stale audio", () => {
    const [job] = studioHistoryJobs("p", [receipt]);
    const merged = mergeStudioHistory([{ ...job, text: "Texto desta sessão" }], [{ ...job, audioUrl: undefined }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("Texto desta sessão");
    expect(merged[0].audioUrl).toBeUndefined();
  });

  it("keeps a generation completed while the initial history request was in flight", () => {
    const [older] = studioHistoryJobs("p", [receipt]);
    const newer = { ...older, id: "new", text: "Novo", createdAt: "2026-10-17T13:00:00Z" };
    expect(mergeStudioHistory([newer], [older]).map(job => job.id)).toEqual(["new", "speech-1"]);
  });
});

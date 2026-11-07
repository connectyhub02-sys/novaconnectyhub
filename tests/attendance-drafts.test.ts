import { describe, expect, it } from "vitest";
import { attendanceDraftKey, acknowledgeAttendanceDraft } from "@/lib/client-os/attendance-drafts";

describe("attendance draft isolation", () => {
  it("isolates conversations, organizations, channels and panel scopes", () => {
    const keys = [attendanceDraftKey(undefined, "a", "whatsapp", "1", "lead"), attendanceDraftKey(undefined, "a", "whatsapp", "2", "lead"), attendanceDraftKey(undefined, "b", "whatsapp", "1", "lead"), attendanceDraftKey(undefined, "a", "instagram", "1", "lead"), attendanceDraftKey("platform_internal", "a", "whatsapp", "1", "lead")];
    expect(new Set(keys).size).toBe(5);
    const drafts = { [keys[0]!]: "Resposta A", [keys[1]!]: "Resposta B" };
    expect(drafts[keys[0]!]).toBe("Resposta A");
    expect(drafts[keys[2]!]).toBeUndefined();
    expect(attendanceDraftKey(undefined, "a", "whatsapp", null, null)).toBeNull();
  });
  it("clears only the acknowledged draft and preserves edits made while sending", () => {
    const drafts = { a: "Primeira", b: "Outra conversa" };
    expect(acknowledgeAttendanceDraft(drafts, "a", "Primeira")).toEqual({ b: "Outra conversa" });
    expect(acknowledgeAttendanceDraft({ ...drafts, a: "Nova edição" }, "a", "Primeira")).toEqual({ a: "Nova edição", b: "Outra conversa" });
    expect(acknowledgeAttendanceDraft(drafts, null, "Primeira")).toBe(drafts);
  });
});

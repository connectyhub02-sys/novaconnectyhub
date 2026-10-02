import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { geminiLowThinkingConfig } from "../src/lib/gemini/models";

describe("low thinking for attendance tasks", () => {
  it("chooses the parameter each model family accepts", () => {
    expect(geminiLowThinkingConfig("gemini-3.6-flash")).toEqual({ thinkingConfig: { thinkingLevel: "LOW" } });
    expect(geminiLowThinkingConfig("models/gemini-3.1-pro-preview")).toEqual({ thinkingConfig: { thinkingLevel: "LOW" } });
    expect(geminiLowThinkingConfig("gemini-2.5-flash")).toEqual({ thinkingConfig: { thinkingBudget: 1024 } });
    expect(geminiLowThinkingConfig("gemini-2.5-flash-preview-tts")).toEqual({});
    expect(geminiLowThinkingConfig("other-model")).toEqual({});
    expect(geminiLowThinkingConfig(null)).toEqual({});
  });

  it("is applied to every Gemini request of the WhatsApp attendance and its automations", () => {
    const files = {
      "src/lib/whatsapp/agent-runtime.ts": 13,
      "src/lib/whatsapp/proactive-followup.ts": 1,
      "src/lib/automations/agenda-agent.ts": 1,
      "src/lib/commerce-agent/server.ts": 1,
      "src/lib/whatsapp/channel-operations.ts": 1,
      "src/lib/whatsapp/clone-profile-history.ts": 1,
    };
    for (const [file, calls] of Object.entries(files)) {
      const source = readFileSync(file, "utf8");
      const requests = source.match(/generationConfig:/g)?.length ?? 0;
      expect(source.match(/geminiLowThinkingConfig\(/g)?.length, file).toBe(calls);
      expect(requests, file).toBeLessThanOrEqual(calls + 1);
    }
  });
});

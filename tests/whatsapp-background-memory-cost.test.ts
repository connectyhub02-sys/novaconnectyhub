import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");

describe("background memory cost", () => {
  it("refreshes the five conversation memories together, every few customer messages", () => {
    const gate = runtime.slice(runtime.indexOf("if (await claimBackgroundMemoryRefresh(client, context)"), runtime.indexOf("if (!agendaTurn?.booked"));
    for (const extractor of ["extractConversationLearning(", "extractLeadMemory(", "extractCloneMemory(", "extractConversationArcSummary(", "extractNegotiationState("]) {
      expect(gate).toContain(extractor);
    }
    expect(gate).toContain("await Promise.allSettled([");
    expect(runtime).toContain("const backgroundMemoryEveryInbound = 3;");
    expect(runtime).toContain("const backgroundMemoryIdleMs = 20 * 60 * 1000;");
  });

  it("never calls the memory extractors outside the refresh gate", () => {
    const outside = runtime.replace(runtime.slice(runtime.indexOf("if (await claimBackgroundMemoryRefresh(client, context)"), runtime.indexOf("if (!agendaTurn?.booked")), "");
    for (const call of ["extractLeadMemory(client, context, userText)", "extractCloneMemory(client, context, userText", "extractConversationArcSummary(client, context)", "extractNegotiationState(client, context)"]) {
      expect(outside).not.toContain(call);
    }
  });
});

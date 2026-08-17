import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agentRuntimeSource = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");

function sourceBetween(start: string, end: string) {
  const startIndex = agentRuntimeSource.indexOf(start);
  const endIndex = agentRuntimeSource.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return agentRuntimeSource.slice(startIndex, endIndex);
}

describe("WhatsApp media followed by text", () => {
  it("does not return plain text before checking recent visual media", () => {
    const body = sourceBetween("async function resolveInboundUserText", "async function buildTextWithRecentVisualMediaContext");
    const mediaDetectionIndex = body.indexOf("const mediaKind = detectInboundMediaKind(latestInbound);");
    const textContextIndex = body.indexOf("const textWithMediaContext = await buildTextWithRecentVisualMediaContext");
    const plainTextReturnIndex = body.indexOf("return textWithMediaContext ?? text;");

    expect(mediaDetectionIndex).toBeGreaterThanOrEqual(0);
    expect(textContextIndex).toBeGreaterThan(mediaDetectionIndex);
    expect(plainTextReturnIndex).toBeGreaterThan(textContextIndex);
  });

  it("analyzes recent media from the same inbound cluster before answering the follow-up text", () => {
    const body = sourceBetween("async function buildTextWithRecentVisualMediaContext", "async function buildMediaBatchUserText");

    expect(body).toContain("selectRecentVisualMediaBeforeText(input.context, input.latestInbound)");
    expect(body).toContain("resolveInboundMediaAnalysis");
    expect(body).toContain("[MIDIA RECENTE DO LEAD]");
    expect(body).toContain("Use a analise da midia junto com o texto mais recente do lead.");
  });

  it("keeps the recent-media lookup bounded and reuses stored analysis", () => {
    const selector = sourceBetween("function selectRecentVisualMediaBeforeText", "async function resolveInboundMediaAnalysis");
    const resolver = sourceBetween("async function resolveInboundMediaAnalysis", "async function transcribeAndPersistInboundAudio");

    expect(selector).toContain("getRecentInboundCluster(context.messages)");
    expect(selector).toContain("message.id !== latestInbound.id");
    expect(selector).toContain("latestTime - messageTime <= windowMs");
    expect(resolver).toContain("readStoredMediaAnalysisText(input.message, input.kind)");
    expect(resolver).toContain("analyzeAndPersistInboundMedia");
  });
});

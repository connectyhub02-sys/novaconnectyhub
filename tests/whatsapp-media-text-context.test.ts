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

describe("WhatsApp media followed by text or audio", () => {
  it("does not return plain text before checking recent visual media", () => {
    const body = sourceBetween("async function resolveInboundUserText", "async function buildTextWithRecentVisualMediaContext");
    const mediaDetectionIndex = body.indexOf("const mediaKind = detectInboundMediaKind(latestInbound);");
    const textContextIndex = body.indexOf("const textWithMediaContext = await buildTextWithRecentVisualMediaContext");
    const plainTextReturnIndex = body.indexOf("return textWithMediaContext ?? text;");

    expect(mediaDetectionIndex).toBeGreaterThanOrEqual(0);
    expect(textContextIndex).toBeGreaterThan(mediaDetectionIndex);
    expect(plainTextReturnIndex).toBeGreaterThan(textContextIndex);
  });

  it("does not return audio transcript before checking recent visual media", () => {
    const body = sourceBetween("async function resolveInboundUserText", "async function buildTextWithRecentVisualMediaContext");
    const transcriptContextIndex = body.indexOf("const transcriptWithMediaContext = await buildTextWithRecentVisualMediaContext");
    const audioFollowUpIndex = body.indexOf('followUpKind: "audio"');
    const transcriptReturnIndex = body.indexOf("return transcriptWithMediaContext ?? transcript;");

    expect(transcriptContextIndex).toBeGreaterThanOrEqual(0);
    expect(audioFollowUpIndex).toBeGreaterThan(transcriptContextIndex);
    expect(transcriptReturnIndex).toBeGreaterThan(audioFollowUpIndex);
  });

  it("analyzes recent media from the same inbound cluster before answering the follow-up text", () => {
    const body = sourceBetween("async function buildTextWithRecentVisualMediaContext", "async function buildMediaBatchUserText");

    expect(body).toContain("selectRecentVisualMediaBeforeText(input.context, input.latestInbound)");
    expect(body).toContain("resolveInboundMediaAnalysis");
    expect(body).toContain("[MIDIA RECENTE DO LEAD]");
    expect(body).toContain("Use a analise da midia junto com ${followUpReference} do lead.");
    expect(body).toContain("a transcricao do audio mais recente");
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

  it("uses media text_content as caption unless it is stored analysis", () => {
    const caption = sourceBetween("function readMediaCaptionTextContent", "function isAudioMessage");
    const extractor = sourceBetween("function extractMessageCaption", "function formatMediaKind");

    expect(caption).toContain("readStoredMediaAnalysisText(message, kind)");
    expect(caption).toContain('normalized.startsWith("analise automatica de ")');
    expect(extractor).toContain("?? readMediaCaptionTextContent(message)");
  });

  it("keeps image analysis detailed enough for commercial object identification", () => {
    const analyzer = sourceBetween("async function analyzeDownloadedMediaWithGemini", "const inboundAudioTranscriptionPrompt");
    const prompt = sourceBetween("function buildMediaAnalysisPrompt", "function extractProviderTranscript");

    expect(analyzer).toContain("maxOutputTokens: input.kind === \"video\" ? 2200 : 1800");
    expect(prompt).toContain("objeto/produto principal");
    expect(prompt).toContain("veiculo");
    expect(prompt).toContain("marca/modelo/versao provavel");
    expect(prompt).toContain("nivel de confianca");
  });
});

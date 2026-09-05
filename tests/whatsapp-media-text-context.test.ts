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
  it("sends a generated visual-media acknowledgement before media analysis", () => {
    const processBody = sourceBetween("export async function processWhatsappAgentRun", "async function loadRunContext");
    const acknowledgement = sourceBetween("async function maybeSendMediaProcessingAcknowledgement", "function selectMediaAcknowledgementTarget");
    const generator = sourceBetween("async function generateMediaProcessingAcknowledgement", "function buildMediaAcknowledgementSystemInstruction");

    expect(processBody.indexOf("await maybeSendMediaProcessingAcknowledgement")).toBeGreaterThanOrEqual(0);
    expect(processBody.indexOf("await maybeSendMediaProcessingAcknowledgement")).toBeLessThan(processBody.indexOf("let userText = await resolveInboundUserText"));
    expect(acknowledgement).toContain("selectMediaAcknowledgementTarget");
    expect(acknowledgement).toContain("hasSentMediaProcessingAcknowledgement");
    expect(acknowledgement).toContain("collectRecentMediaAcknowledgementTexts");
    expect(acknowledgement).toContain("sendWhatsappText");
    expect(acknowledgement).toContain("media_processing_acknowledgement");
    expect(generator).toContain("temperature: 0.9");
    expect(generator).toContain("maxOutputTokens: 70");
  });

  it("keeps media acknowledgements variable and avoids audio-only acknowledgements", () => {
    const selector = sourceBetween("function selectMediaAcknowledgementTarget", "function uniqueConversationMessages");
    const prompt = sourceBetween("function buildMediaAcknowledgementSystemInstruction", "function buildMediaAcknowledgementPrompt");
    const antiRepeat = sourceBetween("function isTooSimilarToRecentAcknowledgement", "function tokenSimilarity");

    expect(selector).toContain("context.behavior.mediaProcessingAcknowledgement");
    expect(selector).toContain("detectInboundMediaKind");
    expect(selector).not.toContain("isAudioMessage");
    expect(selector).not.toContain("readStoredMediaAnalysisText");
    expect(prompt).toContain("Nao use frases prontas repetitivas");
    expect(prompt).toContain("Nao comente o conteudo da midia ainda");
    expect(antiRepeat).toContain("tokenSimilarity");
  });

  it("asks the lead to resend view-once media instead of trying to analyze it", () => {
    const processBody = sourceBetween("export async function processWhatsappAgentRun", "async function loadRunContext");
    const handler = sourceBetween("async function maybeHandleViewOnceInboundMessage", "async function resolveInboundUserText");
    const detector = sourceBetween("function isViewOnceInboundMessage", "function detectInboundMediaKind");

    expect(processBody.indexOf("await maybeHandleViewOnceInboundMessage")).toBeGreaterThanOrEqual(0);
    expect(processBody.indexOf("await maybeHandleViewOnceInboundMessage")).toBeLessThan(processBody.indexOf("await maybeSendMediaProcessingAcknowledgement"));
    expect(processBody).toContain("view_once_message_requires_resend");
    expect(handler).toContain("visualização única");
    expect(handler).toContain("agent_view_once_resend");
    expect(detector).toContain("view_once");
    expect(detector).toContain("visualizacao unica");
    expect(detector).toContain("providerMessage?.viewOnce === true");
    expect(detector).toContain("content?.viewOnce === true");
    expect(detector).toContain("Boolean(viewOnceContainer)");
    expect(detector).not.toContain("buildProviderMessageKeySignature(providerMessage)");
  });

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

  it("uses media analysis as a qualification bridge instead of a generic receipt", () => {
    const mediaText = sourceBetween("function buildMediaUserText", "function buildStoredMediaAnalysisText");
    const systemInstruction = sourceBetween("function buildMediaDrivenQualificationInstruction", "function buildLeadMemoryLines");
    const repair = sourceBetween("async function maybeRepairMediaGroundingResponse", "function buildSystemInstruction");

    expect(mediaText).toContain("buildMediaDrivenNextStepInstruction(input.qualificationEnabled)");
    expect(mediaText).toContain("comentario real da midia -> conexao com a intencao do lead -> uma pergunta de qualificacao natural");
    expect(systemInstruction).toContain("MIDIA COMO CONTEXTO COMERCIAL");
    expect(systemInstruction).toContain("cite pelo menos um detalhe concreto");
    expect(systemInstruction).toContain("conecte a midia ao playbook de qualificacao");
    expect(repair).toContain("shouldRepairMediaGrounding");
    expect(repair).toContain("[CORRECAO INTERNA - RESPOSTA SOBRE MIDIA GENERICA]");
    expect(repair).toContain("Obrigatorio: cite pelo menos um detalhe concreto da midia antes de avancar.");
  });
});

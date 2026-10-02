export const defaultGeminiModel = "gemini-3.6-flash";
export const defaultGeminiTtsModel = "gemini-3.1-flash-tts-preview";

const modelReplacements: Record<string, string> = {
  "gemini-2.5-flash": defaultGeminiModel,
};

export function normalizeGeminiModel(value: string | null | undefined) {
  const model = normalizeGeminiModelId(value);

  if (!model) {
    return defaultGeminiModel;
  }

  return modelReplacements[model] ?? model;
}

export function getGeminiModelReplacement(value: string | null | undefined) {
  const model = normalizeGeminiModelId(value);
  return model ? modelReplacements[model] ?? null : null;
}

/**
 * Thinking shares the output token limit. Without a level, Gemini 3 thinks at its
 * default (high) and short JSON tasks run out of room before answering. Pass the
 * same model id used in the request URL.
 */
export function geminiLowThinkingConfig(modelId: string | null | undefined) {
  const model = normalizeGeminiModelId(modelId);
  if (/^gemini-3(?:[.-]|$)/.test(model)) return { thinkingConfig: { thinkingLevel: "LOW" } };
  if (/^gemini-2\.5(?:[.-]|$)/.test(model) && !model.includes("tts")) return { thinkingConfig: { thinkingBudget: 1024 } };
  return {};
}

export function normalizeGeminiModelId(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^models\//, "");
}

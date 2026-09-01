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

export function normalizeGeminiModelId(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^models\//, "");
}

type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
export const publicAiModel = "connectyhub-auto";

// Whitelist public fields, including when replaying historical provider-shaped snapshots.
export function publicAiCompletion(value: unknown) {
  const raw = object(value), credits = object(raw.connectyhub);
  return {
    id: raw.id, object: raw.object, created: raw.created, model: publicAiModel,
    choices: (Array.isArray(raw.choices) ? raw.choices : []).map(value => {
      const choice = object(value), message = object(choice.message);
      return { index: choice.index, message: { role: "assistant", content: message.content }, finish_reason: choice.finish_reason };
    }),
    connectyhub: { request_id: credits.request_id, project_id: credits.project_id, credits: Number(credits.credits ?? 0) },
  };
}

export function publicAiErrorCode(code: string | null) {
  if (!code) return null;
  return /provider|token|pricing|usage_unavailable/.test(code) ? "service_unavailable" : code;
}

export function publicAiRequest(value: unknown) {
  const raw = object(value);
  return { id: raw.id, status: raw.status, charged_credits: Number(raw.charged_credits ?? 0), reserved_credits: Number(raw.reserved_credits ?? 0), response: raw.response ? publicAiCompletion(raw.response) : null, error_code: publicAiErrorCode(typeof raw.error_code === "string" ? raw.error_code : null), created_at: raw.created_at };
}

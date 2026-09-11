import { normalizeWhatsappCloneProfile, type WhatsappBehaviorConfig } from "./agent-behavior";
import { applyTextEmojiPreference, conversationStyleInstructions } from "./conversation-style";
import { normalizeOutboundLanguageText } from "./outbound-language";

export const followUpGenerationConfig = {
  temperature: 0.6,
  topP: 0.9,
  candidateCount: 1,
  maxOutputTokens: 1024,
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["send", "skip"] },
      message: { type: "string", description: "Mensagem final para o cliente, ou vazia quando não deve haver contato." },
    },
    required: ["action", "message"],
    additionalProperties: false,
  },
};

export type FollowUpValidation = {
  outcome: "send" | "skip" | "invalid";
  reason: string | null;
  text: string;
  finishReason: string | null;
  candidateCount: number;
  ignoredThoughtParts: number;
};

/** Token estimation only; never persist or deliver this unvalidated provider text. */
export function followUpGenerationMeteringText(value: unknown): string {
  const candidates = record(value).candidates;
  return (Array.isArray(candidates) ? candidates : []).flatMap(candidate => {
    const parts = record(record(candidate).content).parts;
    return (Array.isArray(parts) ? parts : []).map(part => typeof record(part).text === "string" ? record(part).text : "");
  }).join("\n");
}

/** Never turn reasoning, alternate candidates, truncated output or a JSON fragment into a customer message. */
export function validateFollowUpGeneration(value: unknown, behavior: Pick<WhatsappBehaviorConfig, "textEmojis">): FollowUpValidation {
  const root = record(value);
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const candidate = record(candidates[0]);
  const parts = Array.isArray(record(candidate.content).parts) ? record(candidate.content).parts as unknown[] : [];
  const result: FollowUpValidation = {
    outcome: "invalid", reason: null, text: "",
    finishReason: typeof candidate.finishReason === "string" ? candidate.finishReason.slice(0, 80) : null,
    candidateCount: candidates.length,
    ignoredThoughtParts: parts.filter(part => record(part).thought === true).length,
  };
  const invalid = (reason: string): FollowUpValidation => ({ ...result, reason });
  if (record(root.promptFeedback).blockReason) return invalid("generation_blocked");
  if (candidates.length !== 1) return invalid("generation_candidate_count");
  if (result.finishReason !== "STOP") return invalid(result.finishReason === "MAX_TOKENS" ? "generation_truncated" : "generation_not_completed");
  const finalParts = parts.map(record).filter(part => part.thought !== true);
  if (finalParts.some(part => part.functionCall || part.executableCode || part.codeExecutionResult)) return invalid("generation_unexpected_action");
  const rawText = finalParts.map(part => typeof part.text === "string" ? part.text : "").join("").trim();
  if (!rawText) return invalid("generation_empty");
  let data: Record<string, unknown>;
  try { data = record(JSON.parse(rawText)); } catch { return invalid("generation_invalid_format"); }
  if (typeof data.message !== "string" || !["send", "skip"].includes(String(data.action))
    || Object.keys(data).some(key => key !== "message" && key !== "action")) return invalid("generation_invalid_format");
  if (data.action === "skip") return data.message.trim() ? invalid("generation_invalid_format") : { ...result, outcome: "skip", reason: "no_relevant_approach" };
  const text = applyTextEmojiPreference(normalizeOutboundLanguageText(data.message), behavior).trim();
  const textError = validateFollowUpText(text);
  return textError ? invalid(textError) : { ...result, outcome: "send", text };
}

export function validateFollowUpText(text: string): string | null {
  const plain = applyTextEmojiPreference(text, { textEmojis: false });
  if (plain.length < 12 || !/\p{L}/u.test(plain)) return "generation_empty_or_fragment";
  if (text.length > 700) return "generation_too_long";
  if (/https?:\/\/|www\.|\bSEM_CONTATO\b|\{\{|\[\s*(nome|name|link|produto|cliente)\s*\]/i.test(text)) return "generation_unapproved_placeholder_or_link";
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/```|<\/?(?:think|analysis|system|assistant)\b|\b(?:without accents|sem acentos|system prompt|instrucoes internas|responda somente|chain.of.thought)\b|^\s*(?:analysis|reasoning|final answer|assistant|system|analise|raciocinio)\s*:|\b(?:i need to|we need to|the user|the lead)\b/.test(normalized)) return "generation_internal_text";
  if (!/[.!?…]["'”’)*_]*$/.test(plain) || /^[,;:}\]]/.test(plain)) return "generation_incomplete_message";
  return null;
}

export function buildFollowUpPersonalityLines(value: unknown, behavior: WhatsappBehaviorConfig) {
  const profile = normalizeWhatsappCloneProfile(record(value).whatsapp_clone_profile);
  const fields = [
    ["Assinatura", profile.displayName], ["Identidade", profile.roleIdentity], ["Tom", profile.tone],
    ["Vocabulário", profile.vocabulary], ["Ritmo", profile.responseRhythm], ["Abordagem", profile.salesStyle],
    ["Dúvidas", profile.objectionStyle], ["Próximo passo", profile.closingStyle], ["Emojis", profile.emojiStyle],
    ["Limites", profile.forbiddenPatterns], ["Notas", profile.notes],
  ];
  return [
    ...(profile.enabled ? ["Personalidade configurada do agente:", ...fields.filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value}`)] : []),
    ...conversationStyleInstructions(behavior),
  ];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

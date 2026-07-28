import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsageAgentScope, UsageBillingMode } from "@/lib/billing/cost-center";
import {
  estimateTokensFromText,
  extractGeminiUsageMetadata,
  meterUsageEvent,
  type GeminiTokenUsage,
  type MeteredUsageResult,
} from "@/lib/billing/metered-usage";

type JsonRecord = Record<string, unknown>;

export type MeterGeminiGenerationInput = {
  client: SupabaseClient;
  organizationId?: string | null;
  userId?: string | null;
  featureCode: string;
  modelId?: string | null;
  agentId?: string | null;
  agentRunId?: string | null;
  conversationId?: string | null;
  leadId?: string | null;
  agentScope?: UsageAgentScope;
  billingMode?: UsageBillingMode;
  promptText?: string | string[] | null;
  outputText?: string | string[] | null;
  responseData?: unknown;
  usage?: GeminiTokenUsage | null;
  media?: number;
  minutes?: number;
  megabytes?: number;
  messages?: number;
  quantity?: number;
  requestId?: string | null;
  debitDescription?: string;
  metadata?: JsonRecord;
};

export async function meterGeminiGenerationUsage(input: MeterGeminiGenerationInput): Promise<MeteredUsageResult> {
  const usage = input.usage ?? extractGeminiUsageMetadata(input.responseData);
  const promptText = joinText(input.promptText);
  const outputText = joinText(input.outputText);
  const inputTokens = usage?.inputTokens ?? estimateTokensFromText(promptText);
  const outputTokens = usage?.outputTokens ?? estimateTokensFromText(outputText);
  const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;

  return meterUsageEvent(input.client, {
    organizationId: input.organizationId ?? null,
    userId: input.userId ?? null,
    provider: "gemini",
    featureCode: input.featureCode,
    modelId: input.modelId ?? null,
    agentId: input.agentId ?? null,
    agentRunId: input.agentRunId ?? null,
    conversationId: input.conversationId ?? null,
    leadId: input.leadId ?? null,
    agentScope: input.agentScope,
    billingMode: input.billingMode,
    inputUnits: inputTokens,
    outputUnits: outputTokens,
    inputTokens,
    outputTokens,
    totalTokens,
    media: input.media,
    minutes: input.minutes,
    megabytes: input.megabytes,
    messages: input.messages,
    quantity: input.quantity,
    requestId: input.requestId ?? null,
    debitDescription: input.debitDescription ?? "Consumo Gemini ConnectyHub",
    metadata: {
      ...(input.metadata ?? {}),
      geminiUsage: usage ? serializeGeminiUsage(usage) : null,
      estimatedInputTokens: usage ? false : true,
      estimatedOutputTokens: usage ? false : true,
    },
  });
}

export function mediaAnalysisFeatureCode(kind: "image" | "video" | "document") {
  if (kind === "image") return "media_image_analysis";
  if (kind === "video") return "media_video_analysis";
  return "media_document_analysis";
}

function joinText(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join("\n");
  }

  return value ?? "";
}

function serializeGeminiUsage(usage: GeminiTokenUsage) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cachedTokens: usage.cachedTokens,
    thoughtsTokens: usage.thoughtsTokens,
    raw: usage.raw,
  };
}

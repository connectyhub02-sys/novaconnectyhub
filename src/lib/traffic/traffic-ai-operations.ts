import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TrafficManagerPlan,
  TrafficManagerPlatform,
  TrafficManagerRecommendation,
} from "@/lib/traffic/traffic-ai-manager";

type JsonRecord = Record<string, unknown>;

export type TrafficAiActionStatus = "suggested" | "queued" | "approved" | "in_progress" | "done" | "dismissed";

export type TrafficAiAnalysisHistoryItem = {
  id: string;
  platform: TrafficManagerPlatform;
  score: number;
  status: TrafficManagerPlan["status"];
  summary: string;
  nextAction: string;
  analysisText: string | null;
  createdAt: string;
};

export type TrafficAiActionItem = {
  id: string;
  platform: TrafficManagerPlatform;
  recommendationId: string;
  category: TrafficManagerRecommendation["category"];
  priority: TrafficManagerRecommendation["priority"];
  status: TrafficAiActionStatus;
  title: string;
  detail: string;
  action: string;
  impact: string;
  metricLabel: string;
  metricValue: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type TrafficAiAnalysisRow = {
  id: string;
  platform: string | null;
  score: number | string | null;
  status: string | null;
  summary: string | null;
  next_action: string | null;
  analysis_text: string | null;
  created_at: string | null;
};

type TrafficAiActionRow = {
  id: string;
  platform: string | null;
  recommendation_id: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  title: string | null;
  detail: string | null;
  action: string | null;
  impact: string | null;
  metric_label: string | null;
  metric_value: string | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
};

export async function listTrafficAiOperations(input: {
  client: SupabaseClient;
  organizationId: string;
  platform?: TrafficManagerPlatform | null;
}) {
  try {
    let analysesQuery = input.client
      .from("traffic_ai_analyses")
      .select("id, platform, score, status, summary, next_action, analysis_text, created_at")
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(8);
    let actionsQuery = input.client
      .from("traffic_ai_action_items")
      .select("id, platform, recommendation_id, category, priority, status, title, detail, action, impact, metric_label, metric_value, created_at, updated_at, completed_at")
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(12);

    if (input.platform) {
      analysesQuery = analysesQuery.eq("platform", input.platform);
      actionsQuery = actionsQuery.eq("platform", input.platform);
    }

    const [analysesResult, actionsResult] = await Promise.all([analysesQuery, actionsQuery]);
    const firstError = analysesResult.error ?? actionsResult.error;

    if (firstError) {
      if (isTrafficAiSchemaMissing(firstError)) {
        return {
          ready: false,
          message: "Migration 0046 pendente: historico e fila do Gestor IA ainda nao existem no banco.",
          analyses: [] as TrafficAiAnalysisHistoryItem[],
          actionItems: [] as TrafficAiActionItem[],
        };
      }

      throw new Error(firstError.message);
    }

    return {
      ready: true,
      message: null,
      analyses: ((analysesResult.data ?? []) as TrafficAiAnalysisRow[]).map(mapAnalysisRow),
      actionItems: ((actionsResult.data ?? []) as TrafficAiActionRow[]).map(mapActionRow),
    };
  } catch (error) {
    return {
      ready: false,
      message: error instanceof Error ? error.message : "Nao foi possivel carregar operacoes do Gestor IA.",
      analyses: [] as TrafficAiAnalysisHistoryItem[],
      actionItems: [] as TrafficAiActionItem[],
    };
  }
}

export async function saveTrafficAiAnalysis(input: {
  client: SupabaseClient;
  organizationId: string;
  platform: TrafficManagerPlatform;
  plan: TrafficManagerPlan;
  analysisText: string;
  usageEventId?: string | null;
  userId?: string | null;
}) {
  const payload = {
    organization_id: input.organizationId,
    platform: input.platform,
    score: input.plan.score,
    status: input.plan.status,
    summary: input.plan.summary,
    next_action: input.plan.nextAction,
    analysis_text: input.analysisText,
    plan_snapshot: serializePlan(input.plan),
    usage_event_id: input.usageEventId ?? null,
    created_by: input.userId ?? null,
  };
  const { data, error } = await input.client
    .from("traffic_ai_analyses")
    .insert(payload)
    .select("id, platform, score, status, summary, next_action, analysis_text, created_at")
    .single<TrafficAiAnalysisRow>();

  if (error) {
    if (isTrafficAiSchemaMissing(error)) {
      return null;
    }

    throw new Error(`Nao foi possivel salvar historico do Gestor IA: ${error.message}`);
  }

  return mapAnalysisRow(data);
}

export async function createTrafficAiActionItem(input: {
  client: SupabaseClient;
  organizationId: string;
  platform: TrafficManagerPlatform;
  recommendation: TrafficManagerRecommendation;
  userId?: string | null;
}) {
  const existing = await findExistingOpenAction(input);

  if (existing) {
    return existing;
  }

  const { data, error } = await input.client
    .from("traffic_ai_action_items")
    .insert({
      organization_id: input.organizationId,
      platform: input.platform,
      recommendation_id: input.recommendation.id,
      category: input.recommendation.category,
      priority: input.recommendation.priority,
      status: "queued",
      title: input.recommendation.title,
      detail: input.recommendation.detail,
      action: input.recommendation.action,
      impact: input.recommendation.impact,
      metric_label: input.recommendation.metricLabel,
      metric_value: input.recommendation.metricValue,
      metadata: {
        source: "traffic_ai_manager",
        recommendation: input.recommendation,
      },
      created_by: input.userId ?? null,
    })
    .select("id, platform, recommendation_id, category, priority, status, title, detail, action, impact, metric_label, metric_value, created_at, updated_at, completed_at")
    .single<TrafficAiActionRow>();

  if (error) {
    if (isTrafficAiSchemaMissing(error)) {
      throw new Error("Migration 0046 pendente: aplique a migration para usar a fila de acoes.");
    }

    throw new Error(`Nao foi possivel criar acao do Gestor IA: ${error.message}`);
  }

  return mapActionRow(data);
}

export async function updateTrafficAiActionStatus(input: {
  actionItemId: string;
  client: SupabaseClient;
  organizationId: string;
  status: TrafficAiActionStatus;
}) {
  const { data, error } = await input.client
    .from("traffic_ai_action_items")
    .update({
      status: input.status,
      completed_at: input.status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", input.actionItemId)
    .eq("organization_id", input.organizationId)
    .select("id, platform, recommendation_id, category, priority, status, title, detail, action, impact, metric_label, metric_value, created_at, updated_at, completed_at")
    .maybeSingle<TrafficAiActionRow>();

  if (error) {
    if (isTrafficAiSchemaMissing(error)) {
      throw new Error("Migration 0046 pendente: aplique a migration para usar a fila de acoes.");
    }

    throw new Error(`Nao foi possivel atualizar acao do Gestor IA: ${error.message}`);
  }

  if (!data) {
    throw new Error("Acao nao encontrada para esta empresa.");
  }

  return mapActionRow(data);
}

async function findExistingOpenAction(input: {
  client: SupabaseClient;
  organizationId: string;
  platform: TrafficManagerPlatform;
  recommendation: TrafficManagerRecommendation;
}) {
  const { data, error } = await input.client
    .from("traffic_ai_action_items")
    .select("id, platform, recommendation_id, category, priority, status, title, detail, action, impact, metric_label, metric_value, created_at, updated_at, completed_at")
    .eq("organization_id", input.organizationId)
    .eq("platform", input.platform)
    .eq("recommendation_id", input.recommendation.id)
    .in("status", ["queued", "approved", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<TrafficAiActionRow>();

  if (error) {
    if (isTrafficAiSchemaMissing(error)) {
      throw new Error("Migration 0046 pendente: aplique a migration para usar a fila de acoes.");
    }

    throw new Error(`Nao foi possivel verificar fila do Gestor IA: ${error.message}`);
  }

  return data ? mapActionRow(data) : null;
}

function mapAnalysisRow(row: TrafficAiAnalysisRow): TrafficAiAnalysisHistoryItem {
  return {
    id: row.id,
    platform: normalizePlatform(row.platform),
    score: readNumber(row.score),
    status: normalizePlanStatus(row.status),
    summary: row.summary ?? "",
    nextAction: row.next_action ?? "",
    analysisText: row.analysis_text ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapActionRow(row: TrafficAiActionRow): TrafficAiActionItem {
  return {
    id: row.id,
    platform: normalizePlatform(row.platform),
    recommendationId: row.recommendation_id ?? "",
    category: normalizeCategory(row.category),
    priority: normalizePriority(row.priority),
    status: normalizeActionStatus(row.status),
    title: row.title ?? "Acao de trafego",
    detail: row.detail ?? "",
    action: row.action ?? "",
    impact: row.impact ?? "",
    metricLabel: row.metric_label ?? "",
    metricValue: row.metric_value ?? "",
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    completedAt: row.completed_at ?? null,
  };
}

function serializePlan(plan: TrafficManagerPlan): JsonRecord {
  return JSON.parse(JSON.stringify(plan)) as JsonRecord;
}

function isTrafficAiSchemaMissing(error: { code?: string; message?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("traffic_ai_analyses")
    || text.includes("traffic_ai_action_items")
    || text.includes("relation")
    || text.includes("schema cache")
    || text.includes("42p01")
    || text.includes("pgrst205");
}

function normalizePlatform(value: string | null): TrafficManagerPlatform {
  return value === "google" ? "google" : "meta";
}

function normalizePlanStatus(value: string | null): TrafficManagerPlan["status"] {
  if (value === "critical" || value === "attention" || value === "stable" || value === "growth") {
    return value;
  }

  return "stable";
}

function normalizePriority(value: string | null): TrafficManagerRecommendation["priority"] {
  if (value === "critical" || value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return "medium";
}

function normalizeCategory(value: string | null): TrafficManagerRecommendation["category"] {
  if (
    value === "tracking"
    || value === "creative"
    || value === "budget"
    || value === "conversion"
    || value === "organic"
    || value === "sync"
  ) {
    return value;
  }

  return "budget";
}

function normalizeActionStatus(value: string | null): TrafficAiActionStatus {
  if (
    value === "suggested"
    || value === "queued"
    || value === "approved"
    || value === "in_progress"
    || value === "done"
    || value === "dismissed"
  ) {
    return value;
  }

  return "queued";
}

function readNumber(value: number | string | null) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

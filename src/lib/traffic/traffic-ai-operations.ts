import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TrafficManagerPlan,
  TrafficManagerPlatform,
  TrafficManagerRecommendation,
} from "@/lib/traffic/traffic-ai-manager";

type JsonRecord = Record<string, unknown>;

export type TrafficAiActionStatus = "suggested" | "queued" | "approved" | "in_progress" | "done" | "dismissed";
export type TrafficAiExecutionDraftStatus = "drafted" | "approved" | "applied" | "cancelled" | "failed";
export type TrafficAiExecutionType =
  | "sync_request"
  | "tracking_checklist"
  | "budget_adjustment"
  | "creative_test"
  | "conversion_audit"
  | "organic_boost";

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

export type TrafficAiExecutionDraft = {
  id: string;
  actionItemId: string;
  platform: TrafficManagerPlatform;
  executionType: TrafficAiExecutionType;
  status: TrafficAiExecutionDraftStatus;
  riskLevel: "low" | "medium" | "high";
  title: string;
  objective: string;
  steps: string[];
  proposedPayload: JsonRecord;
  rollbackPlan: string;
  providerNotes: string;
  humanApprovalRequired: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  appliedAt: string | null;
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

type TrafficAiExecutionDraftRow = {
  id: string;
  action_item_id: string | null;
  platform: string | null;
  execution_type: string | null;
  status: string | null;
  risk_level: string | null;
  title: string | null;
  objective: string | null;
  steps: unknown;
  proposed_payload: JsonRecord | null;
  rollback_plan: string | null;
  provider_notes: string | null;
  human_approval_required: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  approved_at: string | null;
  applied_at: string | null;
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
    let draftsQuery = input.client
      .from("traffic_ai_execution_drafts")
      .select("id, action_item_id, platform, execution_type, status, risk_level, title, objective, steps, proposed_payload, rollback_plan, provider_notes, human_approval_required, created_at, updated_at, approved_at, applied_at")
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (input.platform) {
      analysesQuery = analysesQuery.eq("platform", input.platform);
      actionsQuery = actionsQuery.eq("platform", input.platform);
      draftsQuery = draftsQuery.eq("platform", input.platform);
    }

    const [analysesResult, actionsResult, draftsResult] = await Promise.all([analysesQuery, actionsQuery, draftsQuery]);
    const firstError = analysesResult.error ?? actionsResult.error;

    if (firstError) {
      if (isTrafficAiSchemaMissing(firstError)) {
        return {
          ready: false,
          message: "Migration 0046 pendente: historico e fila do Gestor IA ainda nao existem no banco.",
          analyses: [] as TrafficAiAnalysisHistoryItem[],
          actionItems: [] as TrafficAiActionItem[],
          executionReady: false,
          executionMessage: "Migration 0047 pendente: rascunhos de execucao ainda nao existem no banco.",
          executionDrafts: [] as TrafficAiExecutionDraft[],
        };
      }

      throw new Error(firstError.message);
    }

    return {
      ready: true,
      message: null,
      analyses: ((analysesResult.data ?? []) as TrafficAiAnalysisRow[]).map(mapAnalysisRow),
      actionItems: ((actionsResult.data ?? []) as TrafficAiActionRow[]).map(mapActionRow),
      executionReady: !draftsResult.error || !isTrafficAiExecutionSchemaMissing(draftsResult.error),
      executionMessage: draftsResult.error && isTrafficAiExecutionSchemaMissing(draftsResult.error)
        ? "Migration 0047 pendente: rascunhos de execucao assistida ainda nao existem no banco."
        : draftsResult.error?.message ?? null,
      executionDrafts: draftsResult.error ? [] : ((draftsResult.data ?? []) as TrafficAiExecutionDraftRow[]).map(mapExecutionDraftRow),
    };
  } catch (error) {
    return {
      ready: false,
      message: error instanceof Error ? error.message : "Nao foi possivel carregar operacoes do Gestor IA.",
      analyses: [] as TrafficAiAnalysisHistoryItem[],
      actionItems: [] as TrafficAiActionItem[],
      executionReady: false,
      executionMessage: error instanceof Error ? error.message : "Nao foi possivel carregar rascunhos de execucao.",
      executionDrafts: [] as TrafficAiExecutionDraft[],
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

export async function prepareTrafficAiExecutionDraft(input: {
  actionItemId: string;
  client: SupabaseClient;
  organizationId: string;
  userId?: string | null;
}) {
  const actionItem = await loadTrafficAiActionItem({
    actionItemId: input.actionItemId,
    client: input.client,
    organizationId: input.organizationId,
  });
  const existing = await findExistingExecutionDraft({
    actionItemId: input.actionItemId,
    client: input.client,
    organizationId: input.organizationId,
  });

  if (existing) {
    return existing;
  }

  const blueprint = buildExecutionBlueprint(actionItem);
  const { data, error } = await input.client
    .from("traffic_ai_execution_drafts")
    .insert({
      organization_id: input.organizationId,
      action_item_id: actionItem.id,
      platform: actionItem.platform,
      execution_type: blueprint.executionType,
      status: "drafted",
      risk_level: blueprint.riskLevel,
      title: blueprint.title,
      objective: blueprint.objective,
      steps: blueprint.steps,
      proposed_payload: blueprint.proposedPayload,
      rollback_plan: blueprint.rollbackPlan,
      provider_notes: blueprint.providerNotes,
      human_approval_required: true,
      created_by: input.userId ?? null,
    })
    .select("id, action_item_id, platform, execution_type, status, risk_level, title, objective, steps, proposed_payload, rollback_plan, provider_notes, human_approval_required, created_at, updated_at, approved_at, applied_at")
    .single<TrafficAiExecutionDraftRow>();

  if (error) {
    if (isTrafficAiExecutionSchemaMissing(error)) {
      throw new Error("Migration 0047 pendente: aplique a migration para preparar execucoes assistidas.");
    }

    throw new Error(`Nao foi possivel preparar execucao assistida: ${error.message}`);
  }

  await input.client
    .from("traffic_ai_action_items")
    .update({ status: "in_progress" })
    .eq("id", actionItem.id)
    .eq("organization_id", input.organizationId)
    .in("status", ["queued", "approved"]);

  return mapExecutionDraftRow(data);
}

export async function updateTrafficAiExecutionDraftStatus(input: {
  client: SupabaseClient;
  draftId: string;
  organizationId: string;
  status: TrafficAiExecutionDraftStatus;
  userId?: string | null;
}) {
  const updates: Record<string, unknown> = { status: input.status };
  const now = new Date().toISOString();

  if (input.status === "approved") {
    updates.approved_at = now;
    updates.approved_by = input.userId ?? null;
  }

  if (input.status === "applied") {
    updates.applied_at = now;
    updates.applied_by = input.userId ?? null;
  }

  const { data, error } = await input.client
    .from("traffic_ai_execution_drafts")
    .update(updates)
    .eq("id", input.draftId)
    .eq("organization_id", input.organizationId)
    .select("id, action_item_id, platform, execution_type, status, risk_level, title, objective, steps, proposed_payload, rollback_plan, provider_notes, human_approval_required, created_at, updated_at, approved_at, applied_at")
    .maybeSingle<TrafficAiExecutionDraftRow>();

  if (error) {
    if (isTrafficAiExecutionSchemaMissing(error)) {
      throw new Error("Migration 0047 pendente: aplique a migration para atualizar execucoes assistidas.");
    }

    throw new Error(`Nao foi possivel atualizar rascunho de execucao: ${error.message}`);
  }

  if (!data) {
    throw new Error("Rascunho de execucao nao encontrado para esta empresa.");
  }

  if (input.status === "applied") {
    await input.client
      .from("traffic_ai_action_items")
      .update({
        completed_at: now,
        status: "done",
      })
      .eq("id", data.action_item_id)
      .eq("organization_id", input.organizationId);
  }

  if (input.status === "cancelled") {
    await input.client
      .from("traffic_ai_action_items")
      .update({ status: "dismissed" })
      .eq("id", data.action_item_id)
      .eq("organization_id", input.organizationId);
  }

  return mapExecutionDraftRow(data);
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

async function loadTrafficAiActionItem(input: {
  actionItemId: string;
  client: SupabaseClient;
  organizationId: string;
}) {
  const { data, error } = await input.client
    .from("traffic_ai_action_items")
    .select("id, platform, recommendation_id, category, priority, status, title, detail, action, impact, metric_label, metric_value, created_at, updated_at, completed_at")
    .eq("id", input.actionItemId)
    .eq("organization_id", input.organizationId)
    .maybeSingle<TrafficAiActionRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar acao do Gestor IA: ${error.message}`);
  }

  if (!data) {
    throw new Error("Acao nao encontrada para esta empresa.");
  }

  return mapActionRow(data);
}

async function findExistingExecutionDraft(input: {
  actionItemId: string;
  client: SupabaseClient;
  organizationId: string;
}) {
  const { data, error } = await input.client
    .from("traffic_ai_execution_drafts")
    .select("id, action_item_id, platform, execution_type, status, risk_level, title, objective, steps, proposed_payload, rollback_plan, provider_notes, human_approval_required, created_at, updated_at, approved_at, applied_at")
    .eq("organization_id", input.organizationId)
    .eq("action_item_id", input.actionItemId)
    .in("status", ["drafted", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<TrafficAiExecutionDraftRow>();

  if (error) {
    if (isTrafficAiExecutionSchemaMissing(error)) {
      throw new Error("Migration 0047 pendente: aplique a migration para preparar execucoes assistidas.");
    }

    throw new Error(`Nao foi possivel verificar rascunhos existentes: ${error.message}`);
  }

  return data ? mapExecutionDraftRow(data) : null;
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

function mapExecutionDraftRow(row: TrafficAiExecutionDraftRow): TrafficAiExecutionDraft {
  return {
    id: row.id,
    actionItemId: row.action_item_id ?? "",
    platform: normalizePlatform(row.platform),
    executionType: normalizeExecutionType(row.execution_type),
    status: normalizeExecutionStatus(row.status),
    riskLevel: normalizeRiskLevel(row.risk_level),
    title: row.title ?? "Rascunho de execucao",
    objective: row.objective ?? "",
    steps: readStringArray(row.steps),
    proposedPayload: row.proposed_payload ?? {},
    rollbackPlan: row.rollback_plan ?? "",
    providerNotes: row.provider_notes ?? "",
    humanApprovalRequired: row.human_approval_required !== false,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    approvedAt: row.approved_at ?? null,
    appliedAt: row.applied_at ?? null,
  };
}

function buildExecutionBlueprint(actionItem: TrafficAiActionItem): {
  executionType: TrafficAiExecutionType;
  objective: string;
  proposedPayload: JsonRecord;
  providerNotes: string;
  riskLevel: "low" | "medium" | "high";
  rollbackPlan: string;
  steps: string[];
  title: string;
} {
  const platformLabel = actionItem.platform === "meta" ? "Meta Ads" : "Google Ads";
  const basePayload = {
    action_item_id: actionItem.id,
    category: actionItem.category,
    metric: {
      label: actionItem.metricLabel,
      value: actionItem.metricValue,
    },
    platform: actionItem.platform,
    recommendation_id: actionItem.recommendationId,
    source_action: actionItem.action,
  };

  if (actionItem.category === "sync") {
    return {
      executionType: "sync_request",
      objective: `Revalidar conexao e atualizar snapshots de ${platformLabel}.`,
      proposedPayload: {
        ...basePayload,
        operation: "sync_connected_assets_and_metrics",
      },
      providerNotes: "Usa apenas leitura de contas conectadas; nao altera campanha.",
      riskLevel: "low",
      rollbackPlan: "Nenhum rollback necessario; se a leitura falhar, manter dados anteriores e revisar credenciais.",
      steps: [
        "Validar se a integracao continua conectada.",
        "Sincronizar assets selecionados e snapshots recentes.",
        "Recarregar dashboard e conferir se o status saiu de offline/pendente.",
      ],
      title: `Sincronizar leitura ${platformLabel}`,
    };
  }

  if (actionItem.category === "tracking") {
    return {
      executionType: "tracking_checklist",
      objective: `Preparar checklist de rastreamento e atribuicao para ${platformLabel}.`,
      proposedPayload: {
        ...basePayload,
        operation: "tracking_audit",
        checks: ["account_selected", "conversion_tag_or_pixel", "utm_capture", "lead_database_match"],
      },
      providerNotes: "Checklist assistido; nenhuma tag sera publicada automaticamente nesta etapa.",
      riskLevel: "low",
      rollbackPlan: "Manter configuracao atual e apenas registrar pendencias encontradas.",
      steps: [
        "Conferir conta selecionada nas integracoes.",
        "Validar tag, pixel ou evento de conversao.",
        "Comparar conversoes da plataforma com leads internos.",
        "Gerar lista de pendencias para correcao manual.",
      ],
      title: `Auditar rastreamento ${platformLabel}`,
    };
  }

  if (actionItem.category === "creative") {
    return {
      executionType: "creative_test",
      objective: "Preparar teste de criativo sem pausar campanha vencedora.",
      proposedPayload: {
        ...basePayload,
        operation: "create_creative_test_brief",
        variants: [
          "gancho direto com dor principal",
          "prova/resultado do cliente",
          "oferta com chamada para conversa",
        ],
      },
      providerNotes: "Cria briefing e estrutura de teste; upload/publicacao depende de aprovacao humana.",
      riskLevel: "medium",
      rollbackPlan: "Pausar somente a variacao nova se CTR ou conversao piorar na janela de teste.",
      steps: [
        "Manter campanha atual ativa.",
        "Preparar tres variacoes de gancho.",
        "Definir janela minima de leitura.",
        "Aprovar criativo antes de publicar.",
      ],
      title: "Preparar teste de criativo",
    };
  }

  if (actionItem.category === "conversion") {
    return {
      executionType: "conversion_audit",
      objective: "Reduzir perda entre clique, conversao reportada e lead interno.",
      proposedPayload: {
        ...basePayload,
        operation: "conversion_path_audit",
        checks: ["landing_page", "checkout_or_form", "crm_capture", "event_mapping"],
      },
      providerNotes: "Auditoria operacional; mudancas de campanha ficam bloqueadas ate conclusao do diagnostico.",
      riskLevel: "medium",
      rollbackPlan: "Nao altera campanha; documentar resultado e manter eventos antigos ate validar novos.",
      steps: [
        "Checar destino dos anuncios.",
        "Validar formulario, checkout ou conversa de destino.",
        "Comparar eventos da plataforma com leads internos.",
        "Definir correcao prioritaria antes de escalar verba.",
      ],
      title: "Auditar caminho de conversao",
    };
  }

  if (actionItem.category === "organic") {
    return {
      executionType: "organic_boost",
      objective: "Transformar sinal organico em teste pago controlado.",
      proposedPayload: {
        ...basePayload,
        operation: "boost_organic_signal",
        budget_guardrail: "usar verba pequena de teste antes de escala",
      },
      providerNotes: "Preparacao de impulsionamento ou campanha derivada; aplicacao exige aprovacao.",
      riskLevel: "medium",
      rollbackPlan: "Desativar teste se o custo por clique/conversao ficar acima do alvo inicial.",
      steps: [
        "Identificar post ou tema organico com maior engajamento.",
        "Criar briefing de anuncio derivado.",
        "Definir verba pequena de validacao.",
        "Aprovar antes de publicar no provedor.",
      ],
      title: "Preparar teste pago a partir do organico",
    };
  }

  return {
    executionType: "budget_adjustment",
    objective: "Preparar ajuste de verba com limite de risco e aprovacao humana.",
    proposedPayload: {
      ...basePayload,
      operation: "budget_reallocation_draft",
      guardrails: {
        max_budget_shift_percent: 15,
        requires_human_approval: true,
      },
    },
    providerNotes: "Nao aplica mudanca direta no provedor; cria somente rascunho de realocacao.",
    riskLevel: actionItem.priority === "critical" || actionItem.priority === "high" ? "high" : "medium",
    rollbackPlan: "Voltar verba ao valor anterior se CPA, CTR ou conversao piorarem apos a janela de validacao.",
    steps: [
      "Identificar campanha vencedora e campanha em risco.",
      "Definir realocacao maxima de 10% a 15%.",
      "Revisar impacto estimado e aprovar manualmente.",
      "Acompanhar janela de validacao antes de novo ajuste.",
    ],
    title: "Preparar ajuste de verba",
  };
}

function serializePlan(plan: TrafficManagerPlan): JsonRecord {
  return JSON.parse(JSON.stringify(plan)) as JsonRecord;
}

function isTrafficAiSchemaMissing(error: { code?: string; message?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("traffic_ai_analyses")
    || text.includes("traffic_ai_action_items")
    || text.includes("traffic_ai_execution_drafts")
    || text.includes("relation")
    || text.includes("schema cache")
    || text.includes("42p01")
    || text.includes("pgrst205");
}

function isTrafficAiExecutionSchemaMissing(error: { code?: string; message?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("traffic_ai_execution_drafts")
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

function normalizeExecutionStatus(value: string | null): TrafficAiExecutionDraftStatus {
  if (value === "drafted" || value === "approved" || value === "applied" || value === "cancelled" || value === "failed") {
    return value;
  }

  return "drafted";
}

function normalizeExecutionType(value: string | null): TrafficAiExecutionType {
  if (
    value === "sync_request"
    || value === "tracking_checklist"
    || value === "budget_adjustment"
    || value === "creative_test"
    || value === "conversion_audit"
    || value === "organic_boost"
  ) {
    return value;
  }

  return "budget_adjustment";
}

function normalizeRiskLevel(value: string | null): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readNumber(value: number | string | null) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

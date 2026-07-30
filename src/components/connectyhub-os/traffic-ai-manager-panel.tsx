"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  ListChecks,
  Loader2,
  RefreshCcw,
  Send,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import type { Tone } from "@/lib/connectyhub-os-data";
import type {
  TrafficManagerPlan,
  TrafficManagerPlatform,
  TrafficManagerPriority,
  TrafficManagerRecommendation,
  TrafficManagerStatus,
} from "@/lib/traffic/traffic-ai-manager";
import type {
  TrafficAiActionItem,
  TrafficAiActionStatus,
  TrafficAiAnalysisHistoryItem,
} from "@/lib/traffic/traffic-ai-operations";
import { cn } from "@/lib/utils";
import { NeonBadge, toneClass } from "./panel-primitives";

type TrafficAiAnalysisResponse = {
  analysis?: {
    text: string;
    generatedAt: string;
    usage?: {
      chargeCredits: number;
      debited: boolean;
    };
  };
  error?: string;
};

type TrafficAiOperationsPayload = {
  ready?: boolean;
  message?: string | null;
  analyses?: TrafficAiAnalysisHistoryItem[];
  actionItems?: TrafficAiActionItem[];
};

type TrafficAiOperationsResponse = TrafficAiOperationsPayload & {
  operations?: TrafficAiOperationsPayload;
  notice?: {
    tone?: string;
    message?: string;
  };
  error?: string;
};

export function TrafficAiManagerPanel({
  organizationId,
  plan,
  platform,
  tone,
}: {
  organizationId?: string | null;
  plan: TrafficManagerPlan;
  platform: TrafficManagerPlatform;
  tone: Tone;
}) {
  const [loading, setLoading] = useState(false);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: Tone; message: string } | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [operationsReady, setOperationsReady] = useState(true);
  const [operationsMessage, setOperationsMessage] = useState<string | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<TrafficAiAnalysisHistoryItem[]>([]);
  const [actionItems, setActionItems] = useState<TrafficAiActionItem[]>([]);
  const queuedRecommendationIds = useMemo(() => new Set(
    actionItems
      .filter((item) => !["done", "dismissed"].includes(item.status))
      .map((item) => item.recommendationId),
  ), [actionItems]);

  const applyOperations = useCallback((body: TrafficAiOperationsPayload) => {
    setOperationsReady(body.ready !== false);
    setOperationsMessage(body.message ?? null);
    setAnalysisHistory(body.analyses ?? []);
    setActionItems(body.actionItems ?? []);
  }, []);

  const refreshOperations = useCallback(async () => {
    if (!organizationId) return;

    await Promise.resolve();
    setOperationsLoading(true);

    try {
      const params = new URLSearchParams({
        companyId: organizationId,
        platform,
      });
      const response = await fetch(`/api/dashboard/traffic/actions?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => null) as TrafficAiOperationsResponse | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Nao foi possivel carregar a fila do Gestor IA.");
      }

      applyOperations(body ?? {});
    } catch (error) {
      setOperationsReady(false);
      setOperationsMessage(error instanceof Error ? error.message : "Fila do Gestor IA indisponivel.");
    } finally {
      setOperationsLoading(false);
    }
  }, [applyOperations, organizationId, platform]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshOperations();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshOperations]);

  async function runAnalysis() {
    if (!organizationId || loading) return;

    setNotice(null);
    setLoading(true);

    try {
      const response = await fetch("/api/dashboard/traffic/ai-analysis", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId: organizationId,
          platform,
        }),
      });
      const body = await response.json().catch(() => null) as TrafficAiAnalysisResponse | null;

      if (!response.ok || !body?.analysis?.text) {
        throw new Error(body?.error ?? "Nao foi possivel gerar a analise agora.");
      }

      setAnalysisText(body.analysis.text);
      setGeneratedAt(body.analysis.generatedAt);
      setNotice({
        tone: "green",
        message: body.analysis.usage?.debited
          ? `Analise gerada e ${formatCredits(body.analysis.usage.chargeCredits)} credito(s) registrados.`
          : "Analise gerada.",
      });
      await refreshOperations();
    } catch (error) {
      setNotice({
        tone: "rose",
        message: error instanceof Error ? error.message : "Falha ao gerar analise.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function queueRecommendation(recommendation: TrafficManagerRecommendation) {
    if (!organizationId) return;

    setActionBusyId(recommendation.id);

    try {
      const response = await fetch("/api/dashboard/traffic/actions", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId: organizationId,
          platform,
          recommendation,
        }),
      });
      const body = await response.json().catch(() => null) as TrafficAiOperationsResponse | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Nao foi possivel enviar a acao para fila.");
      }

      applyOperations(body?.operations ?? body ?? {});
      setNotice({
        tone: "green",
        message: body?.notice?.message ?? "Acao enviada para a fila.",
      });
    } catch (error) {
      setNotice({
        tone: "rose",
        message: error instanceof Error ? error.message : "Falha ao criar acao.",
      });
    } finally {
      setActionBusyId(null);
    }
  }

  async function updateActionStatus(actionItemId: string, status: TrafficAiActionStatus) {
    if (!organizationId) return;

    setActionBusyId(actionItemId);

    try {
      const response = await fetch("/api/dashboard/traffic/actions", {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actionItemId,
          companyId: organizationId,
          platform,
          status,
        }),
      });
      const body = await response.json().catch(() => null) as TrafficAiOperationsResponse | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Nao foi possivel atualizar a acao.");
      }

      applyOperations(body?.operations ?? body ?? {});
      setNotice({
        tone: "green",
        message: body?.notice?.message ?? "Acao atualizada.",
      });
    } catch (error) {
      setNotice({
        tone: "rose",
        message: error instanceof Error ? error.message : "Falha ao atualizar acao.",
      });
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.86fr)_minmax(300px,0.64fr)]">
        <div className="min-w-0 rounded-xl p-4" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <BrainCircuit className={cn("h-4 w-4 shrink-0", toneClass(tone).text)} />
                <p className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">prioridade atual</p>
              </div>
              <p className="mt-2 text-[18px] font-semibold leading-tight text-white">{plan.summary}</p>
              <p className="mt-2 text-[12px] leading-5 text-slate-500">{plan.nextAction}</p>
            </div>
            <div className="shrink-0">
              <NeonBadge tone={statusTone(plan.status)}>{plan.statusLabel}</NeonBadge>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {plan.diagnostics.map((item) => (
              <DiagnosticTile key={item.label} label={item.label} value={item.value} detail={item.detail} tone={tone} />
            ))}
          </div>
        </div>

        <div className="grid gap-3 rounded-xl p-4" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">analise generativa</p>
              <p className="mt-1 text-[13px] font-semibold text-white">{generatedAt ? formatDateTime(generatedAt) : "Sob demanda"}</p>
            </div>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={!organizationId || loading}
              title={organizationId ? "Gera analise textual com IA e registra consumo de creditos." : "Disponivel no painel do cliente."}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
                toneClass("violet").border,
                toneClass("violet").bg,
                toneClass("violet").text,
              )}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span>{loading ? "Gerando" : "Analisar com IA"}</span>
            </button>
          </div>

          {notice ? (
            <div className={cn(
              "rounded-xl border px-3 py-2 text-[11px] leading-4",
              toneClass(notice.tone).border,
              toneClass(notice.tone).bg,
              toneClass(notice.tone).text,
            )}>
              {notice.message}
            </div>
          ) : null}

          {analysisText ? (
            <div className="max-h-56 overflow-y-auto whitespace-pre-line rounded-xl px-3 py-3 text-[12px] leading-5 text-slate-200" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
              {analysisText}
            </div>
          ) : (
            <div className="rounded-xl px-3 py-3 text-[12px] leading-5 text-slate-500" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
              Score {plan.score}/100. {plan.recommendations[0]?.title ?? "Operacao aguardando dados suficientes."}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-2">
          {plan.recommendations.map((recommendation) => (
            <RecommendationRow
              key={recommendation.id}
              busy={actionBusyId === recommendation.id}
              queued={queuedRecommendationIds.has(recommendation.id)}
              recommendation={recommendation}
              onQueue={() => queueRecommendation(recommendation)}
            />
          ))}
        </div>

        <div className="grid content-start gap-2 rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
          <div className="mb-1 flex items-center gap-2">
            <Target className={cn("h-4 w-4", toneClass("amber").text)} />
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">foco de verba</p>
          </div>
          {plan.budgetFocus.map((item) => (
            <div key={`${item.label}-${item.value}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[11px]" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
              <span className="min-w-0 truncate text-slate-300">{item.label}</span>
              <span className="shrink-0 font-mono font-semibold text-amber-300">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <ActionQueuePanel
          actionItems={actionItems}
          busyId={actionBusyId}
          loading={operationsLoading}
          ready={operationsReady}
          schemaMessage={operationsMessage}
          onRefresh={refreshOperations}
          onStatusChange={updateActionStatus}
        />
        <AnalysisHistoryPanel
          analyses={analysisHistory}
          loading={operationsLoading}
          ready={operationsReady}
          schemaMessage={operationsMessage}
        />
      </div>
    </div>
  );
}

function DiagnosticTile({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: Tone;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg px-3 py-2" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <p className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={cn("mt-1 truncate font-mono text-[18px] font-bold", toneClass(tone).text)}>{value}</p>
      <p className="mt-1 truncate text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}

function RecommendationRow({
  busy,
  onQueue,
  queued,
  recommendation,
}: {
  busy: boolean;
  onQueue: () => void;
  queued: boolean;
  recommendation: TrafficManagerRecommendation;
}) {
  const tone = priorityTone(recommendation.priority);

  return (
    <div className="min-w-0 rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {recommendation.priority === "critical" ? (
              <AlertTriangle className={cn("h-4 w-4 shrink-0", toneClass(tone).text)} />
            ) : recommendation.priority === "high" ? (
              <Zap className={cn("h-4 w-4 shrink-0", toneClass(tone).text)} />
            ) : (
              <CheckCircle2 className={cn("h-4 w-4 shrink-0", toneClass(tone).text)} />
            )}
            <p className="truncate text-[13px] font-semibold text-white">{recommendation.title}</p>
            <NeonBadge tone={tone}>{priorityLabel(recommendation.priority)}</NeonBadge>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-slate-500">{recommendation.detail}</p>
          <p className="mt-2 text-[12px] leading-5 text-slate-300">{recommendation.action}</p>
        </div>
        <div className="grid shrink-0 gap-1 rounded-lg px-3 py-2 md:w-32" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
          <p className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">{recommendation.metricLabel}</p>
          <p className={cn("truncate font-mono text-[16px] font-bold", toneClass(tone).text)}>{recommendation.metricValue}</p>
          <p className="truncate text-[10px] text-slate-500">{recommendation.impact}</p>
          <button
            type="button"
            onClick={onQueue}
            disabled={queued || busy}
            className={cn(
              "mt-1 inline-flex h-7 items-center justify-center gap-1 rounded-lg border px-2 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
              toneClass(queued ? "green" : tone).border,
              toneClass(queued ? "green" : tone).bg,
              toneClass(queued ? "green" : tone).text,
            )}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : queued ? <CheckCircle2 className="h-3 w-3" /> : <Send className="h-3 w-3" />}
            <span>{queued ? "Na fila" : "Fila"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionQueuePanel({
  actionItems,
  busyId,
  loading,
  onRefresh,
  onStatusChange,
  ready,
  schemaMessage,
}: {
  actionItems: TrafficAiActionItem[];
  busyId: string | null;
  loading: boolean;
  onRefresh: () => void;
  onStatusChange: (actionItemId: string, status: TrafficAiActionStatus) => void;
  ready: boolean;
  schemaMessage: string | null;
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks className={cn("h-4 w-4 shrink-0", toneClass("cyan").text)} />
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">fila operacional</p>
            <p className="truncate text-[13px] font-semibold text-white">{actionItems.length} acao(oes)</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", toneClass("cyan").border, toneClass("cyan").bg, toneClass("cyan").text)}
          title="Atualizar fila"
        >
          <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {!ready ? (
        <SchemaNotice message={schemaMessage} />
      ) : actionItems.length ? (
        <div className="grid gap-2">
          {actionItems.map((item) => (
            <ActionItemRow
              key={item.id}
              busy={busyId === item.id}
              item={item}
              onStatusChange={(status) => onStatusChange(item.id, status)}
            />
          ))}
        </div>
      ) : (
        <EmptyMiniState text="Envie uma recomendacao para a fila para acompanhar aprovacao, execucao e conclusao." />
      )}
    </div>
  );
}

function ActionItemRow({
  busy,
  item,
  onStatusChange,
}: {
  busy: boolean;
  item: TrafficAiActionItem;
  onStatusChange: (status: TrafficAiActionStatus) => void;
}) {
  const tone = statusActionTone(item.status);

  return (
    <div className="rounded-lg px-3 py-3" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <NeonBadge tone={tone}>{statusActionLabel(item.status)}</NeonBadge>
            <p className="truncate text-[12px] font-semibold text-white">{item.title}</p>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">{item.action}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <QueueButton busy={busy} disabled={item.status === "approved"} label="Aprovar" onClick={() => onStatusChange("approved")} tone="amber" />
          <QueueButton busy={busy} disabled={item.status === "in_progress"} label="Iniciar" onClick={() => onStatusChange("in_progress")} tone="cyan" />
          <QueueButton busy={busy} disabled={item.status === "done"} label="Concluir" onClick={() => onStatusChange("done")} tone="green" />
          <QueueButton busy={busy} disabled={item.status === "dismissed"} label="Descartar" onClick={() => onStatusChange("dismissed")} tone="rose" />
        </div>
      </div>
    </div>
  );
}

function AnalysisHistoryPanel({
  analyses,
  loading,
  ready,
  schemaMessage,
}: {
  analyses: TrafficAiAnalysisHistoryItem[];
  loading: boolean;
  ready: boolean;
  schemaMessage: string | null;
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
      <div className="mb-3 flex items-center gap-2">
        <Clock3 className={cn("h-4 w-4", toneClass("violet").text)} />
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">historico de analises</p>
          <p className="truncate text-[13px] font-semibold text-white">{loading ? "Carregando" : `${analyses.length} registro(s)`}</p>
        </div>
      </div>

      {!ready ? (
        <SchemaNotice message={schemaMessage} />
      ) : analyses.length ? (
        <div className="grid gap-2">
          {analyses.map((analysis) => (
            <div key={analysis.id} className="rounded-lg px-3 py-3" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] font-semibold text-cyan-200">{analysis.score}/100</p>
                <p className="shrink-0 text-[10px] text-slate-500">{formatDateTime(analysis.createdAt)}</p>
              </div>
              <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-300">{analysis.summary}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyMiniState text="As analises geradas pelo botao Analisar com IA aparecem aqui." />
      )}
    </div>
  );
}

function QueueButton({
  busy,
  disabled,
  label,
  onClick,
  tone,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  tone: Tone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
        toneClass(tone).border,
        toneClass(tone).bg,
        toneClass(tone).text,
      )}
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </button>
  );
}

function SchemaNotice({ message }: { message: string | null }) {
  return (
    <div className={cn("rounded-xl border px-3 py-3 text-[12px] leading-5", toneClass("amber").border, toneClass("amber").bg, toneClass("amber").text)}>
      {message ?? "Aplique a migration 0046 para habilitar historico e fila operacional."}
    </div>
  );
}

function EmptyMiniState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed px-3 py-5 text-center text-[12px] leading-5 text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
      {text}
    </div>
  );
}

function statusTone(status: TrafficManagerStatus): Tone {
  if (status === "critical") return "rose";
  if (status === "attention") return "amber";
  if (status === "growth") return "green";
  return "cyan";
}

function priorityTone(priority: TrafficManagerPriority): Tone {
  if (priority === "critical") return "rose";
  if (priority === "high") return "amber";
  if (priority === "medium") return "cyan";
  return "green";
}

function priorityLabel(priority: TrafficManagerPriority) {
  if (priority === "critical") return "critico";
  if (priority === "high") return "alto";
  if (priority === "medium") return "medio";
  return "baixo";
}

function statusActionTone(status: TrafficAiActionStatus): Tone {
  if (status === "done") return "green";
  if (status === "dismissed") return "rose";
  if (status === "approved" || status === "in_progress") return "cyan";
  return "amber";
}

function statusActionLabel(status: TrafficAiActionStatus) {
  if (status === "approved") return "aprovada";
  if (status === "in_progress") return "em execucao";
  if (status === "done") return "concluida";
  if (status === "dismissed") return "descartada";
  if (status === "suggested") return "sugerida";
  return "na fila";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

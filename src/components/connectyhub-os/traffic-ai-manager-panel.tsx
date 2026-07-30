"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Loader2,
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
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: Tone; message: string } | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

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
    } catch (error) {
      setNotice({
        tone: "rose",
        message: error instanceof Error ? error.message : "Falha ao gerar analise.",
      });
    } finally {
      setLoading(false);
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
            <RecommendationRow key={recommendation.id} recommendation={recommendation} />
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

function RecommendationRow({ recommendation }: { recommendation: TrafficManagerRecommendation }) {
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
        </div>
      </div>
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

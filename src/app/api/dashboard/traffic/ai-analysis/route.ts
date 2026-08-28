import { NextResponse, type NextRequest } from "next/server";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
import { loadGeminiCredentials, type GeminiCredentials } from "@/lib/gemini/credentials";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { getClientTrafficOverview } from "@/lib/traffic/admin-traffic";
import { saveTrafficAiAnalysis } from "@/lib/traffic/traffic-ai-operations";
import {
  buildTrafficManagerPlan,
  type TrafficManagerPlan,
  type TrafficManagerPlatform,
} from "@/lib/traffic/traffic-ai-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TrafficAnalysisBody = {
  companyId?: unknown;
  platform?: unknown;
};

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as TrafficAnalysisBody | null;
  const requestedCompanyId = readString(body?.companyId);
  const platform = normalizePlatform(readString(body?.platform));

  if (!platform) {
    return NextResponse.json({ error: "Informe a plataforma Meta ou Google." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId,
      missingMessage: "Informe a empresa para analisar.",
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    const entitlement = resolvePlanFeatureEntitlement("ai_traffic_manager", {
      isPlatformAdmin: workspace.profile.isPlatformAdmin,
      organizationStatus: company.status,
      planCode: company.planCode,
    });

    if (!entitlement.allowed) {
      return NextResponse.json({ error: entitlement.description, entitlement }, { status: 403 });
    }

    if (!["owner", "admin"].includes(company.role)) {
      return NextResponse.json({ error: "Somente dono ou admin pode gerar analise com IA." }, { status: 403 });
    }

    await assertBillableAccess({ organizationId: company.id, client });

    const overview = await getClientTrafficOverview(company.id);
    const plan = buildTrafficManagerPlan(overview, platform);
    const credentials = await loadGeminiCredentials(client);
    const generated = await generateTrafficAnalysis({
      companyName: company.name,
      credentials,
      plan,
      platform,
    });
    const usage = await meterGeminiGenerationUsage({
      client,
      organizationId: company.id,
      userId: workspace.user.id,
      featureCode: "ai_traffic_manager",
      modelId: generated.modelId,
      agentScope: "customer",
      promptText: [generated.systemInstruction, generated.prompt],
      outputText: generated.text,
      responseData: generated.responseData,
      debitDescription: "Analise IA de trafego pago",
      metadata: {
        source: "dashboard_traffic_ai_manager",
        companyId: company.id,
        platform,
        score: plan.score,
        recommendationIds: plan.recommendations.map((item) => item.id),
      },
    });
    const analysisHistory = await saveTrafficAiAnalysis({
      analysisText: generated.text,
      client,
      organizationId: company.id,
      plan,
      platform,
      usageEventId: usage.usageEventId,
      userId: workspace.user.id,
    });

    return NextResponse.json({
      analysis: {
        id: analysisHistory?.id ?? null,
        text: generated.text,
        generatedAt: new Date().toISOString(),
        usage: {
          chargeCredits: usage.chargeCredits,
          debited: usage.debited,
        },
      },
      plan,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Nao foi possivel gerar analise de trafego.",
        ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
      },
      { status: statusForDashboardCompanyScopeError(error, error instanceof BillingAccessError ? 402 : 500) },
    );
  }
}

async function generateTrafficAnalysis(input: {
  companyName: string;
  credentials: GeminiCredentials;
  plan: TrafficManagerPlan;
  platform: TrafficManagerPlatform;
}) {
  const modelId = input.credentials.model;
  const systemInstruction = [
    "Você é um gestor de tráfego pago sênior dentro da ConnectyHub.",
    "Responda em portugues do Brasil, com diagnostico operacional e proximas acoes.",
    "Nao prometa resultado garantido. Use apenas os dados recebidos.",
    "Entregue no maximo 6 bullets curtos e uma linha final de prioridade.",
  ].join("\n");
  const prompt = [
    `Empresa: ${input.companyName}`,
    `Plataforma: ${input.platform === "meta" ? "Meta Ads" : "Google Ads"}`,
    `Score: ${input.plan.score}/100`,
    `Status: ${input.plan.statusLabel}`,
    `Resumo calculado: ${input.plan.summary}`,
    `Proxima acao calculada: ${input.plan.nextAction}`,
    "Diagnosticos:",
    ...input.plan.diagnostics.map((item) => `- ${item.label}: ${item.value} (${item.detail})`),
    "Recomendacoes priorizadas:",
    ...input.plan.recommendations.map((item) => `- [${item.priority}] ${item.title}: ${item.action} | ${item.metricLabel}: ${item.metricValue}`),
    "Foco de verba:",
    ...input.plan.budgetFocus.map((item) => `- ${item.label}: ${item.value}`),
  ].join("\n");
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`);
  url.searchParams.set("key", input.credentials.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [{
        role: "user",
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        maxOutputTokens: 900,
        temperature: 0.35,
        topP: 0.9,
      },
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(readGeminiError(data) ?? `Gemini respondeu status ${response.status}.`);
  }

  const text = extractGeminiText(data).trim();

  if (!text) {
    throw new Error("Gemini nao retornou analise.");
  }

  return {
    modelId,
    prompt,
    responseData: data,
    systemInstruction,
    text: text.slice(0, 2600),
  };
}

function normalizePlatform(value: string | null): TrafficManagerPlatform | null {
  if (value === "meta" || value === "google") {
    return value;
  }

  return null;
}

function extractGeminiText(value: unknown) {
  const candidates = readRecord(value)?.candidates;

  if (!Array.isArray(candidates)) {
    return "";
  }

  return candidates
    .flatMap((candidate) => {
      const parts = readRecord(readRecord(candidate)?.content)?.parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) => readRecord(part)?.text)
    .filter((text): text is string => typeof text === "string")
    .join("\n")
    .trim();
}

function readGeminiError(value: unknown) {
  const error = readRecord(readRecord(value)?.error);
  const message = error?.message;
  return typeof message === "string" ? message : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

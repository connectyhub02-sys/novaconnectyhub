import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

type GrowthAgentRow = {
  id: string;
  agent_code: string;
  name: string;
  persona_name: string | null;
  prompt: string;
  status: string;
  requires_human_approval: boolean | null;
  model_id: string | null;
  metadata: JsonRecord | null;
};

type CredentialRow = {
  env_name: string;
  encrypted_value: string;
  value_preview: string;
};

type GrowthMission = {
  title: string;
  objective: string;
  eventType: string;
  memoryType: string;
  tags: string[];
  contentType?: string;
  contentStatus?: "idea" | "researching" | "draft" | "review";
};

type RunGrowthAgentInput = {
  agentCode: GrowthAgentCode;
  triggerSource: string;
  inngestRunId?: string | null;
};

type LlmResult =
  | { status: "generated"; text: string; model: string }
  | { status: "unavailable"; reason: string; model: string };

const defaultGeminiModel = "gemini-2.5-flash";
const geminiCredentialNames = ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY", "GEMINI_DEFAULT_MODEL"];

const growthAgentMissionDefinitions = {
  "agente-pesquisa-web": {
    title: "Pesquisa externa para crescimento",
    objective: "Mapear oportunidades publicas de temas, dores, perguntas e fontes para SEO, AEO e GEO/AGO.",
    eventType: "growth.research.completed",
    memoryType: "research",
    tags: ["growth", "research", "seo", "aeo", "geo"],
    contentType: "research",
    contentStatus: "researching",
  },
  "agente-radar-mercado": {
    title: "Radar de mercado",
    objective: "Detectar mudancas de mercado, riscos e oportunidades comerciais para a ConnectyHub.",
    eventType: "growth.market_radar.completed",
    memoryType: "market_radar",
    tags: ["growth", "market_radar", "strategy", "seo"],
  },
  "agente-noticias": {
    title: "Varredura de noticias",
    objective: "Converter novidades publicas em angulos de conteudo, autoridade e oportunidades comerciais.",
    eventType: "growth.news.completed",
    memoryType: "news",
    tags: ["growth", "news", "content", "aeo"],
    contentType: "news",
    contentStatus: "idea",
  },
  "agente-blog": {
    title: "Pauta de blog SEO/AEO/GEO",
    objective: "Gerar pauta ou rascunho estrategico para blog com resposta direta, entidades e CTA para WhatsApp.",
    eventType: "growth.blog.completed",
    memoryType: "content_brief",
    tags: ["growth", "blog", "seo", "aeo", "geo"],
    contentType: "blog",
    contentStatus: "draft",
  },
  "agente-inteligencia-competitiva": {
    title: "Inteligencia competitiva etica",
    objective: "Analisar apenas dados publicos de concorrentes e gerar lacunas de conteudo, posicionamento e SEO.",
    eventType: "growth.competitive_intel.completed",
    memoryType: "competitive_intel",
    tags: ["growth", "competitive_intel", "ethical_osint", "seo_gap"],
    contentType: "research",
    contentStatus: "researching",
  },
  "agente-seo-organico": {
    title: "Plano SEO organico",
    objective: "Transformar inteligencia em clusters, keywords, entidades, schema e links internos.",
    eventType: "growth.seo.completed",
    memoryType: "seo_plan",
    tags: ["growth", "seo", "keywords", "schema"],
    contentType: "seo_brief",
    contentStatus: "idea",
  },
  "agente-aeo-respostas": {
    title: "Plano AEO de respostas",
    objective: "Criar perguntas, respostas curtas, FAQ e blocos citaveis para mecanismos de resposta.",
    eventType: "growth.aeo.completed",
    memoryType: "aeo_plan",
    tags: ["growth", "aeo", "faq", "answer_engine"],
    contentType: "faq",
    contentStatus: "idea",
  },
  "agente-geo-ago": {
    title: "Plano GEO/AGO para IA generativa",
    objective: "Preparar entidades, fatos verificaveis e blocos de resposta para mecanismos generativos e assistentes.",
    eventType: "growth.geo_ago.completed",
    memoryType: "geo_ago_plan",
    tags: ["growth", "geo", "ago", "llm_optimization"],
    contentType: "geo_ago_brief",
    contentStatus: "idea",
  },
} satisfies Record<string, GrowthMission>;

export type GrowthAgentCode = keyof typeof growthAgentMissionDefinitions;

export const growthAgentMissions: Record<GrowthAgentCode, GrowthMission> = growthAgentMissionDefinitions;

export async function runGrowthAgentMission(input: RunGrowthAgentInput, client: SupabaseClient = createServiceClient()) {
  const mission = growthAgentMissions[input.agentCode];
  const agent = await loadGrowthAgent(client, input.agentCode);

  if (!agent) {
    return { status: "skipped", reason: "agent_not_found", agentCode: input.agentCode };
  }

  if (agent.status === "paused" || agent.status === "archived") {
    return { status: "skipped", reason: `agent_${agent.status}`, agentCode: input.agentCode };
  }

  const runId = await createAgentRun(client, agent, mission, input);
  const llm = await generateGrowthBriefing(client, agent, mission);

  if (llm.status === "unavailable") {
    await finishAgentRun(client, runId, {
      status: "needs_approval",
      outputSummary: `LLM indisponivel para ${agent.name}. ${llm.reason}`,
      errorMessage: llm.reason,
      metadata: {
        agentCode: agent.agent_code,
        mission: mission.title,
        llmStatus: llm.status,
        model: llm.model,
      },
    });

    return {
      status: "needs_approval",
      reason: llm.reason,
      agentCode: agent.agent_code,
      runId,
    };
  }

  const eventId = await recordIntelligenceEvent(client, agent, mission, llm, input);
  await recordIntelligenceMemory(client, agent, mission, llm, eventId);

  if (mission.contentType) {
    await recordContentPipelineItem(client, agent, mission, llm);
  }

  const runStatus = agent.requires_human_approval === false ? "completed" : "needs_approval";
  await finishAgentRun(client, runId, {
    status: runStatus,
    outputSummary: preview(llm.text, 900),
    metadata: {
      agentCode: agent.agent_code,
      mission: mission.title,
      llmStatus: llm.status,
      model: llm.model,
      intelligenceEventId: eventId,
    },
  });

  return {
    status: runStatus,
    agentCode: agent.agent_code,
    runId,
    eventId,
    model: llm.model,
  };
}

async function loadGrowthAgent(client: SupabaseClient, agentCode: GrowthAgentCode) {
  const { data } = await client
    .from("agent_registry")
    .select("id, agent_code, name, persona_name, prompt, status, requires_human_approval, model_id, metadata")
    .eq("scope", "platform")
    .is("organization_id", null)
    .eq("agent_code", agentCode)
    .maybeSingle<GrowthAgentRow>();

  return data ?? null;
}

async function createAgentRun(
  client: SupabaseClient,
  agent: GrowthAgentRow,
  mission: GrowthMission,
  input: RunGrowthAgentInput,
) {
  const { data } = await client
    .from("agent_runs")
    .insert({
      agent_id: agent.id,
      run_status: "running",
      trigger_source: input.triggerSource,
      inngest_run_id: input.inngestRunId ?? null,
      input_summary: mission.objective,
      cost_credits: 0,
      metadata: {
        agentCode: agent.agent_code,
        mission: mission.title,
        tags: mission.tags,
      },
    })
    .select("id")
    .single<{ id: string }>();

  return data?.id ?? null;
}

async function finishAgentRun(
  client: SupabaseClient,
  runId: string | null,
  input: {
    status: "completed" | "failed" | "needs_approval";
    outputSummary: string;
    errorMessage?: string | null;
    metadata?: JsonRecord;
  },
) {
  if (!runId) return;

  await client
    .from("agent_runs")
    .update({
      run_status: input.status,
      output_summary: input.outputSummary,
      error_message: input.errorMessage ?? null,
      finished_at: new Date().toISOString(),
      metadata: input.metadata ?? {},
    })
    .eq("id", runId);
}

async function recordIntelligenceEvent(
  client: SupabaseClient,
  agent: GrowthAgentRow,
  mission: GrowthMission,
  llm: Extract<LlmResult, { status: "generated" }>,
  input: RunGrowthAgentInput,
) {
  const { data } = await client
    .from("intelligence_events")
    .insert({
      scope: "platform",
      source_type: "growth_agent",
      source_id: agent.agent_code,
      producer_agent_id: agent.id,
      event_type: mission.eventType,
      title: `${agent.name}: ${mission.title}`,
      summary: preview(llm.text, 1400),
      confidence: 0.78,
      visibility: "platform",
      tags: mission.tags,
      payload: {
        agentCode: agent.agent_code,
        triggerSource: input.triggerSource,
        model: llm.model,
        generatedAt: new Date().toISOString(),
      },
    })
    .select("id")
    .single<{ id: string }>();

  return data?.id ?? null;
}

async function recordIntelligenceMemory(
  client: SupabaseClient,
  agent: GrowthAgentRow,
  mission: GrowthMission,
  llm: Extract<LlmResult, { status: "generated" }>,
  eventId: string | null,
) {
  await client.from("intelligence_memory").insert({
    scope: "platform",
    memory_type: mission.memoryType,
    title: `${mission.title} - ${formatDateTitle(new Date())}`,
    content: llm.text,
    source_event_id: eventId,
    created_by_agent_id: agent.id,
    importance: 0.74,
    tags: mission.tags,
    metadata: {
      agentCode: agent.agent_code,
      model: llm.model,
      growthEngine: true,
    },
  });
}

async function recordContentPipelineItem(
  client: SupabaseClient,
  agent: GrowthAgentRow,
  mission: GrowthMission,
  llm: Extract<LlmResult, { status: "generated" }>,
) {
  await client.from("content_pipeline_items").insert({
    scope: "platform",
    content_type: mission.contentType ?? "brief",
    status: mission.contentStatus ?? "idea",
    title: `${mission.title} - ${formatDateTitle(new Date())}`,
    summary: preview(llm.text, 900),
    body: llm.text,
    producer_agent_id: agent.id,
    tags: mission.tags,
    metadata: {
      agentCode: agent.agent_code,
      model: llm.model,
      growthEngine: true,
    },
  });
}

async function generateGrowthBriefing(
  client: SupabaseClient,
  agent: GrowthAgentRow,
  mission: GrowthMission,
): Promise<LlmResult> {
  const credentials = await loadGeminiCredentials(client, agent.model_id ?? defaultGeminiModel);
  const model = normalizeGeminiModel(agent.model_id ?? credentials.model);

  if (!credentials.apiKey) {
    return { status: "unavailable", reason: "Gemini API Key nao configurada no cofre ou no ambiente.", model };
  }

  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
  url.searchParams.set("key", credentials.apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildGrowthPrompt(agent, mission),
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1400,
          temperature: 0.35,
        },
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const data = await readResponse(response);

    if (!response.ok) {
      return {
        status: "unavailable",
        reason: extractProviderMessage(data) ?? `Gemini respondeu com status ${response.status}.`,
        model,
      };
    }

    const text = extractGeminiText(data);
    if (!text) {
      return { status: "unavailable", reason: "Gemini nao retornou texto utilizavel.", model };
    }

    return { status: "generated", text, model };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error && error.name === "AbortError"
        ? "Tempo limite de 20 segundos ao chamar Gemini."
        : "Nao foi possivel chamar Gemini.",
      model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildGrowthPrompt(agent: GrowthAgentRow, mission: GrowthMission) {
  return [
    "Voce esta executando uma rotina autonoma da ConnectyHub.",
    "",
    `Agente: ${agent.persona_name || agent.name} (${agent.agent_code})`,
    `Missao: ${mission.title}`,
    `Objetivo: ${mission.objective}`,
    "",
    "Prompt do agente:",
    agent.prompt,
    "",
    "Saida obrigatoria em portugues do Brasil:",
    "1. Resumo executivo em ate 5 linhas.",
    "2. Oportunidades de SEO.",
    "3. Perguntas e respostas para AEO.",
    "4. Otimizacao GEO/AGO para mecanismos generativos.",
    "5. Proximas acoes para conteudo, produto e comercial.",
    "6. Riscos, limites e o que precisa de validacao humana.",
    "",
    "Se a missao depender de pesquisa web e nenhuma fonte externa foi fornecida no contexto, marque achados como hipoteses a validar e nao invente fonte acessada.",
    `Data da execucao: ${new Date().toISOString()}`,
  ].join("\n");
}

async function loadGeminiCredentials(client: SupabaseClient, fallbackModel: string) {
  const { data } = await client
    .from("integration_credentials")
    .select("env_name, encrypted_value, value_preview")
    .eq("scope", "platform")
    .eq("integration_id", "gemini")
    .is("organization_id", null)
    .in("env_name", geminiCredentialNames)
    .order("updated_at", { ascending: false });

  const credentials = (data ?? []) as CredentialRow[];
  const apiKey = resolveCredentialValue(
    credentials,
    ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY"],
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY,
  );
  const model = resolveCredentialValue(credentials, ["GEMINI_DEFAULT_MODEL"], process.env.GEMINI_DEFAULT_MODEL) || fallbackModel;

  return {
    apiKey,
    model: normalizeGeminiModel(model),
  };
}

function resolveCredentialValue(credentials: CredentialRow[], envNames: string[], fallback?: string) {
  for (const envName of envNames) {
    const credential = credentials.find((item) => item.env_name === envName);
    if (!credential) continue;

    try {
      return decryptCredentialValue(credential.encrypted_value);
    } catch {
      return credential.value_preview;
    }
  }

  return fallback;
}

function normalizeGeminiModel(value: string) {
  return value.trim().replace(/^models\//, "") || defaultGeminiModel;
}

async function readResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null) as Promise<unknown>;
  }

  const text = await response.text().catch(() => "");

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractGeminiText(data: unknown) {
  if (!data || typeof data !== "object") return null;

  const candidates = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return null;

  const parts = candidates.flatMap((candidate) => {
    const content = readRecord(candidate)?.content;
    const candidateParts = readRecord(content)?.parts;
    return Array.isArray(candidateParts) ? candidateParts : [];
  });

  const text = parts
    .map((part) => readRecord(part)?.text)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();

  return text || null;
}

function extractProviderMessage(data: unknown) {
  const error = readRecord(data)?.error;
  const message = readRecord(error)?.message;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function preview(value: string, length: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > length ? `${cleaned.slice(0, Math.max(0, length - 3))}...` : cleaned;
}

function formatDateTitle(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

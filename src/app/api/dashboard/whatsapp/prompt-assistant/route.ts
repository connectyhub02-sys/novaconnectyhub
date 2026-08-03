import { NextResponse, type NextRequest } from "next/server";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { loadGeminiCredentials, type GeminiCredentials } from "@/lib/gemini/credentials";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PromptAssistantBody = {
  companyId?: unknown;
  mode?: unknown;
  productUrl?: unknown;
  notes?: unknown;
  templateId?: unknown;
};

const maxPageChars = 12000;
const maxNotesChars = 1200;

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as PromptAssistantBody | null;
  const requestedCompanyId = asString(body?.companyId);
  const mode = asString(body?.mode);
  const productUrl = asString(body?.productUrl);
  const notes = asString(body?.notes)?.slice(0, maxNotesChars) ?? "";

  if (!productUrl && !notes) {
    return NextResponse.json({ error: "Informe notas para a IA analisar." }, { status: 400 });
  }

  try {
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId,
      missingMessage: "Escolha uma empresa antes de gerar o prompt.",
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    await assertBillableAccess({ organizationId: company.id, client });
    const credentials = await loadGeminiCredentials(client) as GeminiCredentials;
    const pageContext = productUrl && mode !== "company_context" ? await fetchPageContext(productUrl) : "";
    const generated = mode === "company_context"
      ? await generateCompanyContext({
        credentials,
        companyName: company.name,
        notes,
        templateId: asString(body?.templateId),
      })
      : await generatePrompt({
      credentials,
      companyName: company.name,
      pageContext,
      productUrl,
      notes,
    });
    await meterGeminiGenerationUsage({
      client,
      organizationId: company.id,
      userId: workspace.user.id,
      featureCode: "prompt_assistant",
      modelId: generated.modelId,
      agentScope: "customer",
      promptText: [generated.systemInstruction, generated.prompt],
      outputText: generated.text,
      responseData: generated.responseData,
      debitDescription: "Assistente de prompt ConnectyHub",
      metadata: {
        source: "dashboard_prompt_assistant",
        mode: mode ?? "prompt",
        companyId,
        hasProductUrl: Boolean(productUrl),
        notesChars: notes.length,
        pageContextChars: pageContext.length,
      },
    });

    return mode === "company_context"
      ? NextResponse.json({ text: generated.text })
      : NextResponse.json({ prompt: generated.text });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao gerar prompt.",
        ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
      },
      { status: statusForDashboardCompanyScopeError(error, error instanceof BillingAccessError ? 402 : 500) },
    );
  }
}

async function generateCompanyContext(input: {
  credentials: GeminiCredentials;
  companyName: string;
  notes: string;
  templateId: string | null;
}) {
  const modelId = input.credentials.model;
  const systemInstruction = [
    "Voce melhora complementos de empresa para prompt de agente comercial no WhatsApp.",
    "Reescreva as notas em portugues do Brasil, de forma clara, operacional e sem inventar informacao.",
    "Organize em topicos curtos: diferenciais, publico, regras comerciais, atendimento, limites e observacoes.",
    "Nao crie promessa, preco, prazo, garantia ou politica que nao esteja nas notas.",
    "Entregue somente o complemento final, sem explicacao externa.",
  ].join("\n");
  const prompt = [
    `Empresa: ${input.companyName}`,
    input.templateId ? `Modelo/nicho selecionado: ${input.templateId}` : "",
    `Notas originais:\n${input.notes}`,
  ].filter(Boolean).join("\n\n");
  const responseData = await callGemini(input.credentials, systemInstruction, prompt, {
    temperature: 0.32,
    maxOutputTokens: 900,
  });
  const text = extractGeminiText(responseData).trim();

  if (!text) {
    throw new Error("Gemini nao retornou o complemento.");
  }

  return {
    text: text.slice(0, maxNotesChars),
    systemInstruction,
    prompt,
    modelId,
    responseData,
  };
}

async function fetchPageContext(productUrl: string) {
  const url = normalizeUrl(productUrl);

  if (!url) {
    throw new Error("Informe um link valido iniciado por http ou https.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ConnectyHub Prompt Assistant/1.0",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`A pagina respondeu status ${response.status}.`);
    }

    const html = await response.text();
    return extractVisibleText(html).slice(0, maxPageChars);
  } finally {
    clearTimeout(timeout);
  }
}

async function generatePrompt(input: {
  credentials: GeminiCredentials;
  companyName: string;
  pageContext: string;
  productUrl: string | null;
  notes: string;
}) {
  const modelId = input.credentials.model;
  const systemInstruction = [
    "Voce cria prompts de atendimento comercial por WhatsApp para agentes de IA.",
    "Entregue somente o prompt final em portugues do Brasil.",
    "O prompt deve ser claro, direto, operacional e ter no maximo 3500 caracteres.",
    "Inclua as tags {{lead_name}}, {{empresa}} e {{agente}} quando fizer sentido.",
    "Nao crie template fixo de mensagem; crie comportamento, tom, limites, perguntas e proximo passo.",
  ].join("\n");
  const prompt = [
    `Empresa: ${input.companyName}`,
    input.productUrl ? `Link analisado: ${input.productUrl}` : "",
    input.notes ? `Notas do usuario: ${input.notes}` : "",
    input.pageContext ? `Conteudo da pagina: ${input.pageContext}` : "",
  ].filter(Boolean).join("\n\n");
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`);
  url.searchParams.set("key", input.credentials.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: systemInstruction,
        }],
      },
      contents: [{
        role: "user",
        parts: [{
          text: prompt,
        }],
      }],
      generationConfig: {
        temperature: 0.45,
        topP: 0.9,
        maxOutputTokens: 1600,
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
    throw new Error("Gemini nao retornou um prompt.");
  }

  return {
    text: text.slice(0, 3600),
    systemInstruction,
    prompt,
    modelId,
    responseData: data,
  };
}

async function callGemini(
  credentials: GeminiCredentials,
  systemInstruction: string,
  prompt: string,
  config: { temperature: number; maxOutputTokens: number },
) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(credentials.model)}:generateContent`);
  url.searchParams.set("key", credentials.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: systemInstruction,
        }],
      },
      contents: [{
        role: "user",
        parts: [{
          text: prompt,
        }],
      }],
      generationConfig: {
        temperature: config.temperature,
        topP: 0.9,
        maxOutputTokens: config.maxOutputTokens,
      },
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(readGeminiError(data) ?? `Gemini respondeu status ${response.status}.`);
  }

  return data;
}

function extractVisibleText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

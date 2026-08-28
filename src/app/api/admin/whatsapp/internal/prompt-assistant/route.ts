import { NextResponse, type NextRequest } from "next/server";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { requirePlatformWhatsappSector } from "@/lib/admin/platform-whatsapp-console";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  normalizeOutboundLanguageText,
  outboundLanguageQualityPromptLines,
} from "@/lib/whatsapp/outbound-language";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PromptAssistantBody = {
  sectorId?: unknown;
  mode?: unknown;
  productUrl?: unknown;
  notes?: unknown;
  templateId?: unknown;
};

type GeminiCredentials = {
  apiKey: string;
  model: string;
};

const defaultGeminiModel = "gemini-2.5-flash";
const geminiCredentialNames = ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY", "GEMINI_DEFAULT_MODEL"];
const maxPageChars = 12000;
const maxNotesChars = 1200;

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null) as PromptAssistantBody | null;
  const sectorId = asString(body?.sectorId);
  const mode = asString(body?.mode);
  const productUrl = asString(body?.productUrl);
  const notes = asString(body?.notes)?.slice(0, maxNotesChars) ?? "";

  if (!sectorId) {
    return NextResponse.json({ error: "Escolha um setor antes de gerar o prompt." }, { status: 422 });
  }

  if (!productUrl && !notes) {
    return NextResponse.json({ error: "Informe um link ou notas do atendimento." }, { status: 400 });
  }

  try {
    const client = createServiceClient();
    const sector = await requirePlatformWhatsappSector(client, sectorId);
    const credentials = await loadGeminiCredentials(client);
    const pageContext = productUrl && mode !== "company_context" ? await fetchPageContext(productUrl) : "";
    const generated = mode === "company_context"
      ? await generateCompanyContext({
        credentials,
        sectorName: sector.name,
        sectorDescription: sector.description,
        notes,
        templateId: asString(body?.templateId),
      })
      : await generatePrompt({
      credentials,
      sectorName: sector.name,
      sectorDescription: sector.description,
      pageContext,
      productUrl,
      notes,
    });
    await meterGeminiGenerationUsage({
      client,
      featureCode: "prompt_assistant",
      modelId: generated.modelId,
      agentScope: "platform",
      billingMode: "internal_shadow",
      promptText: [generated.systemInstruction, generated.prompt],
      outputText: generated.text,
      responseData: generated.responseData,
      debitDescription: "Assistente de prompt interno ConnectyHub",
      metadata: {
        source: "admin_whatsapp_prompt_assistant",
        mode: mode ?? "prompt",
        sectorId: sector.id,
        sectorCode: sector.sector_code,
        hasProductUrl: Boolean(productUrl),
        notesChars: notes.length,
        pageContextChars: pageContext.length,
      },
    }).catch(() => null);

    return mode === "company_context"
      ? NextResponse.json({ text: generated.text })
      : NextResponse.json({ prompt: generated.text });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao gerar prompt." }, { status: 500 });
  }
}

async function generateCompanyContext(input: {
  credentials: GeminiCredentials;
  sectorName: string;
  sectorDescription: string | null;
  notes: string;
  templateId: string | null;
}) {
  const modelId = input.credentials.model;
  const systemInstruction = [
    "Você melhora complementos para prompt de agente interno no WhatsApp.",
    "Reescreva as notas em português do Brasil, de forma operacional e sem inventar informação.",
    "Organize em tópicos curtos: contexto, objetivo, regras, limites e observações.",
    ...outboundLanguageQualityPromptLines,
    "Entregue somente o complemento final, sem explicação externa.",
  ].join("\n");
  const prompt = [
    `Setor: ${input.sectorName}`,
    input.sectorDescription ? `Descricao do setor: ${input.sectorDescription}` : "",
    input.templateId ? `Modelo selecionado: ${input.templateId}` : "",
    `Notas originais:\n${input.notes}`,
  ].filter(Boolean).join("\n\n");
  const responseData = await callGemini(input.credentials, systemInstruction, prompt, {
    temperature: 0.32,
    maxOutputTokens: 900,
  });
  const text = normalizeOutboundLanguageText(extractGeminiText(responseData).trim());

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

async function loadGeminiCredentials(client = createServiceClient()): Promise<GeminiCredentials> {
  const values = new Map<string, string>();
  const { data, error } = await client
    .from("integration_credentials")
    .select("env_name, encrypted_value, value_preview")
    .eq("scope", "platform")
    .eq("integration_id", "gemini")
    .is("organization_id", null)
    .in("env_name", geminiCredentialNames)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Nao foi possivel carregar credenciais Gemini: ${error.message}`);
  }

  for (const credential of (data ?? []) as Array<{ env_name: string; encrypted_value: string; value_preview: string }>) {
    if (values.has(credential.env_name)) {
      continue;
    }

    try {
      values.set(credential.env_name, decryptCredentialValue(credential.encrypted_value));
    } catch {
      values.set(credential.env_name, credential.value_preview);
    }
  }

  for (const name of geminiCredentialNames) {
    const value = process.env[name];
    if (value && !values.has(name)) values.set(name, value);
  }

  const apiKey = values.get("GEMINI_API_KEY") ?? values.get("GOOGLE_GENERATIVE_AI_API_KEY") ?? values.get("GOOGLE_AI_API_KEY") ?? "";

  if (!apiKey.trim()) {
    throw new Error("Gemini nao configurado para gerar prompt.");
  }

  return {
    apiKey: apiKey.trim(),
    model: normalizeGeminiModel(values.get("GEMINI_DEFAULT_MODEL") ?? defaultGeminiModel),
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
        "User-Agent": "ConnectyHub Admin Prompt Assistant/1.0",
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
  sectorName: string;
  sectorDescription: string | null;
  pageContext: string;
  productUrl: string | null;
  notes: string;
}) {
  const modelId = input.credentials.model;
  const systemInstruction = [
    "Você cria prompts de atendimento comercial por WhatsApp para agentes internos da ConnectyHub.",
    "Entregue somente o prompt final em português do Brasil.",
    "O prompt deve ser operacional, claro e ter no máximo 3500 caracteres.",
    "Inclua as tags {{lead_name}}, {{setor}} e {{agente}} quando fizer sentido.",
    "Não crie template fixo de mensagem; crie comportamento, tom, limites, perguntas, dados a coletar e próximo passo.",
    ...outboundLanguageQualityPromptLines,
  ].join("\n");
  const prompt = [
    `Setor da ConnectyHub: ${input.sectorName}`,
    input.sectorDescription ? `Contexto do setor: ${input.sectorDescription}` : "",
    input.productUrl ? `Link analisado: ${input.productUrl}` : "",
    input.notes ? `Notas do administrador: ${input.notes}` : "",
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

  const text = normalizeOutboundLanguageText(extractGeminiText(data).trim());

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

function normalizeGeminiModel(value: string) {
  return value.trim().replace(/^models\//, "") || defaultGeminiModel;
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

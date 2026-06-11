import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { loadGeminiCredentials, type GeminiCredentials } from "@/lib/gemini/credentials";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PromptAssistantBody = {
  companyId?: unknown;
  productUrl?: unknown;
  notes?: unknown;
};

const maxPageChars = 12000;
const maxNotesChars = 1200;

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as PromptAssistantBody | null;
  const companyId = asString(body?.companyId);
  const productUrl = asString(body?.productUrl);
  const notes = asString(body?.notes)?.slice(0, maxNotesChars) ?? "";

  if (!companyId) {
    return NextResponse.json({ error: "Escolha uma empresa antes de gerar o prompt." }, { status: 422 });
  }

  if (!productUrl && !notes) {
    return NextResponse.json({ error: "Informe um link ou notas do produto." }, { status: 400 });
  }

  try {
    const client = createServiceClient();
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    const credentials = await loadGeminiCredentials(client) as GeminiCredentials;
    const pageContext = productUrl ? await fetchPageContext(productUrl) : "";
    const prompt = await generatePrompt({
      credentials,
      companyName: company.name,
      pageContext,
      productUrl,
      notes,
    });

    return NextResponse.json({ prompt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao gerar prompt." }, { status: 500 });
  }
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
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.credentials.model)}:generateContent`);
  url.searchParams.set("key", input.credentials.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: [
            "Voce cria prompts de atendimento comercial por WhatsApp para agentes de IA.",
            "Entregue somente o prompt final em portugues do Brasil.",
            "O prompt deve ser claro, direto, operacional e ter no maximo 3500 caracteres.",
            "Inclua as tags {{lead_name}}, {{empresa}} e {{agente}} quando fizer sentido.",
            "Nao crie template fixo de mensagem; crie comportamento, tom, limites, perguntas e proximo passo.",
          ].join("\n"),
        }],
      },
      contents: [{
        role: "user",
        parts: [{
          text: [
            `Empresa: ${input.companyName}`,
            input.productUrl ? `Link analisado: ${input.productUrl}` : "",
            input.notes ? `Notas do usuario: ${input.notes}` : "",
            input.pageContext ? `Conteudo da pagina: ${input.pageContext}` : "",
          ].filter(Boolean).join("\n\n"),
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

  return text.slice(0, 3600);
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

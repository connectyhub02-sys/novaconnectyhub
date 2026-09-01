import { NextResponse } from "next/server";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { defaultGeminiModel, normalizeGeminiModel } from "@/lib/gemini/models";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CredentialRow = {
  env_name: string;
  encrypted_value: string;
  value_preview: string;
};

export async function POST() {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
    return NextResponse.json(
      { status: "offline", message: "CREDENTIAL_ENCRYPTION_KEY nao configurada. Nao e possivel ler o cofre." },
      { status: 503 },
    );
  }

  const { data, error } = await auth.supabase
    .from("integration_credentials")
    .select("env_name, encrypted_value, value_preview")
    .eq("scope", "platform")
    .eq("integration_id", "gemini")
    .is("organization_id", null)
    .in("env_name", ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY", "GEMINI_DEFAULT_MODEL"])
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ status: "offline", message: error.message }, { status: 500 });
  }

  const credentials = data ?? [];
  const apiKey = resolveCredentialValue(
    credentials,
    ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY"],
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY,
  );
  const model = normalizeGeminiModel(
    resolveCredentialValue(credentials, ["GEMINI_DEFAULT_MODEL"], process.env.GEMINI_DEFAULT_MODEL) || defaultGeminiModel,
  );

  if (!apiKey) {
    return NextResponse.json(
      {
        status: "offline",
        message: "Preencha a Google Gemini API Key antes de testar.",
        model,
        checkedAt: new Date().toISOString(),
      },
      { status: 400 },
    );
  }

  const testResult = await testGeminiConnection(apiKey, model);
  const { responseData, promptText, outputText, ...publicTestResult } = testResult;

  if (testResult.status === "online") {
    await meterGeminiGenerationUsage({
      client: auth.supabase,
      featureCode: "content_generation",
      modelId: model,
      userId: auth.userId,
      agentScope: "platform",
      billingMode: "internal_shadow",
      promptText,
      outputText,
      responseData,
      debitDescription: "Teste interno Gemini",
      metadata: {
        source: "admin_gemini_integration_test",
        integrationId: "gemini",
      },
    }).catch(() => null);
  }

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "integration.connection_tested",
    target_table: "integration_credentials",
    target_id: null,
    metadata: {
      integrationId: "gemini",
      model,
      status: publicTestResult.status,
      httpStatus: publicTestResult.httpStatus,
    },
  });

  return NextResponse.json(publicTestResult, { status: publicTestResult.status === "online" ? 200 : 502 });
}

async function requirePlatformAdmin() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Supabase Auth nao configurado." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle<{ is_platform_admin: boolean | null }>();

  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: "Apenas administradores podem testar credenciais da plataforma." }, { status: 403 });
  }

  return { supabase, userId: user.id };
}

function resolveCredentialValue(credentials: CredentialRow[], envNames: string[], fallback?: string) {
  for (const envName of envNames) {
    const credential = credentials.find((item) => item.env_name === envName);

    if (!credential) {
      continue;
    }

    try {
      return decryptCredentialValue(credential.encrypted_value);
    } catch {
      return credential.value_preview;
    }
  }

  return fallback;
}

async function testGeminiConnection(apiKey: string, model: string) {
  const checkedAt = new Date().toISOString();
  const promptText = "Responda apenas: ok";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          maxOutputTokens: 8,
          temperature: 0,
        },
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const data = await readResponse(response);

    if (!response.ok) {
      return {
        status: "offline" as const,
        message: resolveGeminiErrorMessage(response.status, data),
        httpStatus: response.status,
        model,
        checkedAt,
      };
    }

    return {
      status: "online" as const,
      message: "Gemini online. API Key e modelo validados.",
      httpStatus: response.status,
      model,
      checkedAt,
      promptText,
      outputText: extractGeminiText(data),
      responseData: data,
    };
  } catch (error) {
    return {
      status: "offline" as const,
      message: error instanceof Error && error.name === "AbortError"
        ? "Teste de conexao expirou depois de 12 segundos."
        : "Nao foi possivel conectar ao Gemini.",
      model,
      checkedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
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
  if (!data || typeof data !== "object") {
    return "";
  }

  const candidates = (data as { candidates?: unknown }).candidates;

  if (!Array.isArray(candidates)) {
    return "";
  }

  return candidates
    .flatMap((candidate) => {
      const parts = (candidate as { content?: { parts?: unknown } }).content?.parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) => (part as { text?: unknown }).text)
    .filter((text): text is string => typeof text === "string")
    .join("\n")
    .trim();
}

function resolveGeminiErrorMessage(status: number, data: unknown) {
  const message = extractProviderMessage(data);

  if (status === 400) {
    return message || "Gemini respondeu 400. Verifique se o modelo escolhido aceita generateContent.";
  }

  if (status === 401 || status === 403) {
    return message || "Gemini respondeu, mas a API Key nao foi aceita.";
  }

  if (status === 404) {
    return message || "Modelo Gemini nao encontrado para esta chave.";
  }

  return message || `Gemini respondeu com status ${status}.`;
}

function extractProviderMessage(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  const error = record.error;

  if (!error || typeof error !== "object") {
    return null;
  }

  const errorRecord = error as Record<string, unknown>;
  return typeof errorRecord.message === "string" ? errorRecord.message : null;
}

import { NextResponse } from "next/server";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CredentialRow = {
  env_name: string;
  encrypted_value: string;
  value_preview: string;
};

type GeminiModelResponse = {
  models?: GeminiProviderModel[];
  nextPageToken?: string;
};

type GeminiProviderModel = {
  name?: string;
  baseModelId?: string;
  version?: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
};

type GeminiModelOption = {
  id: string;
  name: string;
  baseModelId: string | null;
  displayName: string;
  description: string;
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
  supportedGenerationMethods: string[];
  supportsGenerateContent: boolean;
};

export async function GET() {
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
    .in("env_name", ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY"])
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ status: "offline", message: error.message }, { status: 500 });
  }

  const apiKey = resolveCredentialValue(
    data ?? [],
    ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY"],
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY,
  );

  if (!apiKey) {
    return NextResponse.json(
      {
        status: "offline",
        message: "Salve a Google Gemini API Key antes de carregar os modelos.",
        models: [],
        checkedAt: new Date().toISOString(),
      },
      { status: 400 },
    );
  }

  const result = await listGeminiModels(apiKey);

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "integration.models_listed",
    target_table: "integration_credentials",
    target_id: null,
    metadata: {
      integrationId: "gemini",
      status: result.status,
      modelCount: result.models.length,
      generationModelCount: result.generationModelCount,
      httpStatus: result.httpStatus,
    },
  });

  return NextResponse.json(result, { status: result.status === "online" ? 200 : 502 });
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
    return NextResponse.json({ error: "Apenas administradores podem listar modelos do Gemini." }, { status: 403 });
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

async function listGeminiModels(apiKey: string) {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const providerModels: GeminiProviderModel[] = [];
    let pageToken = "";
    let lastHttpStatus: number | undefined;

    do {
      const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("pageSize", "1000");

      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      lastHttpStatus = response.status;
      const data = await readResponse(response);

      if (!response.ok) {
        return {
          status: "offline" as const,
          message: resolveGeminiModelsErrorMessage(response.status, data),
          httpStatus: response.status,
          models: [],
          generationModelCount: 0,
          checkedAt,
        };
      }

      const parsed = data as GeminiModelResponse;
      providerModels.push(...(Array.isArray(parsed.models) ? parsed.models : []));
      pageToken = typeof parsed.nextPageToken === "string" ? parsed.nextPageToken : "";
    } while (pageToken);

    const models = normalizeGeminiModels(providerModels);

    return {
      status: "online" as const,
      message: `${models.length} modelo${models.length === 1 ? "" : "s"} retornado${models.length === 1 ? "" : "s"} pela API Gemini.`,
      httpStatus: lastHttpStatus,
      models,
      generationModelCount: models.filter((model) => model.supportsGenerateContent).length,
      checkedAt,
    };
  } catch (error) {
    return {
      status: "offline" as const,
      message: error instanceof Error && error.name === "AbortError"
        ? "A listagem de modelos expirou depois de 12 segundos."
        : "Nao foi possivel listar os modelos do Gemini.",
      models: [],
      generationModelCount: 0,
      checkedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeGeminiModels(models: GeminiProviderModel[]): GeminiModelOption[] {
  const seen = new Set<string>();

  return models
    .map((model) => {
      const id = normalizeModelId(model.name || model.baseModelId || "");

      if (!id) {
        return null;
      }

      const supportedGenerationMethods = Array.isArray(model.supportedGenerationMethods)
        ? model.supportedGenerationMethods.filter((method): method is string => typeof method === "string")
        : [];

      return {
        id,
        name: model.name || `models/${id}`,
        baseModelId: model.baseModelId || null,
        displayName: model.displayName || id,
        description: model.description || "",
        inputTokenLimit: typeof model.inputTokenLimit === "number" ? model.inputTokenLimit : null,
        outputTokenLimit: typeof model.outputTokenLimit === "number" ? model.outputTokenLimit : null,
        supportedGenerationMethods,
        supportsGenerateContent: supportedGenerationMethods.includes("generateContent"),
      };
    })
    .filter((model): model is GeminiModelOption => Boolean(model))
    .filter((model) => {
      if (seen.has(model.id)) {
        return false;
      }

      seen.add(model.id);
      return true;
    })
    .sort((a, b) => {
      if (a.supportsGenerateContent !== b.supportsGenerateContent) {
        return a.supportsGenerateContent ? -1 : 1;
      }

      return a.displayName.localeCompare(b.displayName);
    });
}

function normalizeModelId(value: string) {
  return value.trim().replace(/^models\//, "");
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

function resolveGeminiModelsErrorMessage(status: number, data: unknown) {
  const message = extractProviderMessage(data);

  if (status === 401 || status === 403) {
    return message || "Gemini respondeu, mas a API Key nao foi aceita para listar modelos.";
  }

  return message || `Gemini respondeu com status ${status} ao listar modelos.`;
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

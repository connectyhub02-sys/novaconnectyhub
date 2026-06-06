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
    .eq("integration_id", "uazapi")
    .is("organization_id", null)
    .in("env_name", ["UAZAPI_BASE_URL", "UAZAPI_ACCOUNT_EMAIL", "UAZAPI_ADMIN_TOKEN"])
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ status: "offline", message: error.message }, { status: 500 });
  }

  const credentials = data ?? [];
  const baseUrl = resolveCredentialValue(credentials, ["UAZAPI_BASE_URL", "UAZAPI_ACCOUNT_EMAIL"], process.env.UAZAPI_BASE_URL);
  const adminToken = resolveCredentialValue(credentials, ["UAZAPI_ADMIN_TOKEN"], process.env.UAZAPI_ADMIN_TOKEN);

  if (!baseUrl || !adminToken) {
    return NextResponse.json(
      {
        status: "offline",
        message: "Preencha Server URL e Admin Token antes de testar.",
        checkedAt: new Date().toISOString(),
      },
      { status: 400 },
    );
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    return NextResponse.json(
      {
        status: "offline",
        message: "Server URL invalida. Use uma URL completa, por exemplo https://connectyhub.uazapi.com.",
        checkedAt: new Date().toISOString(),
      },
      { status: 400 },
    );
  }

  const testResult = await testUazapiConnection(normalizedBaseUrl, adminToken);

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "integration.connection_tested",
    target_table: "integration_credentials",
    target_id: null,
    metadata: {
      integrationId: "uazapi",
      baseUrl: normalizedBaseUrl,
      status: testResult.status,
      httpStatus: testResult.httpStatus,
      instanceCount: testResult.instanceCount,
    },
  });

  return NextResponse.json(testResult, { status: testResult.status === "online" ? 200 : 502 });
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

function normalizeBaseUrl(value: string) {
  try {
    const url = new URL(value.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function testUazapiConnection(baseUrl: string, adminToken: string) {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${baseUrl}/instance/all`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        admintoken: adminToken,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const data = await readResponse(response);

    if (!response.ok) {
      return {
        status: "offline" as const,
        message: response.status === 401 || response.status === 403
          ? "Uazapi respondeu, mas o Admin Token nao foi aceito."
          : `Uazapi respondeu com status ${response.status}.`,
        httpStatus: response.status,
        checkedAt,
      };
    }

    return {
      status: "online" as const,
      message: "Uazapi online. Server URL e Admin Token validados.",
      httpStatus: response.status,
      instanceCount: countInstances(data),
      checkedAt,
    };
  } catch (error) {
    return {
      status: "offline" as const,
      message: error instanceof Error && error.name === "AbortError"
        ? "Teste de conexao expirou depois de 12 segundos."
        : "Nao foi possivel conectar ao Server URL da Uazapi.",
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

function countInstances(data: unknown) {
  if (Array.isArray(data)) {
    return data.length;
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  const candidates = [record.instances, record.data, record.result, record.results];
  const arrayCandidate = candidates.find(Array.isArray);

  return arrayCandidate ? arrayCandidate.length : null;
}

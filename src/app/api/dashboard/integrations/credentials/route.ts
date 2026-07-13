import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { getClientIntegrationCredentialDefinitions, getIntegrationProviders } from "@/lib/client-os/integrations";
import {
  encryptCredentialValue,
  hashCredentialValue,
  previewCredentialValue,
} from "@/lib/security/credentials-crypto";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type CredentialInput = {
  envName: string;
  value: string;
};

type CredentialRow = {
  id: string;
  organization_id: string;
  integration_id: string;
  env_name: string;
  label: string;
  kind: "secret" | "public" | "endpoint" | "identifier";
  requirement: "required" | "recommended" | "optional";
  value_preview: string;
  updated_at: string | null;
};

export async function POST(request: NextRequest) {
  const auth = await requireWorkspace();

  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
    return NextResponse.json(
      { error: "CREDENTIAL_ENCRYPTION_KEY nao configurada. O cofre nao pode salvar segredos sem criptografia." },
      { status: 503 },
    );
  }

  const body = await readJson(request);
  const companyId = readString(body?.companyId);
  const providerId = readString(body?.providerId);
  const inputs = readCredentialInputs(body?.credentials);

  if (!companyId || !providerId) {
    return NextResponse.json({ error: "Informe empresa e provedor." }, { status: 400 });
  }

  if (!inputs.length) {
    return NextResponse.json({ error: "Preencha pelo menos uma credencial antes de salvar." }, { status: 400 });
  }

  const provider = getIntegrationProviders().find((item) => item.id === providerId);
  const definitions = getClientIntegrationCredentialDefinitions().filter((item) => item.providerId === providerId);

  if (!provider || !definitions.length) {
    return NextResponse.json({ error: "Integracao nao disponivel para credenciais do cliente." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const company = await requireClientCompanyAccess({ userId: auth.workspace.user.id, companyId, client });

    if (!["owner", "admin"].includes(company.role)) {
      return NextResponse.json({ error: "Somente dono ou admin da empresa pode alterar credenciais." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const providerResult = await client.from("integration_providers").upsert({
      id: provider.id,
      name: provider.name,
      category: provider.category,
      status: provider.status,
      mode: provider.mode,
      auth_type: "api_key",
      headline: provider.headline,
      description: provider.summary,
      feature_flags: { client_credentials: true, read_only_first: true },
      updated_at: now,
    });

    if (providerResult.error) {
      return schemaError(providerResult.error.message);
    }

    const savedCredentials: CredentialRow[] = [];

    for (const input of inputs) {
      const definition = definitions.find((item) => item.envName === input.envName);

      if (!definition) {
        return NextResponse.json({ error: `Credencial ${input.envName} nao pertence a esta integracao.` }, { status: 400 });
      }

      const value = input.value.trim();

      if (!value) {
        continue;
      }

      if (definition.kind === "endpoint" && !isValidUrl(value)) {
        return NextResponse.json({ error: `${definition.label} precisa ser uma URL valida.` }, { status: 400 });
      }

      const payload = {
        scope: "organization",
        organization_id: company.id,
        integration_id: definition.integrationId,
        env_name: definition.envName,
        label: definition.label,
        kind: definition.kind,
        requirement: definition.requirement,
        encrypted_value: encryptCredentialValue(value),
        value_preview: previewCredentialValue(value, definition.kind),
        value_hash: hashCredentialValue(value),
        configured_by: auth.workspace.user.id,
      };

      const { data: existing, error: lookupError } = await client
        .from("integration_credentials")
        .select("id")
        .eq("scope", "organization")
        .eq("organization_id", company.id)
        .eq("integration_id", definition.integrationId)
        .eq("env_name", definition.envName)
        .maybeSingle<{ id: string }>();

      if (lookupError) {
        return NextResponse.json({ error: lookupError.message }, { status: 500 });
      }

      const saveQuery = existing
        ? client
            .from("integration_credentials")
            .update(payload)
            .eq("id", existing.id)
            .select("id, organization_id, integration_id, env_name, label, kind, requirement, value_preview, updated_at")
            .single<CredentialRow>()
        : client
            .from("integration_credentials")
            .insert(payload)
            .select("id, organization_id, integration_id, env_name, label, kind, requirement, value_preview, updated_at")
            .single<CredentialRow>();

      const { data: saved, error: saveError } = await saveQuery;

      if (saveError || !saved) {
        return NextResponse.json({ error: saveError?.message ?? `Nao foi possivel salvar ${definition.label}.` }, { status: 500 });
      }

      savedCredentials.push(saved);
    }

    if (!savedCredentials.length) {
      return NextResponse.json({ error: "Preencha pelo menos uma credencial antes de salvar." }, { status: 400 });
    }

    const accountLabel = resolveAccountLabel(savedCredentials, providerId);
    const integrationResult = await client
      .from("organization_integrations")
      .upsert({
        organization_id: company.id,
        provider_id: provider.id,
        status: "connected",
        connection_label: `${provider.name} conectado`,
        external_account_id: accountLabel,
        external_account_label: accountLabel,
        auth_kind: "api_key",
        last_sync_at: now,
        last_test_at: now,
        last_error: null,
        metadata: {
          source: "dashboard_integrations",
          credential_envs: savedCredentials.map((credential) => credential.env_name),
        },
        connected_by: auth.workspace.user.id,
        connected_at: now,
        updated_at: now,
      }, { onConflict: "organization_id,provider_id" })
      .select("id")
      .single<{ id: string }>();

    if (integrationResult.error || !integrationResult.data) {
      return schemaError(integrationResult.error?.message ?? "Nao foi possivel atualizar a conexao.");
    }

    await client.from("integration_action_logs").insert({
      organization_id: company.id,
      organization_integration_id: integrationResult.data.id,
      provider_id: provider.id,
      actor_id: auth.workspace.user.id,
      action: "credentials.saved",
      status: "success",
      metadata: {
        credential_envs: savedCredentials.map((credential) => credential.env_name),
      },
    });

    return NextResponse.json({
      credentials: savedCredentials.map((credential) => ({
        id: credential.id,
        companyId: credential.organization_id,
        providerId,
        integrationId: credential.integration_id,
        envName: credential.env_name,
        label: credential.label,
        kind: credential.kind,
        requirement: credential.requirement,
        displayValue: credential.value_preview,
        configured: true,
        updatedAt: credential.updated_at,
      })),
      connection: {
        providerId: provider.id,
        companyId: company.id,
        companyName: company.name,
        status: "connected",
        label: "Conectado",
        detail: `Credenciais atualizadas em ${formatDateTime(now)}`,
        accountLabel,
        lastSyncAt: now,
        lastError: null,
        managementHref: null,
        metadata: {
          credential_envs: savedCredentials.map((credential) => credential.env_name),
        },
      },
    });
  } catch (error) {
    return NextResponse.json({ error: readErrorMessage(error, "Nao foi possivel salvar as credenciais.") }, { status: 400 });
  }
}

async function requireWorkspace() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  return { workspace };
}

async function readJson(request: NextRequest): Promise<JsonRecord | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

function readCredentialInputs(value: unknown): CredentialInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as JsonRecord;
    const envName = readString(record.envName);
    const credentialValue = readString(record.value);

    if (!envName || !credentialValue) {
      return [];
    }

    return [{ envName, value: credentialValue }];
  });
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveAccountLabel(credentials: CredentialRow[], providerId: string) {
  const priority = providerId === "meta-ads"
    ? ["META_AD_ACCOUNT_ID", "INSTAGRAM_BUSINESS_ACCOUNT_ID", "FACEBOOK_PAGE_ID"]
    : ["GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_SEARCH_CONSOLE_SITE_URL"];

  for (const envName of priority) {
    const credential = credentials.find((item) => item.env_name === envName);

    if (credential?.value_preview) {
      return credential.value_preview;
    }
  }

  return null;
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function schemaError(message: string) {
  return NextResponse.json({
    error: "A migration 0028_integration_hub.sql precisa estar aplicada no Supabase para salvar conexoes da Central.",
    details: message,
  }, { status: 503 });
}

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

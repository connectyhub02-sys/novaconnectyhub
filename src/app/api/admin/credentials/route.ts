import { NextResponse, type NextRequest } from "next/server";
import { maintenanceIntegrations } from "@/lib/maintenance-vault";
import {
  decryptCredentialValue,
  encryptCredentialValue,
  hashCredentialValue,
  previewCredentialValue,
} from "@/lib/security/credentials-crypto";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

const allowedScopes = new Set(["platform", "organization"]);

export async function GET() {
  const auth = await requireAuthenticatedSupabase();

  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!auth.isPlatformAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem listar credenciais da plataforma." }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("integration_credentials")
    .select("id, scope, organization_id, integration_id, env_name, label, kind, requirement, encrypted_value, value_preview, configured_by, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const credentials = (data ?? []).map((credential) => {
    const displayValue = getDisplayValue(credential.kind, credential.encrypted_value, credential.value_preview);
    const { encrypted_value: _encryptedValue, ...safeCredential } = credential;

    return {
      ...safeCredential,
      display_value: displayValue,
      catalog_status: findCredentialDefinition(credential.integration_id, credential.env_name) ? "active" : "obsolete",
    };
  });

  return NextResponse.json({ credentials });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedSupabase();

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
  const parsed = parseCredentialInput(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (!auth.isPlatformAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem gravar credenciais da plataforma." }, { status: 403 });
  }

  const encryptedValue = encryptCredentialValue(parsed.value);
  const valueHash = hashCredentialValue(parsed.value);
  const valuePreview = previewCredentialValue(parsed.value, parsed.kind);

  const payload = {
    scope: parsed.scope,
    organization_id: parsed.scope === "organization" ? parsed.organizationId : null,
    integration_id: parsed.integrationId,
    env_name: parsed.envName,
    label: parsed.label,
    kind: parsed.kind,
    requirement: parsed.requirement,
    encrypted_value: encryptedValue,
    value_preview: valuePreview,
    value_hash: valueHash,
    configured_by: auth.userId,
  };

  let existingQuery = auth.supabase
    .from("integration_credentials")
    .select("id")
    .eq("scope", parsed.scope)
    .eq("integration_id", parsed.integrationId)
    .eq("env_name", parsed.envName)
    .limit(1);

  existingQuery =
    parsed.scope === "organization" && parsed.organizationId
      ? existingQuery.eq("organization_id", parsed.organizationId)
      : existingQuery.is("organization_id", null);

  const { data: existing } = await existingQuery.maybeSingle<{ id: string }>();

  const saveQuery = existing
    ? auth.supabase
        .from("integration_credentials")
        .update(payload)
        .eq("id", existing.id)
        .select("id, scope, integration_id, env_name, label, kind, requirement, value_preview, updated_at")
        .single()
    : auth.supabase
        .from("integration_credentials")
        .insert(payload)
        .select("id, scope, integration_id, env_name, label, kind, requirement, value_preview, updated_at")
        .single();

  const { data, error } = await saveQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: existing ? "credential.updated" : "credential.created",
    target_table: "integration_credentials",
    target_id: data?.id ?? null,
    metadata: {
      scope: parsed.scope,
      integrationId: parsed.integrationId,
      envName: parsed.envName,
      label: parsed.label,
    },
  });

  return NextResponse.json({ credential: data, action: existing ? "updated" : "created" }, { status: existing ? 200 : 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedSupabase();

  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!auth.isPlatformAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem remover credenciais." }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Informe o id da credencial." }, { status: 400 });
  }

  const { data: existing, error: lookupError } = await auth.supabase
    .from("integration_credentials")
    .select("id, integration_id, env_name, label")
    .eq("id", id)
    .maybeSingle<{ id: string; integration_id: string; env_name: string; label: string }>();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Credencial nao encontrada." }, { status: 404 });
  }

  const { error } = await auth.supabase.from("integration_credentials").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "credential.deleted",
    target_table: "integration_credentials",
    target_id: existing.id,
    metadata: {
      integrationId: existing.integration_id,
      envName: existing.env_name,
      label: existing.label,
    },
  });

  return NextResponse.json({ ok: true });
}

async function requireAuthenticatedSupabase() {
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

  return { supabase, userId: user.id, isPlatformAdmin: Boolean(profile?.is_platform_admin) };
}

async function readJson(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

type ParsedCredentialInput =
  | {
      ok: true;
      scope: "platform" | "organization";
      organizationId: string | null;
      integrationId: string;
      envName: string;
      label: string;
      kind: "secret" | "public" | "endpoint" | "identifier";
      requirement: "required" | "recommended" | "optional";
      value: string;
    }
  | { ok: false; error: string };

function parseCredentialInput(body: unknown): ParsedCredentialInput {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Payload invalido." };
  }

  const input = body as Record<string, unknown>;
  const scope = typeof input.scope === "string" ? input.scope : "platform";
  const integrationId = typeof input.integrationId === "string" ? input.integrationId : "";
  const envName = typeof input.envName === "string" ? input.envName : "";
  const label = typeof input.label === "string" ? input.label : envName;
  const value = typeof input.value === "string" ? input.value.trim() : "";
  const organizationId = typeof input.organizationId === "string" && input.organizationId ? input.organizationId : null;

  if (!allowedScopes.has(scope)) {
    return { ok: false, error: "Escopo invalido." };
  }

  const field = findCredentialDefinition(integrationId, envName);

  if (!field) {
    return { ok: false, error: "Credencial nao reconhecida no catalogo da sala de manutencao." };
  }

  if (!value) {
    return { ok: false, error: "Informe o valor da credencial." };
  }

  if (field.kind === "endpoint" && !isValidUrl(value)) {
    return { ok: false, error: "Este campo espera uma URL valida. Confira se voce selecionou a credencial correta." };
  }

  if (scope === "organization" && !organizationId) {
    return { ok: false, error: "Credencial de cliente precisa de organizationId." };
  }

  return {
    ok: true,
    scope: scope as "platform" | "organization",
    organizationId,
    integrationId,
    envName,
    label,
    kind: field.kind,
    requirement: field.requirement,
    value,
  };
}

function findCredentialDefinition(integrationId: string, envName: string) {
  const integration = maintenanceIntegrations.find((item) => item.id === integrationId);
  return integration?.fields.find((item) => item.env === envName || item.aliases?.includes(envName)) ?? null;
}

function getDisplayValue(kind: string, encryptedValue: string, fallbackPreview: string) {
  if (kind === "secret") {
    return fallbackPreview;
  }

  try {
    return decryptCredentialValue(encryptedValue);
  } catch {
    return fallbackPreview;
  }
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { loadMetaGuidedOAuthConfig, normalizeMetaAdAccountId } from "@/lib/client-os/guided-oauth";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CredentialRow = {
  env_name: string | null;
  encrypted_value: string | null;
};

type OrganizationIntegrationRow = {
  id: string;
  metadata: Record<string, unknown> | null;
};

type GraphTestResult = {
  id: "business_management" | "ads_read" | "pages_read_engagement";
  label: string;
  ok: boolean;
  permission: string;
  status: number | null;
  detail: string;
  endpoint: string;
};

const metaCredentialEnvNames = [
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "FACEBOOK_PAGE_ID",
];

export async function POST() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const organizationId = workspace.organization?.id;

  if (!organizationId) {
    return NextResponse.json({ error: "Selecione uma empresa antes de testar a conexao Meta." }, { status: 400 });
  }

  const client = createServiceClient();
  const config = await loadMetaGuidedOAuthConfig({ client });
  const credentials = await loadOrganizationMetaCredentials(client, organizationId);
  const accessToken = credentials.get("META_ACCESS_TOKEN");
  const adAccountId = normalizeMetaAdAccountId(credentials.get("META_AD_ACCOUNT_ID"));
  const pageId = credentials.get("FACEBOOK_PAGE_ID")?.trim() ?? "";
  const ranAt = new Date().toISOString();

  if (!accessToken) {
    return NextResponse.json({ error: "Conecte a conta Meta antes de rodar o teste." }, { status: 400 });
  }

  const appsecretProof = createHmac("sha256", config.appSecret).update(accessToken).digest("hex");
  const results = await Promise.all([
    runGraphTest({
      accessToken,
      appsecretProof,
      config,
      endpointPath: "/me/businesses",
      id: "business_management",
      label: "Business Manager",
      missingDetail: null,
      permission: "business_management",
      params: {
        fields: "id,name,verification_status",
        limit: "5",
      },
    }),
    runGraphTest({
      accessToken,
      appsecretProof,
      config,
      endpointPath: adAccountId ? `/${adAccountId}/insights` : null,
      id: "ads_read",
      label: "Meta Ads Insights",
      missingDetail: "Conta de anuncios Meta nao selecionada.",
      permission: "ads_read",
      params: {
        date_preset: "last_30d",
        fields: "impressions,clicks,spend",
        level: "account",
        limit: "1",
      },
    }),
    runGraphTest({
      accessToken,
      appsecretProof,
      config,
      endpointPath: pageId ? `/${pageId}` : null,
      id: "pages_read_engagement",
      label: "Facebook Page leitura",
      missingDetail: "Pagina do Facebook nao selecionada.",
      permission: "pages_read_engagement",
      params: {
        fields: "id,name,fan_count,followers_count,posts.limit(1){id,message,created_time}",
      },
    }),
  ]);

  const ok = results.every((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const summary = ok
    ? "Chamadas Meta executadas com sucesso."
    : `Chamadas executadas com ${failed.length} pendencia(s).`;

  await updateIntegrationTestStatus({
    client,
    organizationId,
    ranAt,
    results,
    summary: ok ? null : failed.map((result) => `${result.permission}: ${result.detail}`).join(" | "),
    userId: workspace.user.id,
  });

  return NextResponse.json({
    ok,
    ranAt,
    summary,
    results,
  });
}

async function loadOrganizationMetaCredentials(
  client: ReturnType<typeof createServiceClient>,
  organizationId: string,
) {
  const credentials = new Map<string, string>();
  const { data, error } = await client
    .from("integration_credentials")
    .select("env_name, encrypted_value")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("integration_id", "meta")
    .in("env_name", metaCredentialEnvNames);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as CredentialRow[]) {
    if (!row.env_name || !row.encrypted_value) {
      continue;
    }

    credentials.set(row.env_name, decryptCredentialValue(row.encrypted_value));
  }

  return credentials;
}

async function runGraphTest(input: {
  accessToken: string;
  appsecretProof: string;
  config: Awaited<ReturnType<typeof loadMetaGuidedOAuthConfig>>;
  endpointPath: string | null;
  id: GraphTestResult["id"];
  label: string;
  missingDetail: string | null;
  permission: string;
  params: Record<string, string>;
}): Promise<GraphTestResult> {
  if (!input.endpointPath) {
    return {
      id: input.id,
      label: input.label,
      ok: false,
      permission: input.permission,
      status: null,
      detail: input.missingDetail ?? "Endpoint nao configurado.",
      endpoint: "not-configured",
    };
  }

  const url = new URL(`https://graph.facebook.com/${input.config.graphVersion}${input.endpointPath}`);

  for (const [key, value] of Object.entries(input.params)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("access_token", input.accessToken);
  url.searchParams.set("appsecret_proof", input.appsecretProof);

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => null) as unknown;

    return {
      id: input.id,
      label: input.label,
      ok: response.ok,
      permission: input.permission,
      status: response.status,
      detail: response.ok ? readSuccessDetail(data) : readGraphError(data),
      endpoint: sanitizeGraphUrl(url),
    };
  } catch (error) {
    return {
      id: input.id,
      label: input.label,
      ok: false,
      permission: input.permission,
      status: null,
      detail: error instanceof Error ? error.message : "Falha ao chamar a Graph API.",
      endpoint: sanitizeGraphUrl(url),
    };
  }
}

async function updateIntegrationTestStatus(input: {
  client: ReturnType<typeof createServiceClient>;
  organizationId: string;
  ranAt: string;
  results: GraphTestResult[];
  summary: string | null;
  userId: string;
}) {
  const { data } = await input.client
    .from("organization_integrations")
    .select("id, metadata")
    .eq("organization_id", input.organizationId)
    .eq("provider_id", "meta-ads")
    .maybeSingle<OrganizationIntegrationRow>();

  const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
  const reviewTest = {
    ran_at: input.ranAt,
    ok: input.results.every((result) => result.ok),
    results: input.results.map((result) => ({
      permission: result.permission,
      ok: result.ok,
      status: result.status,
      detail: result.detail,
      endpoint: result.endpoint,
    })),
  };

  if (data?.id) {
    await input.client
      .from("organization_integrations")
      .update({
        last_error: input.summary,
        last_test_at: input.ranAt,
        last_sync_at: input.ranAt,
        metadata: {
          ...metadata,
          review_test: reviewTest,
        },
        status: input.summary ? "warning" : "connected",
        updated_at: input.ranAt,
      })
      .eq("id", data.id);
  }

  await input.client.from("integration_action_logs").insert({
    organization_id: input.organizationId,
    organization_integration_id: data?.id ?? null,
    provider_id: "meta-ads",
    actor_id: input.userId,
    action: "meta.review_test",
    status: input.summary ? "warning" : "success",
    metadata: reviewTest,
  });
}

function sanitizeGraphUrl(url: URL) {
  const safe = new URL(url.toString());
  safe.searchParams.delete("access_token");
  safe.searchParams.delete("appsecret_proof");

  return `${safe.pathname}${safe.search}`;
}

function readSuccessDetail(value: unknown) {
  if (!value || typeof value !== "object") {
    return "Meta respondeu com sucesso.";
  }

  const record = value as Record<string, unknown>;
  const data = record.data;

  if (Array.isArray(data)) {
    return data.length ? `${data.length} registro(s) retornado(s).` : "Meta respondeu sem registros, mas a chamada foi aceita.";
  }

  if (typeof record.id === "string") {
    return "Objeto Meta retornado com sucesso.";
  }

  return "Meta respondeu com sucesso.";
}

function readGraphError(value: unknown) {
  if (!value || typeof value !== "object") {
    return "Meta nao retornou detalhes do erro.";
  }

  const error = (value as Record<string, unknown>).error;

  if (!error || typeof error !== "object") {
    return "Meta recusou a chamada sem detalhe estruturado.";
  }

  const record = error as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : null;
  const code = typeof record.code === "number" || typeof record.code === "string" ? String(record.code) : null;

  return [message, code ? `codigo ${code}` : null].filter(Boolean).join(" - ") || "Meta recusou a chamada.";
}

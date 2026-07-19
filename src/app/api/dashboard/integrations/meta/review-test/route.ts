import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import {
  fetchMetaPageAccessToken,
  getAppBaseUrl,
  loadMetaGuidedOAuthConfig,
  normalizeMetaAdAccountId,
  saveOAuthCredentials,
} from "@/lib/client-os/guided-oauth";
import {
  createMetaReviewResult,
  hasMetaPermissionSet,
  summarizeMetaReviewReadiness,
  type MetaReviewCapabilityId,
  type MetaReviewReadinessSummary,
  type MetaReviewTestResult,
} from "@/lib/meta/review-readiness";
import { metaPageWebhookFields, summarizeMetaPageSubscription } from "@/lib/meta/webhook-activation-policy";
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
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
};

const metaCredentialEnvNames = [
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "FACEBOOK_PAGE_ID",
  "FACEBOOK_PAGE_ACCESS_TOKEN",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
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
  const integration = await loadOrganizationMetaIntegration(client, organizationId);
  const accessToken = credentials.get("META_ACCESS_TOKEN");
  const adAccountId = normalizeMetaAdAccountId(credentials.get("META_AD_ACCOUNT_ID"));
  const pageId = credentials.get("FACEBOOK_PAGE_ID")?.trim() ?? "";
  const instagramBusinessId = credentials.get("INSTAGRAM_BUSINESS_ACCOUNT_ID")?.trim() ?? "";
  let pageAccessToken = credentials.get("FACEBOOK_PAGE_ACCESS_TOKEN")?.trim() ?? "";
  const ranAt = new Date().toISOString();

  if (!accessToken) {
    return NextResponse.json({ error: "Conecte a conta Meta antes de rodar o teste." }, { status: 400 });
  }

  if (pageId && !pageAccessToken) {
    pageAccessToken = await fetchMetaPageAccessToken({ accessToken, config, pageId }) ?? "";

    if (pageAccessToken) {
      await saveOAuthCredentials({
        client,
        organizationId,
        actorId: workspace.user.id,
        credentials: [{
          integrationId: "meta",
          envName: "FACEBOOK_PAGE_ACCESS_TOKEN",
          label: "Facebook Page access token",
          kind: "secret",
          requirement: "optional",
          value: pageAccessToken,
        }],
      });
    }
  }

  const appsecretProof = buildMetaAppSecretProof(accessToken, config.appSecret);
  const pageToken = pageAccessToken || accessToken;
  const debugToken = await runDebugTokenTest({
    accessToken,
    config,
  });
  const permissionSourceReady = debugToken.result.ok && debugToken.grantedPermissions.length > 0;
  const grantedPermissions = permissionSourceReady
    ? debugToken.grantedPermissions
    : readStringArray(integration?.scopes);
  const results = await Promise.all([
    Promise.resolve(debugToken.result),
    runGraphTest({
      accessToken,
      appsecretProof,
      config,
      endpointPath: "/me/businesses",
      id: "business_management",
      missingDetail: null,
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
      missingDetail: "Conta de anuncios Meta nao selecionada.",
      params: {
        date_preset: "last_30d",
        fields: "impressions,clicks,spend",
        level: "account",
        limit: "1",
      },
    }),
    runGraphTest({
      accessToken: pageToken,
      appsecretProof: buildMetaAppSecretProof(pageToken, config.appSecret),
      config,
      endpointPath: pageId && pageAccessToken ? `/${pageId}/posts` : null,
      id: "pages_read_engagement",
      missingDetail: pageId
        ? "Token da pagina nao retornado pela Meta. Reconecte a integracao e selecione uma Pagina administrada."
        : "Pagina do Facebook nao selecionada.",
      params: {
        fields: "id,created_time,message,permalink_url",
        limit: "1",
      },
    }),
    Promise.resolve(runLocalPermissionCheck({
      id: "facebook_publish_ready",
      grantedPermissions,
      permissionSourceReady,
      requirement: {
        all: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
      },
      assetReady: Boolean(pageId && pageAccessToken),
      missingAssetDetail: pageId
        ? "Pagina selecionada, mas sem Page access token salvo."
        : "Pagina Facebook nao selecionada.",
      readyDetail: "Pagina e permissoes de publicacao Facebook confirmadas.",
    })),
    runGraphTest({
      accessToken,
      appsecretProof,
      config,
      endpointPath: instagramBusinessId ? `/${instagramBusinessId}` : null,
      id: "instagram_profile",
      missingDetail: "Instagram Business nao selecionado.",
      params: {
        fields: "id,username,media_count",
      },
    }),
    Promise.resolve(runLocalPermissionCheck({
      id: "instagram_publish_ready",
      grantedPermissions,
      permissionSourceReady,
      requirement: {
        all: ["instagram_basic"],
        any: ["instagram_content_publish", "instagram_business_content_publish"],
      },
      assetReady: Boolean(instagramBusinessId),
      missingAssetDetail: "Instagram Business nao selecionado.",
      readyDetail: "Instagram Business e permissao de publicacao confirmados.",
    })),
    Promise.resolve(runLocalPermissionCheck({
      id: "social_agent_permissions",
      grantedPermissions,
      permissionSourceReady,
      requirement: {
        all: [
          "pages_manage_metadata",
          "pages_messaging",
          "instagram_manage_comments",
          "instagram_manage_messages",
        ],
      },
      assetReady: Boolean(pageId && pageAccessToken && instagramBusinessId),
      missingAssetDetail: "Selecione Pagina, Page token e Instagram Business para ativar agentes sociais Meta.",
      readyDetail: "Permissoes para Direct, Messenger e comentarios confirmadas.",
    })),
    runPageSubscriptionTest({
      config,
      pageAccessToken,
      pageId,
    }),
    Promise.resolve(runWebhookRuntimeCheck({
      appBaseUrl: getAppBaseUrl(),
      appSecretConfigured: Boolean(config.appSecret),
      verifyTokenConfigured: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN),
    })),
  ]);

  const readiness = summarizeMetaReviewReadiness(results, ranAt);
  const ok = readiness.blocked === 0;
  const failed = results.filter((result) => !result.ok && result.severity === "required");
  const summary = ok
    ? readiness.warning > 0
      ? `Meta pronto com ${readiness.warning} alerta(s) operacional(is).`
      : "Checklist Meta executado com sucesso."
    : `Checklist Meta com ${readiness.blocked} bloqueio(s).`;

  await updateIntegrationTestStatus({
    client,
    organizationId,
    ranAt,
    readiness,
    results,
    summary: ok ? null : failed.map((result) => `${result.permission}: ${result.detail}`).join(" | "),
    userId: workspace.user.id,
  });

  return NextResponse.json({
    ok,
    ranAt,
    readiness,
    summary,
    results,
  });
}

function buildMetaAppSecretProof(accessToken: string, appSecret: string) {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
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

async function loadOrganizationMetaIntegration(
  client: ReturnType<typeof createServiceClient>,
  organizationId: string,
) {
  const { data, error } = await client
    .from("organization_integrations")
    .select("id, scopes, metadata")
    .eq("organization_id", organizationId)
    .eq("provider_id", "meta-ads")
    .maybeSingle<OrganizationIntegrationRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

async function runDebugTokenTest(input: {
  accessToken: string;
  config: Awaited<ReturnType<typeof loadMetaGuidedOAuthConfig>>;
}): Promise<{ result: MetaReviewTestResult; grantedPermissions: string[] }> {
  const url = new URL(`https://graph.facebook.com/${input.config.graphVersion}/debug_token`);
  url.searchParams.set("input_token", input.accessToken);
  url.searchParams.set("access_token", `${input.config.appId}|${input.config.appSecret}`);

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => null) as unknown;
    const grantedPermissions = readDebugTokenPermissions(data);

    return {
      grantedPermissions,
      result: createMetaReviewResult({
        id: "oauth_permissions",
        ok: response.ok && grantedPermissions.length > 0,
        status: response.status,
        detail: response.ok
          ? `${grantedPermissions.length} permissao(oes) retornada(s) pelo debug_token.`
          : readGraphError(data),
        endpoint: sanitizeGraphUrl(url),
      }),
    };
  } catch (error) {
    return {
      grantedPermissions: [],
      result: createMetaReviewResult({
        id: "oauth_permissions",
        ok: false,
        detail: error instanceof Error ? error.message : "Nao foi possivel inspecionar permissoes Meta.",
        endpoint: sanitizeGraphUrl(url),
      }),
    };
  }
}

async function runGraphTest(input: {
  accessToken: string;
  appsecretProof: string;
  config: Awaited<ReturnType<typeof loadMetaGuidedOAuthConfig>>;
  endpointPath: string | null;
  id: MetaReviewCapabilityId;
  missingDetail: string | null;
  params: Record<string, string>;
}): Promise<MetaReviewTestResult> {
  if (!input.endpointPath) {
    return createMetaReviewResult({
      id: input.id,
      ok: false,
      detail: input.missingDetail ?? "Endpoint nao configurado.",
      endpoint: "not-configured",
    });
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

    return createMetaReviewResult({
      id: input.id,
      ok: response.ok,
      status: response.status,
      detail: response.ok ? readSuccessDetail(data) : readGraphError(data),
      endpoint: sanitizeGraphUrl(url),
    });
  } catch (error) {
    return createMetaReviewResult({
      id: input.id,
      ok: false,
      detail: error instanceof Error ? error.message : "Falha ao chamar a Graph API.",
      endpoint: sanitizeGraphUrl(url),
    });
  }
}

function runLocalPermissionCheck(input: {
  id: MetaReviewCapabilityId;
  grantedPermissions: string[];
  permissionSourceReady: boolean;
  requirement: Parameters<typeof hasMetaPermissionSet>[1];
  assetReady: boolean;
  missingAssetDetail: string;
  readyDetail: string;
}) {
  if (!input.assetReady) {
    return createMetaReviewResult({
      id: input.id,
      ok: false,
      detail: input.missingAssetDetail,
      endpoint: "local:assets",
    });
  }

  if (!input.permissionSourceReady) {
    return createMetaReviewResult({
      id: input.id,
      ok: false,
      detail: "Nao foi possivel confirmar permissoes aprovadas pelo debug_token.",
      endpoint: "local:permissions",
    });
  }

  const ok = hasMetaPermissionSet(input.grantedPermissions, input.requirement);

  return createMetaReviewResult({
    id: input.id,
    ok,
    detail: ok
      ? input.readyDetail
      : "Permissao ausente ou ainda nao aprovada para este recurso.",
    endpoint: "local:permissions",
  });
}

async function runPageSubscriptionTest(input: {
  config: Awaited<ReturnType<typeof loadMetaGuidedOAuthConfig>>;
  pageId: string;
  pageAccessToken: string;
}): Promise<MetaReviewTestResult> {
  if (!input.pageId || !input.pageAccessToken) {
    return createMetaReviewResult({
      id: "page_webhook_subscription",
      ok: false,
      detail: input.pageId
        ? "Pagina selecionada, mas sem Page access token para verificar subscription."
        : "Pagina Facebook nao selecionada.",
      endpoint: "not-configured",
    });
  }

  const url = new URL(`https://graph.facebook.com/${input.config.graphVersion}/${input.pageId}/subscribed_apps`);
  url.searchParams.set("fields", "id,name,subscribed_fields");
  url.searchParams.set("limit", "25");
  url.searchParams.set("access_token", input.pageAccessToken);
  url.searchParams.set("appsecret_proof", buildMetaAppSecretProof(input.pageAccessToken, input.config.appSecret));

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => null) as unknown;
    const subscribedFields = readPageSubscribedFields(data, input.config.appId);
    const subscription = summarizeMetaPageSubscription({
      requestedFields: metaPageWebhookFields,
      subscribedFields,
    });
    const ok = response.ok && subscribedFields.size > 0 && subscription.ok;

    return createMetaReviewResult({
      id: "page_webhook_subscription",
      ok,
      status: response.status,
      detail: response.ok
        ? ok
          ? "Pagina assinada para feed, mencoes e mensagens."
          : `Subscription encontrada com campos pendentes: ${subscription.missingFields.join(", ") || "app nao listado"}.`
        : readGraphError(data),
      endpoint: sanitizeGraphUrl(url),
    });
  } catch (error) {
    return createMetaReviewResult({
      id: "page_webhook_subscription",
      ok: false,
      detail: error instanceof Error ? error.message : "Nao foi possivel verificar subscription da Pagina.",
      endpoint: sanitizeGraphUrl(url),
    });
  }
}

function runWebhookRuntimeCheck(input: {
  appBaseUrl: string;
  appSecretConfigured: boolean;
  verifyTokenConfigured: boolean;
}) {
  const endpoint = `${input.appBaseUrl || "APP_URL"}/api/webhooks/meta`;
  const missing = [
    input.appBaseUrl ? null : "URL publica da aplicacao",
    input.appSecretConfigured ? null : "META_APP_SECRET",
    input.verifyTokenConfigured ? null : "META_WEBHOOK_VERIFY_TOKEN",
  ].filter((item): item is string => Boolean(item));

  return createMetaReviewResult({
    id: "webhook_runtime",
    ok: missing.length === 0,
    detail: missing.length
      ? `Configure: ${missing.join(", ")}.`
      : "Endpoint Meta pronto para verificacao e eventos assinados.",
    endpoint,
  });
}

async function updateIntegrationTestStatus(input: {
  client: ReturnType<typeof createServiceClient>;
  organizationId: string;
  ranAt: string;
  readiness: MetaReviewReadinessSummary;
  results: MetaReviewTestResult[];
  summary: string | null;
  userId: string;
}) {
  const { data } = await input.client
    .from("organization_integrations")
    .select("id, scopes, metadata")
    .eq("organization_id", input.organizationId)
    .eq("provider_id", "meta-ads")
    .maybeSingle<OrganizationIntegrationRow>();

  const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
  const reviewTest = {
    ran_at: input.ranAt,
    ok: input.readiness.blocked === 0,
    readiness: input.readiness,
    results: input.results.map((result) => ({
      id: result.id,
      label: result.label,
      permission: result.permission,
      permissions: result.permissions,
      surface: result.surface,
      severity: result.severity,
      ok: result.ok,
      status: result.status,
      detail: result.detail,
      endpoint: result.endpoint,
      action: result.action,
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
        status: "connected",
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

function readDebugTokenPermissions(value: unknown) {
  const data = readRecord(readRecord(value)?.data) ?? {};
  const scopes = new Set(readStringArray(data.scopes));

  for (const item of readArray(data.granular_scopes)) {
    const scope = readString(readRecord(item)?.scope);
    if (scope) scopes.add(scope);
  }

  return Array.from(scopes).sort();
}

function readPageSubscribedFields(value: unknown, appId: string) {
  const fields = new Set<string>();
  const data = readArray(readRecord(value)?.data);
  const appRows = data
    .map((item) => readRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => readString(item.id) === appId || data.length === 1);

  for (const row of appRows) {
    for (const field of readStringArray(row.subscribed_fields)) {
      fields.add(field);
    }
  }

  return fields;
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

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  fetchMetaPageAccessToken,
  loadMetaGuidedOAuthConfig,
  saveOAuthCredentials,
} from "@/lib/client-os/guided-oauth";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { type MetaWebhookIngestResult, ingestMetaWebhook } from "./webhook";
import {
  metaPageWebhookFields,
  normalizeMetaPageWebhookFields,
  summarizeMetaPageSubscription,
  type MetaPageWebhookField,
} from "./webhook-activation-policy";
import {
  createMetaWebhookSimulationPayload,
  type MetaWebhookSimulationScenario,
} from "./webhook-fixtures";

type JsonRecord = Record<string, unknown>;

type CredentialRow = {
  env_name: string | null;
  encrypted_value: string | null;
};

type OrganizationIntegrationRow = {
  id: string;
  organization_id: string;
  status: string | null;
  scopes: string[] | null;
  metadata: JsonRecord | null;
};

type MetaWebhookContext = {
  integration: OrganizationIntegrationRow;
  metadata: JsonRecord;
  credentials: Map<string, string>;
  config: Awaited<ReturnType<typeof loadMetaGuidedOAuthConfig>>;
  pageId: string;
  pageAccessToken: string;
  instagramBusinessId: string | null;
};

export type MetaWebhookActivationResult = {
  ok: boolean;
  pageId: string;
  requestedFields: MetaPageWebhookField[];
  subscribedFields: string[];
  missingFields: MetaPageWebhookField[];
  endpoint: string;
  httpStatus: number | null;
  detail: string;
  activatedAt: string;
  instagramAppDashboardRequired: boolean;
};

export type MetaWebhookSimulationResult = {
  scenario: MetaWebhookSimulationScenario;
  assetId: string;
  simulatedAt: string;
  detail: string;
  ingest: MetaWebhookIngestResult;
};

const metaCredentialEnvNames = [
  "META_ACCESS_TOKEN",
  "FACEBOOK_PAGE_ID",
  "FACEBOOK_PAGE_ACCESS_TOKEN",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
];

const simulationHistoryLimit = 10;
const activationHistoryLimit = 10;

export async function activateClientMetaWebhookSubscription(input: {
  userId: string;
  organizationId: string;
  fields?: unknown;
  client?: SupabaseClient;
}): Promise<MetaWebhookActivationResult> {
  const client = input.client ?? createServiceClient();
  await requireWritableCompanyAccess({
    client,
    organizationId: input.organizationId,
    userId: input.userId,
    action: "ativar webhooks Meta",
  });
  const context = await resolveMetaWebhookContext({
    actorId: input.userId,
    client,
    organizationId: input.organizationId,
  });
  const requestedFields = normalizeMetaPageWebhookFields(input.fields);
  const endpointUrl = new URL(`https://graph.facebook.com/${context.config.graphVersion}/${context.pageId}/subscribed_apps`);
  endpointUrl.searchParams.set("access_token", context.pageAccessToken);
  endpointUrl.searchParams.set("appsecret_proof", buildMetaAppSecretProof(context.pageAccessToken, context.config.appSecret));

  const response = await fetch(endpointUrl.toString(), {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      subscribed_fields: requestedFields.join(","),
    }),
  });
  const body = await response.json().catch(() => null) as unknown;

  if (!response.ok) {
    const result = buildActivationResult({
      activatedAt: new Date().toISOString(),
      detail: readGraphError(body),
      endpoint: sanitizeGraphUrl(endpointUrl),
      httpStatus: response.status,
      pageId: context.pageId,
      requestedFields,
      subscribedFields: [],
    });

    await persistActivationResult({
      actorId: input.userId,
      client,
      context,
      result,
    });

    throw new Error(result.detail);
  }

  const verification = await fetchMetaPageSubscribedFields({
    config: context.config,
    pageAccessToken: context.pageAccessToken,
    pageId: context.pageId,
  });
  const result = buildActivationResult({
    activatedAt: new Date().toISOString(),
    detail: verification.ok ? null : verification.detail,
    endpoint: sanitizeGraphUrl(endpointUrl),
    httpStatus: response.status,
    pageId: context.pageId,
    requestedFields,
    subscribedFields: verification.subscribedFields,
  });

  await persistActivationResult({
    actorId: input.userId,
    client,
    context,
    result,
  });

  return result;
}

export async function simulateClientMetaWebhook(input: {
  userId: string;
  organizationId: string;
  scenario: MetaWebhookSimulationScenario;
  client?: SupabaseClient;
}): Promise<MetaWebhookSimulationResult> {
  const client = input.client ?? createServiceClient();
  await requireWritableCompanyAccess({
    client,
    organizationId: input.organizationId,
    userId: input.userId,
    action: "simular webhooks Meta",
  });
  const integration = await loadMetaIntegration(client, input.organizationId);
  const metadata = readRecord(integration.metadata);
  const credentials = await loadOrganizationMetaCredentials(client, input.organizationId);
  const fixture = createMetaWebhookSimulationPayload({
    scenario: input.scenario,
    facebookPageId: resolvePageId(credentials, metadata),
    instagramBusinessId: resolveInstagramBusinessId(credentials, metadata),
    suffix: randomUUID(),
  });
  const simulatedAt = new Date().toISOString();
  const ingest = await ingestMetaWebhook({
    client,
    headers: new Headers({
      "x-connectyhub-simulation": "meta-webhook",
      "x-connectyhub-scenario": input.scenario,
    }),
    payload: fixture.payload,
  });
  const result: MetaWebhookSimulationResult = {
    scenario: input.scenario,
    assetId: fixture.assetId,
    simulatedAt,
    detail: `Simulacao ${input.scenario}: ${ingest.normalized} normalizado(s), ${ingest.unmapped} nao mapeado(s), ${ingest.failed} falha(s).`,
    ingest,
  };

  await persistSimulationResult({
    actorId: input.userId,
    client,
    integration,
    metadata,
    organizationId: input.organizationId,
    result,
  });

  return result;
}

async function resolveMetaWebhookContext(input: {
  actorId: string;
  client: SupabaseClient;
  organizationId: string;
}): Promise<MetaWebhookContext> {
  const [integration, credentials, config] = await Promise.all([
    loadMetaIntegration(input.client, input.organizationId),
    loadOrganizationMetaCredentials(input.client, input.organizationId),
    loadMetaGuidedOAuthConfig({ client: input.client }),
  ]);
  const metadata = readRecord(integration.metadata);
  const accessToken = readString(credentials.get("META_ACCESS_TOKEN"));
  const pageId = resolvePageId(credentials, metadata);
  const instagramBusinessId = resolveInstagramBusinessId(credentials, metadata);
  let pageAccessToken = readString(credentials.get("FACEBOOK_PAGE_ACCESS_TOKEN")) ?? "";

  if (!pageId) {
    throw new Error("Selecione uma Pagina Facebook na integracao Meta antes de ativar webhooks.");
  }

  if (!pageAccessToken) {
    if (!accessToken) {
      throw new Error("Reconecte a Meta para gerar o Page access token da Pagina selecionada.");
    }

    pageAccessToken = await fetchMetaPageAccessToken({
      accessToken,
      config,
      pageId,
    }) ?? "";

    if (pageAccessToken) {
      await saveOAuthCredentials({
        actorId: input.actorId,
        client: input.client,
        organizationId: input.organizationId,
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

  if (!pageAccessToken) {
    throw new Error("A Meta nao retornou Page access token. Reconecte com pages_show_list e pages_manage_metadata aprovadas.");
  }

  return {
    config,
    credentials,
    integration,
    instagramBusinessId,
    metadata,
    pageAccessToken,
    pageId,
  };
}

async function fetchMetaPageSubscribedFields(input: {
  config: Awaited<ReturnType<typeof loadMetaGuidedOAuthConfig>>;
  pageAccessToken: string;
  pageId: string;
}) {
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

    if (!response.ok) {
      return {
        ok: false,
        detail: readGraphError(data),
        subscribedFields: [] as string[],
      };
    }

    return {
      ok: true,
      detail: null,
      subscribedFields: Array.from(readPageSubscribedFields(data, input.config.appId)),
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "Nao foi possivel verificar os campos assinados na Pagina.",
      subscribedFields: [] as string[],
    };
  }
}

function buildActivationResult(input: {
  activatedAt: string;
  detail: string | null;
  endpoint: string;
  httpStatus: number | null;
  pageId: string;
  requestedFields: MetaPageWebhookField[];
  subscribedFields: string[];
}): MetaWebhookActivationResult {
  const summary = summarizeMetaPageSubscription({
    requestedFields: input.requestedFields,
    subscribedFields: input.subscribedFields,
  });
  const ok = summary.ok;
  const detail = input.detail
    ?? (ok
      ? "Pagina assinada para feed, mencoes, Messenger e postbacks."
      : `Subscription criada, mas campos pendentes: ${summary.missingFields.join(", ")}.`);

  return {
    ok,
    pageId: input.pageId,
    requestedFields: [...input.requestedFields],
    subscribedFields: summary.subscribedFields,
    missingFields: summary.missingFields,
    endpoint: input.endpoint,
    httpStatus: input.httpStatus,
    detail,
    activatedAt: input.activatedAt,
    instagramAppDashboardRequired: true,
  };
}

async function persistActivationResult(input: {
  actorId: string;
  client: SupabaseClient;
  context: MetaWebhookContext;
  result: MetaWebhookActivationResult;
}) {
  const nextMetadata = {
    ...input.context.metadata,
    facebook_page_id: input.context.pageId,
    selected_facebook_page_id: input.context.pageId,
    instagram_business_id: input.context.instagramBusinessId,
    selected_instagram_business_id: input.context.instagramBusinessId,
    webhook_activation: input.result,
    webhook_activation_history: prependHistory(
      input.context.metadata.webhook_activation_history,
      input.result,
      activationHistoryLimit,
    ),
    webhook_fields: [...metaPageWebhookFields],
    instagram_webhook_setup: {
      required_in_app_dashboard: true,
      updated_at: input.result.activatedAt,
    },
  };

  await input.client
    .from("organization_integrations")
    .update({
      last_error: input.result.ok ? null : input.result.detail,
      last_sync_at: input.result.activatedAt,
      metadata: nextMetadata,
      status: "connected",
      updated_at: input.result.activatedAt,
    })
    .eq("id", input.context.integration.id);

  await input.client.from("integration_action_logs").insert({
    organization_id: input.context.integration.organization_id,
    organization_integration_id: input.context.integration.id,
    provider_id: "meta-ads",
    actor_id: input.actorId,
    action: "meta.webhook.subscribe",
    status: input.result.ok ? "success" : "warning",
    metadata: input.result,
  });
}

async function persistSimulationResult(input: {
  actorId: string;
  client: SupabaseClient;
  integration: OrganizationIntegrationRow;
  metadata: JsonRecord;
  organizationId: string;
  result: MetaWebhookSimulationResult;
}) {
  await input.client
    .from("organization_integrations")
    .update({
      last_error: input.result.ingest.failed > 0 || input.result.ingest.unmapped > 0 ? input.result.detail : null,
      last_sync_at: input.result.simulatedAt,
      metadata: {
        ...input.metadata,
        webhook_simulation: input.result,
        webhook_simulation_history: prependHistory(
          input.metadata.webhook_simulation_history,
          input.result,
          simulationHistoryLimit,
        ),
      },
      status: "connected",
      updated_at: input.result.simulatedAt,
    })
    .eq("id", input.integration.id);

  await input.client.from("integration_action_logs").insert({
    organization_id: input.organizationId,
    organization_integration_id: input.integration.id,
    provider_id: "meta-ads",
    actor_id: input.actorId,
    action: "meta.webhook.simulate",
    status: input.result.ingest.normalized > 0 && input.result.ingest.failed === 0 ? "success" : "warning",
    metadata: input.result,
  });
}

async function requireWritableCompanyAccess(input: {
  action: string;
  client: SupabaseClient;
  organizationId: string;
  userId: string;
}) {
  const company = await requireClientCompanyAccess({
    client: input.client,
    companyId: input.organizationId,
    userId: input.userId,
  });

  if (!["owner", "admin"].includes(company.role)) {
    throw new Error(`Somente dono ou admin da empresa pode ${input.action}.`);
  }

  return company;
}

async function loadMetaIntegration(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("organization_integrations")
    .select("id, organization_id, status, scopes, metadata")
    .eq("organization_id", organizationId)
    .eq("provider_id", "meta-ads")
    .maybeSingle<OrganizationIntegrationRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.status === "disabled") {
    throw new Error("Conecte a integracao Meta antes de ativar webhooks.");
  }

  return data;
}

async function loadOrganizationMetaCredentials(client: SupabaseClient, organizationId: string) {
  const credentials = new Map<string, string>();
  const { data, error } = await client
    .from("integration_credentials")
    .select("env_name, encrypted_value")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("integration_id", "meta")
    .in("env_name", metaCredentialEnvNames)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as CredentialRow[]) {
    if (!row.env_name || !row.encrypted_value || credentials.has(row.env_name)) {
      continue;
    }

    credentials.set(row.env_name, decryptCredentialValue(row.encrypted_value));
  }

  return credentials;
}

function resolvePageId(credentials: Map<string, string>, metadata: JsonRecord) {
  return readString(credentials.get("FACEBOOK_PAGE_ID"))
    ?? readString(metadata.selected_facebook_page_id)
    ?? readString(metadata.facebook_page_id)
    ?? null;
}

function resolveInstagramBusinessId(credentials: Map<string, string>, metadata: JsonRecord) {
  return readString(credentials.get("INSTAGRAM_BUSINESS_ACCOUNT_ID"))
    ?? readString(metadata.selected_instagram_business_id)
    ?? readString(metadata.instagram_business_id)
    ?? null;
}

function buildMetaAppSecretProof(accessToken: string, appSecret: string) {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

function readPageSubscribedFields(value: unknown, appId: string) {
  const fields = new Set<string>();
  const data = readArray(readRecord(value)?.data);
  const appRows = data
    .map((item) => readRecord(item))
    .filter((item): item is JsonRecord => Boolean(item))
    .filter((item) => readString(item.id) === appId || data.length === 1);

  for (const row of appRows) {
    for (const field of readStringArray(row.subscribed_fields)) {
      fields.add(field);
    }
  }

  return fields;
}

function prependHistory(value: unknown, item: JsonRecord, limit: number) {
  return [
    item,
    ...readArray(value).flatMap((entry) => {
      const record = readOptionalRecord(entry);
      return record ? [record] : [];
    }),
  ].slice(0, limit);
}

function sanitizeGraphUrl(url: URL) {
  const safe = new URL(url.toString());
  safe.searchParams.delete("access_token");
  safe.searchParams.delete("appsecret_proof");

  return `${safe.pathname}${safe.search}`;
}

function readGraphError(value: unknown) {
  if (!value || typeof value !== "object") {
    return "Meta nao retornou detalhes do erro.";
  }

  const error = (value as JsonRecord).error;

  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return "Meta recusou a chamada sem detalhe estruturado.";
  }

  const record = error as JsonRecord;
  const message = typeof record.message === "string" ? record.message : null;
  const code = typeof record.code === "number" || typeof record.code === "string" ? String(record.code) : null;

  return [message, code ? `codigo ${code}` : null].filter(Boolean).join(" - ") || "Meta recusou a chamada.";
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readOptionalRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
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

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

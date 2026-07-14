import "server-only";

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntegrationProviders } from "@/lib/client-os/integrations";
import {
  decryptCredentialValue,
  encryptCredentialValue,
  hashCredentialValue,
  previewCredentialValue,
} from "@/lib/security/credentials-crypto";

export type GuidedOAuthProviderId = "meta-ads" | "google-growth";
export type GuidedOAuthProviderKind = "meta" | "google";

type PlatformCredentialRow = {
  env_name: string;
  encrypted_value: string | null;
};

type CredentialKind = "secret" | "public" | "endpoint" | "identifier";
type CredentialRequirement = "required" | "recommended" | "optional";

export type GuidedOAuthConfig = {
  kind: GuidedOAuthProviderKind;
  providerId: GuidedOAuthProviderId;
  integrationId: "meta" | "google-ads";
  displayName: string;
};

export type GoogleGuidedOAuthConfig = {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  redirectUri: string;
  scopes: string[];
  apiVersion: string;
  loginCustomerId: string | null;
};

export type MetaGuidedOAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  permissions: string[];
  graphVersion: string;
  loginConfigId: string | null;
};

export type OAuthCredentialInput = {
  integrationId: "meta" | "google-ads";
  envName: string;
  label: string;
  kind: CredentialKind;
  requirement: CredentialRequirement;
  value: string;
};

export type GuidedOAuthAssetOption = {
  id: string;
  label: string;
  parentId?: string | null;
  status?: string | null;
};

export const guidedOAuthConfigs: Record<GuidedOAuthProviderKind, GuidedOAuthConfig> = {
  google: {
    kind: "google",
    providerId: "google-growth",
    integrationId: "google-ads",
    displayName: "Google",
  },
  meta: {
    kind: "meta",
    providerId: "meta-ads",
    integrationId: "meta",
    displayName: "Meta",
  },
};

const googlePlatformCredentialNames = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "GOOGLE_ENABLED_SCOPES",
  "GOOGLE_ADS_API_VERSION",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
];

const metaPlatformCredentialNames = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_OAUTH_REDIRECT_URI",
  "META_ENABLED_PERMISSIONS",
  "META_GRAPH_API_VERSION",
  "META_LOGIN_CONFIG_ID",
];

export const googleOrganizationCredentialNames = [
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_SEARCH_CONSOLE_SITE_URL",
];

export const metaOrganizationCredentialNames = [
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
  "FACEBOOK_PAGE_ID",
];

const defaultGoogleScopes = [
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/calendar",
];

const googleScopeAliases: Record<string, string> = {
  adwords: "https://www.googleapis.com/auth/adwords",
  "analytics.readonly": "https://www.googleapis.com/auth/analytics.readonly",
  "webmasters.readonly": "https://www.googleapis.com/auth/webmasters.readonly",
  "business.manage": "https://www.googleapis.com/auth/business.manage",
  calendar: "https://www.googleapis.com/auth/calendar",
};

const defaultMetaPermissions = [
  "ads_read",
  "ads_management",
  "business_management",
  "read_insights",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_ads",
  "leads_retrieval",
  "instagram_basic",
  "instagram_manage_insights",
];

export function getGuidedOAuthConfig(kind: GuidedOAuthProviderKind) {
  return guidedOAuthConfigs[kind];
}

export async function loadGoogleGuidedOAuthConfig(input: { client?: SupabaseClient } = {}): Promise<GoogleGuidedOAuthConfig> {
  const credentials = await loadPlatformCredentialMap(input.client, "google-ads", googlePlatformCredentialNames);
  const clientId = getCredentialValue(credentials, ["GOOGLE_ADS_CLIENT_ID"]);
  const clientSecret = getCredentialValue(credentials, ["GOOGLE_ADS_CLIENT_SECRET"]);
  const developerToken = getCredentialValue(credentials, ["GOOGLE_ADS_DEVELOPER_TOKEN"]);
  const redirectUri = getCredentialValue(credentials, ["GOOGLE_OAUTH_REDIRECT_URI"])
    || `${getAppBaseUrl()}/api/dashboard/integrations/google/callback`;
  const scopes = normalizeGoogleScopes(getCredentialValue(credentials, ["GOOGLE_ENABLED_SCOPES"]));
  const apiVersion = normalizeVersion(getCredentialValue(credentials, ["GOOGLE_ADS_API_VERSION"]) || "v24");
  const loginCustomerId = normalizeGoogleCustomerId(getCredentialValue(credentials, ["GOOGLE_ADS_LOGIN_CUSTOMER_ID"])) || null;

  if (!clientId || !clientSecret || !developerToken) {
    throw new Error("Configure Google OAuth Client ID, Client Secret e Developer Token na sala de manutencao.");
  }

  return {
    clientId,
    clientSecret,
    developerToken,
    redirectUri,
    scopes,
    apiVersion,
    loginCustomerId,
  };
}

export async function loadMetaGuidedOAuthConfig(input: { client?: SupabaseClient } = {}): Promise<MetaGuidedOAuthConfig> {
  const credentials = await loadPlatformCredentialMap(input.client, "meta", metaPlatformCredentialNames);
  const appId = getCredentialValue(credentials, ["META_APP_ID"]);
  const appSecret = getCredentialValue(credentials, ["META_APP_SECRET"]);
  const redirectUri = getCredentialValue(credentials, ["META_OAUTH_REDIRECT_URI"])
    || `${getAppBaseUrl()}/api/dashboard/integrations/meta/callback`;
  const permissions = normalizeMetaPermissions(getCredentialValue(credentials, ["META_ENABLED_PERMISSIONS"]));
  const graphVersion = normalizeVersion(getCredentialValue(credentials, ["META_GRAPH_API_VERSION"]) || "v23.0");
  const loginConfigId = getCredentialValue(credentials, ["META_LOGIN_CONFIG_ID"]) || null;

  if (!appId || !appSecret) {
    throw new Error("Configure Meta App ID e App Secret na sala de manutencao.");
  }

  return {
    appId,
    appSecret,
    redirectUri,
    permissions,
    graphVersion,
    loginConfigId,
  };
}

export function buildGoogleAuthorizationUrl(input: {
  config: GoogleGuidedOAuthConfig;
  state: string;
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.config.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);

  return url.toString();
}

export function buildMetaAuthorizationUrl(input: {
  config: MetaGuidedOAuthConfig;
  state: string;
}) {
  const url = new URL(`https://www.facebook.com/${input.config.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", input.config.appId);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("response_type", "code");

  if (input.config.loginConfigId) {
    url.searchParams.set("config_id", input.config.loginConfigId);
    url.searchParams.set("override_default_response_type", "true");
    url.searchParams.set("auth_type", "rerequest");
  } else {
    url.searchParams.set("scope", input.config.permissions.join(","));
  }

  return url.toString();
}

export async function exchangeGoogleAuthorizationCode(input: {
  code: string;
  config: GoogleGuidedOAuthConfig;
}) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: input.config.redirectUri,
    }),
  });
  const body = await response.json().catch(() => null) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !body?.access_token) {
    throw new Error(body?.error_description ?? body?.error ?? "Google nao retornou access token.");
  }

  if (!body.refresh_token) {
    throw new Error("Google autorizou, mas nao retornou refresh token. Tente reconectar e confirme o consentimento.");
  }

  return body;
}

export async function exchangeMetaAuthorizationCode(input: {
  code: string;
  config: MetaGuidedOAuthConfig;
}) {
  const tokenUrl = new URL(`https://graph.facebook.com/${input.config.graphVersion}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", input.config.appId);
  tokenUrl.searchParams.set("client_secret", input.config.appSecret);
  tokenUrl.searchParams.set("redirect_uri", input.config.redirectUri);
  tokenUrl.searchParams.set("code", input.code);

  const response = await fetch(tokenUrl.toString(), { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => null) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || !body?.access_token) {
    throw new Error(body?.error?.message ?? "Meta nao retornou access token.");
  }

  const longLived = await exchangeMetaLongLivedToken({
    accessToken: body.access_token,
    config: input.config,
  }).catch(() => null);

  return longLived ?? body;
}

export async function listGoogleAdsAccessibleCustomers(input: {
  accessToken: string;
  config: GoogleGuidedOAuthConfig;
}) {
  const result = await fetchJson(`https://googleads.googleapis.com/${input.config.apiVersion}/customers:listAccessibleCustomers`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.accessToken}`,
      "developer-token": input.config.developerToken,
      ...(input.config.loginCustomerId ? { "login-customer-id": input.config.loginCustomerId } : {}),
    },
  });

  if (!result.ok) {
    return [];
  }

  const resourceNames = result.data && typeof result.data === "object"
    ? (result.data as Record<string, unknown>).resourceNames
    : null;

  return Array.isArray(resourceNames)
    ? resourceNames
        .filter((item): item is string => typeof item === "string")
        .map((resourceName) => normalizeGoogleCustomerId(resourceName.replace(/^customers\//, "")))
        .filter(Boolean)
    : [];
}

export async function listMetaConnectionAssets(input: {
  accessToken: string;
  config: MetaGuidedOAuthConfig;
}) {
  const appsecretProof = buildMetaAppSecretProof(input.accessToken, input.config.appSecret);
  const accountUrl = new URL(`https://graph.facebook.com/${input.config.graphVersion}/me/adaccounts`);
  accountUrl.searchParams.set("fields", "id,account_id,name,account_status,currency");
  accountUrl.searchParams.set("limit", "50");
  accountUrl.searchParams.set("access_token", input.accessToken);
  accountUrl.searchParams.set("appsecret_proof", appsecretProof);

  const pagesUrl = new URL(`https://graph.facebook.com/${input.config.graphVersion}/me/accounts`);
  pagesUrl.searchParams.set("fields", "id,name,instagram_business_account{id,username}");
  pagesUrl.searchParams.set("limit", "50");
  pagesUrl.searchParams.set("access_token", input.accessToken);
  pagesUrl.searchParams.set("appsecret_proof", appsecretProof);

  const [accountsResult, pagesResult] = await Promise.all([
    fetchJson(accountUrl.toString(), { headers: { Accept: "application/json" } }),
    fetchJson(pagesUrl.toString(), { headers: { Accept: "application/json" } }).catch(() => ({ ok: false, data: null })),
  ]);
  const adAccounts = readMetaDataArray(accountsResult.data);
  const pages = pagesResult.ok ? readMetaDataArray(pagesResult.data) : [];
  const firstAdAccount = adAccounts.find((account) => readNumber(account.account_status) === 1) ?? adAccounts[0] ?? null;
  const firstPage = pages[0] ?? null;
  const instagramAccount = firstPage?.instagram_business_account && typeof firstPage.instagram_business_account === "object"
    ? firstPage.instagram_business_account as Record<string, unknown>
    : null;
  const adAccountOptions = adAccounts.map((account) => {
    const id = normalizeMetaAdAccountId(readString(account.id) || readString(account.account_id));

    return {
      id,
      label: readString(account.name) || id,
      status: readString(account.account_status),
    };
  }).filter((account) => account.id);
  const pageOptions = pages.map((page) => {
    const id = readString(page.id) ?? "";

    return {
      id,
      label: readString(page.name) || id,
    };
  }).filter((page) => page.id);
  const instagramOptions = pages.flatMap((page) => {
    const pageId = readString(page.id);
    const instagram = page.instagram_business_account && typeof page.instagram_business_account === "object"
      ? page.instagram_business_account as Record<string, unknown>
      : null;
    const id = readString(instagram?.id);

    if (!id) {
      return [];
    }

    return [{
      id,
      label: readString(instagram?.username) || id,
      parentId: pageId,
    }];
  });

  return {
    adAccountId: normalizeMetaAdAccountId(readString(firstAdAccount?.id) || readString(firstAdAccount?.account_id)),
    adAccountLabel: readString(firstAdAccount?.name) || normalizeMetaAdAccountId(readString(firstAdAccount?.id) || readString(firstAdAccount?.account_id)),
    pageId: readString(firstPage?.id),
    pageLabel: readString(firstPage?.name),
    instagramBusinessId: readString(instagramAccount?.id),
    instagramLabel: readString(instagramAccount?.username),
    adAccounts: adAccountOptions,
    pages: pageOptions,
    instagramAccounts: instagramOptions,
  };
}

export async function ensureGuidedOAuthProvider(input: {
  client: SupabaseClient;
  providerId: GuidedOAuthProviderId;
}) {
  const provider = getIntegrationProviders().find((item) => item.id === input.providerId);

  if (!provider) {
    throw new Error("Integracao guiada nao encontrada no catalogo.");
  }

  const { error } = await input.client.from("integration_providers").upsert({
    id: provider.id,
    name: provider.name,
    category: provider.category,
    status: provider.status,
    mode: provider.mode,
    auth_type: "oauth",
    headline: provider.headline,
    description: provider.summary,
    feature_flags: { guided_oauth: true, read_only_first: true, future_ai_operations: true },
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertGuidedOAuthConnection(input: {
  client: SupabaseClient;
  organizationId: string;
  providerId: GuidedOAuthProviderId;
  status: "pending" | "connected" | "disabled" | "error";
  label: string;
  externalAccountId?: string | null;
  externalAccountLabel?: string | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  actorId?: string | null;
  lastError?: string | null;
}) {
  await ensureGuidedOAuthProvider({ client: input.client, providerId: input.providerId });

  const now = new Date().toISOString();
  const { data, error } = await input.client
    .from("organization_integrations")
    .upsert({
      organization_id: input.organizationId,
      provider_id: input.providerId,
      status: input.status,
      connection_label: input.label,
      external_account_id: input.externalAccountId ?? null,
      external_account_label: input.externalAccountLabel ?? null,
      auth_kind: "oauth",
      scopes: input.scopes ?? [],
      last_sync_at: input.status === "connected" ? now : null,
      last_test_at: now,
      last_error: input.lastError ?? null,
      metadata: input.metadata ?? {},
      connected_by: input.status === "connected" ? input.actorId ?? null : null,
      connected_at: input.status === "connected" ? now : null,
      updated_at: now,
    }, { onConflict: "organization_id,provider_id" })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar a conexao guiada.");
  }

  return data.id;
}

export async function saveOAuthCredentials(input: {
  client: SupabaseClient;
  organizationId: string;
  actorId: string;
  credentials: OAuthCredentialInput[];
}) {
  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY nao configurada.");
  }

  const saved: string[] = [];

  for (const credential of input.credentials) {
    if (!credential.value.trim()) {
      continue;
    }

    const payload = {
      scope: "organization",
      organization_id: input.organizationId,
      integration_id: credential.integrationId,
      env_name: credential.envName,
      label: credential.label,
      kind: credential.kind,
      requirement: credential.requirement,
      encrypted_value: encryptCredentialValue(credential.value),
      value_preview: previewCredentialValue(credential.value, credential.kind),
      value_hash: hashCredentialValue(credential.value),
      configured_by: input.actorId,
    };

    const { data: existing, error: lookupError } = await input.client
      .from("integration_credentials")
      .select("id")
      .eq("scope", "organization")
      .eq("organization_id", input.organizationId)
      .eq("integration_id", credential.integrationId)
      .eq("env_name", credential.envName)
      .maybeSingle<{ id: string }>();

    if (lookupError) {
      throw new Error(lookupError.message);
    }

    const query = existing
      ? input.client.from("integration_credentials").update(payload).eq("id", existing.id)
      : input.client.from("integration_credentials").insert(payload);
    const { error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    saved.push(credential.envName);
  }

  return saved;
}

export async function deleteOAuthCredentials(input: {
  client: SupabaseClient;
  organizationId: string;
  integrationId: "meta" | "google-ads";
  envNames: string[];
}) {
  if (input.envNames.length === 0) {
    return;
  }

  const { error } = await input.client
    .from("integration_credentials")
    .delete()
    .eq("scope", "organization")
    .eq("organization_id", input.organizationId)
    .eq("integration_id", input.integrationId)
    .in("env_name", input.envNames);

  if (error) {
    throw new Error(error.message);
  }
}

export async function disconnectGuidedOAuth(input: {
  client: SupabaseClient;
  organizationId: string;
  providerId: GuidedOAuthProviderId;
  actorId: string;
}) {
  const config = input.providerId === "meta-ads" ? guidedOAuthConfigs.meta : guidedOAuthConfigs.google;
  const envNames = input.providerId === "meta-ads" ? metaOrganizationCredentialNames : googleOrganizationCredentialNames;
  const now = new Date().toISOString();

  await deleteOAuthCredentials({
    client: input.client,
    organizationId: input.organizationId,
    integrationId: config.integrationId,
    envNames,
  });

  const integrationId = await upsertGuidedOAuthConnection({
    client: input.client,
    organizationId: input.organizationId,
    providerId: input.providerId,
    status: "disabled",
    label: `${config.displayName} desconectado`,
    metadata: {
      source: "dashboard_integrations",
      disconnected_by: input.actorId,
      disconnected_at: now,
    },
    actorId: input.actorId,
  });

  await logIntegrationAction({
    client: input.client,
    organizationId: input.organizationId,
    organizationIntegrationId: integrationId,
    providerId: input.providerId,
    actorId: input.actorId,
    action: "oauth.disconnected",
    metadata: { credential_envs: envNames },
  });
}

export async function logIntegrationAction(input: {
  client: SupabaseClient;
  organizationId: string;
  organizationIntegrationId: string | null;
  providerId: GuidedOAuthProviderId;
  actorId: string;
  action: string;
  status?: "success" | "warning" | "error";
  metadata?: Record<string, unknown>;
}) {
  await input.client.from("integration_action_logs").insert({
    organization_id: input.organizationId,
    organization_integration_id: input.organizationIntegrationId,
    provider_id: input.providerId,
    actor_id: input.actorId,
    action: input.action,
    status: input.status ?? "success",
    metadata: input.metadata ?? {},
  });
}

export function getAppBaseUrl() {
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null;
  const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || productionUrl
    || deploymentUrl
    || "http://localhost:3000";

  return baseUrl.replace(/\/+$/, "");
}

export function normalizeGoogleCustomerId(value: string | null | undefined) {
  return value?.trim().replace(/^customers\//, "").replace(/\D/g, "") ?? "";
}

export function normalizeMetaAdAccountId(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed.replace(/^act_/, "")}`;
}

export function readOAuthReturnReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("CREDENTIAL_ENCRYPTION_KEY")) return "encryption";
  if (message.includes("Configure")) return "config";
  if (message.includes("migration") || message.includes("relation")) return "schema";
  if (message.includes("refresh token")) return "refresh_token";

  return "oauth_failed";
}

async function exchangeMetaLongLivedToken(input: {
  accessToken: string;
  config: MetaGuidedOAuthConfig;
}) {
  const url = new URL(`https://graph.facebook.com/${input.config.graphVersion}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", input.config.appId);
  url.searchParams.set("client_secret", input.config.appSecret);
  url.searchParams.set("fb_exchange_token", input.accessToken);

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => null) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || !body?.access_token) {
    throw new Error(body?.error?.message ?? "Meta nao retornou token de longa duracao.");
  }

  return body;
}

async function loadPlatformCredentialMap(client: SupabaseClient | undefined, integrationId: string, envNames: string[]) {
  const credentials = new Map<string, string>();

  if (client) {
    const { data, error } = await client
      .from("integration_credentials")
      .select("env_name, encrypted_value")
      .eq("scope", "platform")
      .eq("integration_id", integrationId)
      .is("organization_id", null)
      .in("env_name", envNames)
      .order("updated_at", { ascending: false });

    if (!error) {
      for (const credential of (data ?? []) as PlatformCredentialRow[]) {
        if (!credential.env_name || !credential.encrypted_value || credentials.has(credential.env_name)) {
          continue;
        }

        try {
          credentials.set(credential.env_name, decryptCredentialValue(credential.encrypted_value));
        } catch {
          // Environment fallback below keeps the app usable during key rotation.
        }
      }
    }
  }

  for (const envName of envNames) {
    const fallback = process.env[envName]?.trim();

    if (fallback && !credentials.has(envName)) {
      credentials.set(envName, fallback);
    }
  }

  return credentials;
}

function getCredentialValue(credentials: Map<string, string>, envNames: string[]) {
  for (const envName of envNames) {
    const value = credentials.get(envName) ?? process.env[envName];

    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

function normalizeGoogleScopes(value: string) {
  const scopes = parseList(value).map((scope) => googleScopeAliases[scope] ?? scope);
  return unique(scopes.length ? scopes : defaultGoogleScopes);
}

function normalizeMetaPermissions(value: string) {
  const permissions = parseList(value);
  return unique(permissions.length ? permissions : defaultMetaPermissions);
}

function parseList(value: string) {
  return value
    .split(/[\n, ]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeVersion(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function buildMetaAppSecretProof(accessToken: string, appSecret: string) {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null) as unknown;

  return { ok: response.ok, status: response.status, data };
}

function readMetaDataArray(value: unknown) {
  if (!value || typeof value !== "object") {
    return [] as Record<string, unknown>[];
  }

  const data = (value as Record<string, unknown>).data;
  return Array.isArray(data)
    ? data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  return null;
}

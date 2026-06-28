import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { decryptCredentialValue, encryptCredentialValue, previewCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveUazapiWhatsappStatus } from "@/lib/uazapi/status";
import {
  buildWhatsappInstanceProfileImageMetadata,
  getWhatsappInstanceProfileImage,
  readWhatsappInstanceProfileImageUrl,
} from "@/lib/whatsapp/instance-profile-image";
import {
  normalizeWhatsappInstanceDisplayName,
  resolveWhatsappInstanceDisplayName,
} from "@/lib/whatsapp/instance-display-name";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";

type JsonRecord = Record<string, unknown>;

const DEFAULT_CLIENT_WEBHOOK_PATH = "/api/webhooks/connectyhub";

export type GatewayScope =
  | "instances:read"
  | "instances:write"
  | "messages:send"
  | "webhooks:read"
  | "webhooks:write"
  | "provider:proxy"
  | "uazapi:proxy";

export type GatewayApiClientStatus = "active" | "paused" | "archived";
export type GatewayApiKeyStatus = "active" | "paused" | "revoked";

export type GatewayAuthContext = {
  client: SupabaseClient;
  apiClient: ApiClientRow;
  apiKey: ApiKeyRow;
};

export type ApiClientRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string | null;
  status: GatewayApiClientStatus;
  contact_email: string | null;
  plan_code: string | null;
  monthly_message_limit: number | null;
  metadata: JsonRecord | null;
  created_at: string;
  updated_at: string;
};

type ApiKeyRow = {
  id: string;
  client_id: string;
  organization_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[] | null;
  status: GatewayApiKeyStatus;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
};

type ApiKeySafeRow = Omit<ApiKeyRow, "key_hash"> & {
  key_hash?: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  plan_code: string | null;
  status: string | null;
};

type GatewayInstanceRow = {
  id: string;
  organization_id: string;
  connectyhub_api_client_id: string | null;
  connectyhub_api_instance_id: string;
  connectyhub_api_visibility: "internal" | "api_customer" | "hybrid";
  provider: string;
  provider_instance_id: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: "draft" | "qr_pending" | "connected" | "disconnected" | "blocked" | "error" | "archived";
  qr_status: string | null;
  instance_token_preview: string | null;
  instance_token_encrypted: string | null;
  webhook_url: string | null;
  webhook_configured_at: string | null;
  last_synced_at: string | null;
  last_heartbeat_at: string | null;
  last_message_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  metadata: JsonRecord | null;
  provider_payload?: JsonRecord | null;
  updated_at: string;
};

type GatewayClientAgentRow = {
  id: string;
  organization_id: string | null;
  agent_code: string | null;
  name: string | null;
  persona_name: string | null;
  metadata: JsonRecord | null;
};

type WebhookEndpointRow = {
  id: string;
  client_id: string;
  organization_id: string;
  url: string;
  description: string | null;
  status: "active" | "paused" | "archived";
  events: string[] | null;
  secret_preview: string | null;
  secret_encrypted?: string | null;
  created_at: string;
  updated_at: string;
};

type WebhookEndpointSafeRow = WebhookEndpointRow & {
  last_success_at?: string | null;
  last_failure_at?: string | null;
};

type WebhookDeliveryRow = {
  id: string;
  endpoint_id: string | null;
  client_id: string | null;
  organization_id: string | null;
  whatsapp_instance_id: string | null;
  webhook_event_id: string | null;
  event_type: string;
  target_url: string;
  status: "queued" | "delivered" | "failed";
  status_code: number | null;
  attempt_count: number;
  error_message: string | null;
  payload: JsonRecord | null;
  response_preview: string | null;
  delivered_at: string | null;
  created_at: string;
};

type ProviderWebhookEventRow = {
  id: string;
  provider: string;
  event_type: string;
  provider_instance_id: string | null;
  whatsapp_instance_id: string | null;
  organization_id: string | null;
  provider_message_id: string | null;
  provider_chat_id: string | null;
  processing_status: string;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  created_at: string;
};

type ApiUsageEventRow = {
  id: string;
  client_id: string | null;
  organization_id: string | null;
  whatsapp_instance_id: string | null;
  request_id: string | null;
  method: string;
  endpoint: string;
  status_code: number | null;
  unit_type: string;
  quantity: number;
  provider: string | null;
  provider_status: number | null;
  latency_ms: number | null;
  metadata: JsonRecord | null;
  created_at: string;
};

type GatewayWebhookInstanceRow = {
  id: string;
  organization_id: string;
  connectyhub_api_client_id: string | null;
  connectyhub_api_instance_id: string;
};

const gatewayWebhookEndpointColumns =
  "id, client_id, organization_id, url, description, status, events, secret_preview, secret_encrypted, last_success_at, last_failure_at, created_at, updated_at";

const gatewayWebhookDeliveryColumns =
  "id, endpoint_id, client_id, organization_id, whatsapp_instance_id, webhook_event_id, event_type, target_url, status, status_code, attempt_count, error_message, payload, response_preview, delivered_at, created_at";

const gatewayUsageColumns =
  "id, client_id, organization_id, whatsapp_instance_id, request_id, method, endpoint, status_code, unit_type, quantity, provider, provider_status, latency_ms, metadata, created_at";

const gatewayProviderWebhookEventColumns =
  "id, provider, event_type, provider_instance_id, whatsapp_instance_id, organization_id, provider_message_id, provider_chat_id, processing_status, error_message, received_at, processed_at, created_at";

const gatewayInstanceColumns =
  "id, organization_id, connectyhub_api_client_id, connectyhub_api_instance_id, connectyhub_api_visibility, provider, provider_instance_id, phone_number, display_name, status, qr_status, instance_token_preview, instance_token_encrypted, webhook_url, webhook_configured_at, last_synced_at, last_heartbeat_at, last_message_at, connected_at, disconnected_at, metadata, provider_payload, updated_at";

const apiClientColumns =
  "id, organization_id, name, slug, status, contact_email, plan_code, monthly_message_limit, metadata, created_at, updated_at";

export class GatewayHttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "GatewayHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function formatGatewayError(error: unknown) {
  if (error instanceof GatewayHttpError) {
    return {
      body: {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? undefined,
        },
      },
      status: error.status,
    };
  }

  return {
    body: {
      ok: false,
      error: {
        code: "internal_error",
        message: error instanceof Error ? error.message : "Erro inesperado na API ConnectyHub.",
      },
    },
    status: 500,
  };
}

export async function authenticateGatewayRequest(
  request: Request,
  requiredScopes: GatewayScope[] = [],
): Promise<GatewayAuthContext> {
  const rawKey = extractApiKey(request);

  if (!rawKey) {
    throw new GatewayHttpError(401, "missing_api_key", "Informe uma chave ConnectyHub em Authorization: Bearer ou x-connectyhub-api-key.");
  }

  const client = createServiceClient();
  const keyHash = hashSecret(rawKey);
  const { data: apiKey, error: keyError } = await client
    .from("connectyhub_api_keys")
    .select("id, client_id, organization_id, name, key_prefix, key_hash, scopes, status, last_used_at, expires_at, created_at")
    .eq("key_hash", keyHash)
    .maybeSingle<ApiKeyRow>();

  if (keyError) {
    throw new GatewayHttpError(500, "api_key_lookup_failed", keyError.message);
  }

  if (!apiKey || apiKey.status !== "active") {
    throw new GatewayHttpError(401, "invalid_api_key", "Chave ConnectyHub invalida, pausada ou revogada.");
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at).getTime() <= Date.now()) {
    throw new GatewayHttpError(401, "expired_api_key", "Chave ConnectyHub expirada.");
  }

  const { data: apiClient, error: clientError } = await client
    .from("connectyhub_api_clients")
    .select(apiClientColumns)
    .eq("id", apiKey.client_id)
    .maybeSingle<ApiClientRow>();

  if (clientError) {
    throw new GatewayHttpError(500, "api_client_lookup_failed", clientError.message);
  }

  if (!apiClient || apiClient.status !== "active") {
    throw new GatewayHttpError(403, "api_client_inactive", "Cliente API pausado, arquivado ou inexistente.");
  }

  assertScopes(apiKey.scopes ?? [], requiredScopes);

  await client
    .from("connectyhub_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id);

  return {
    client,
    apiClient,
    apiKey,
  };
}

export async function listGatewayInstances(auth: GatewayAuthContext) {
  const { data, error } = await auth.client
    .from("whatsapp_instances")
    .select(gatewayInstanceColumns)
    .eq("connectyhub_api_client_id", auth.apiClient.id)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new GatewayHttpError(500, "instances_lookup_failed", error.message);
  }

  return ((data ?? []) as GatewayInstanceRow[]).map(mapGatewayInstance);
}

export async function createGatewayInstance(
  auth: GatewayAuthContext,
  input: {
    name?: string | null;
    webhookUrl?: string | null;
    metadata?: unknown;
  },
) {
  const credentials = await loadUazapiCredentials(auth.client);
  const requestedDisplayName =
    normalizeWhatsappInstanceDisplayName(input.name) ??
    normalizeWhatsappInstanceDisplayName(auth.apiClient.name) ??
    auth.apiClient.name;
  const providerName = normalizeProviderInstanceName(requestedDisplayName);
  const now = new Date().toISOString();
  const providerStartedAt = Date.now();
  const createResult = await callUazapi(credentials, "/instance/create", {
    method: "POST",
    admin: true,
    body: {
      name: providerName,
      systemName: `ConnectyHub API - ${auth.apiClient.name}`,
      adminField01: auth.apiClient.organization_id,
      adminField02: auth.apiClient.id,
    },
  });
  const providerInstanceId = findString(createResult.data, ["id", "instance_id", "instanceId", "instanceid"]);
  const token = findString(createResult.data, ["token", "instanceToken", "instance_token"]);

  if (!providerInstanceId || !token) {
    throw new GatewayHttpError(502, "provider_create_failed", "O provedor WhatsApp nao retornou id/token da instancia.", sanitizeProviderData(createResult.data));
  }

  const webhookResult = await configureGatewayProviderWebhook(credentials, token, providerInstanceId);
  const metadata = {
    api_gateway: true,
    connectyhub_api_client_id: auth.apiClient.id,
    connectyhub_api_client_name: auth.apiClient.name,
    requested_display_name: requestedDisplayName,
    provider_name: providerName,
    external_webhook_url: normalizeUrl(input.webhookUrl),
    create_response: sanitizeProviderData(createResult.data),
    webhook_status: webhookResult.ok ? "configured" : "not_configured",
    webhook_error: webhookResult.ok ? null : webhookResult.reason,
    customer_metadata: isRecord(input.metadata) ? input.metadata : {},
  };

  const { data, error } = await auth.client
    .from("whatsapp_instances")
    .insert({
      organization_id: auth.apiClient.organization_id,
      connectyhub_api_client_id: auth.apiClient.id,
      connectyhub_api_visibility: "api_customer",
      provider: "uazapi",
      provider_instance_id: providerInstanceId,
      display_name: requestedDisplayName,
      status: "draft",
      instance_token_preview: previewCredentialValue(token, "secret"),
      instance_token_encrypted: encryptCredentialValue(token),
      webhook_url: credentials.webhookUrl,
      webhook_configured_at: webhookResult.ok ? now : null,
      last_synced_at: now,
      provider_payload: sanitizeProviderData(createResult.data),
      metadata,
    })
    .select(gatewayInstanceColumns)
    .single<GatewayInstanceRow>();

  if (error || !data) {
    throw new GatewayHttpError(500, "instance_save_failed", error?.message ?? "Nao foi possivel salvar a instancia ConnectyHub.");
  }

  await recordUsageEvent(auth, {
    method: "POST",
    endpoint: "/api/v1/instances",
    statusCode: 201,
    whatsappInstanceId: data.id,
    provider: "uazapi",
    providerStatus: createResult.status,
    latencyMs: createResult.latencyMs ?? Date.now() - providerStartedAt,
  });

  return mapGatewayInstance(data);
}

export async function connectGatewayInstance(auth: GatewayAuthContext, instanceId: string) {
  const instance = await requireGatewayInstance(auth, instanceId);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new GatewayHttpError(409, "missing_instance_token", "Instancia sem token seguro. Adote ou recrie a instancia.");
  }

  const credentials = await loadUazapiCredentials(auth.client);
  const providerStartedAt = Date.now();
  const result = await callUazapi(credentials, "/instance/connect", {
    method: "POST",
    token,
    tolerateError: true,
    body: {
      browser: "auto",
      systemName: `ConnectyHub API - ${auth.apiClient.name}`,
    },
  });

  if (!result.ok) {
    throw new GatewayHttpError(result.status, "provider_connect_failed", readProviderError(result.data) ?? "Falha ao conectar instancia no provedor WhatsApp.", sanitizeProviderData(result.data));
  }

  const status = resolveUazapiWhatsappStatus(result.data, "qr_pending");
  const qrCode = normalizeQrCode(findString(result.data, ["qrcode", "qrCode", "qr", "base64"]));
  const phoneNumber = normalizePhone(findString(result.data, ["owner", "phone", "number", "phone_number"]) ?? instance.phone_number);
  const profileImage = status === "connected"
    ? await getWhatsappInstanceProfileImage({
        credentials,
        token,
        phoneNumber,
        providerData: result.data,
      }).catch(() => null)
    : null;
  const now = new Date().toISOString();

  await auth.client
    .from("whatsapp_instances")
    .update({
      status: qrCode ? "qr_pending" : status,
      qr_status: qrCode ? "available" : null,
      phone_number: phoneNumber,
      display_name: resolveWhatsappInstanceDisplayName({
        providerData: result.data,
        profileData: profileImage?.profileData,
        avatarData: profileImage?.avatarData,
        existingDisplayName: instance.display_name,
        fallbackName: auth.apiClient.name,
        phoneNumber,
        providerInstanceId: instance.provider_instance_id,
        instanceId: instance.connectyhub_api_instance_id,
      }),
      connected_at: status === "connected" ? instance.connected_at ?? now : instance.connected_at,
      disconnected_at: status === "connected" ? null : instance.disconnected_at,
      last_synced_at: now,
      provider_payload: sanitizeProviderData(result.data),
      metadata: {
        ...(instance.metadata ?? {}),
        last_api_action: "connect",
        last_connect_response: sanitizeProviderData(result.data),
        ...(status === "connected"
          ? buildWhatsappInstanceProfileImageMetadata({
              profileImageUrl: profileImage?.profileImageUrl,
              source: profileImage?.source,
              syncedAt: now,
              providerData: result.data,
              profileData: profileImage?.profileData,
              avatarData: profileImage?.avatarData,
            })
          : {}),
      },
    })
    .eq("id", instance.id);

  await recordUsageEvent(auth, {
    method: "POST",
    endpoint: `/api/v1/instances/${instanceId}/connect`,
    statusCode: 200,
    whatsappInstanceId: instance.id,
    provider: "uazapi",
    providerStatus: result.status,
    latencyMs: result.latencyMs ?? Date.now() - providerStartedAt,
  });

  return {
    instanceId,
    status: qrCode ? "qr_pending" : status,
    qrCode,
    provider: sanitizeProviderData(result.data),
  };
}

export async function refreshGatewayInstanceStatus(auth: GatewayAuthContext, instanceId: string) {
  const instance = await requireGatewayInstance(auth, instanceId);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new GatewayHttpError(409, "missing_instance_token", "Instancia sem token seguro. Adote ou recrie a instancia.");
  }

  const credentials = await loadUazapiCredentials(auth.client);
  const providerStartedAt = Date.now();
  const result = await callUazapi(credentials, "/instance/status", {
    method: "GET",
    token,
    tolerateError: true,
  });

  if (!result.ok) {
    throw new GatewayHttpError(result.status, "provider_status_failed", readProviderError(result.data) ?? "Falha ao consultar status no provedor WhatsApp.", sanitizeProviderData(result.data));
  }

  const status = resolveUazapiWhatsappStatus(result.data, instance.status === "connected" ? "connected" : "draft");
  const phoneNumber = normalizePhone(findString(result.data, ["owner", "phone", "number", "phone_number"]) ?? instance.phone_number);
  const profileImage = status === "connected"
    ? await getWhatsappInstanceProfileImage({
        credentials,
        token,
        phoneNumber,
        providerData: result.data,
      }).catch(() => null)
    : null;
  const now = new Date().toISOString();

  await auth.client
    .from("whatsapp_instances")
    .update({
      status,
      phone_number: phoneNumber,
      display_name: resolveWhatsappInstanceDisplayName({
        providerData: result.data,
        profileData: profileImage?.profileData,
        avatarData: profileImage?.avatarData,
        existingDisplayName: instance.display_name,
        fallbackName: auth.apiClient.name,
        phoneNumber,
        providerInstanceId: instance.provider_instance_id,
        instanceId: instance.connectyhub_api_instance_id,
      }),
      connected_at: status === "connected" ? instance.connected_at ?? now : instance.connected_at,
      disconnected_at: status === "disconnected" ? now : status === "connected" ? null : instance.disconnected_at,
      last_heartbeat_at: now,
      last_synced_at: now,
      provider_payload: sanitizeProviderData(result.data),
      metadata: {
        ...(instance.metadata ?? {}),
        last_api_action: "refresh_status",
        last_status_response: sanitizeProviderData(result.data),
        ...(status === "connected"
          ? buildWhatsappInstanceProfileImageMetadata({
              profileImageUrl: profileImage?.profileImageUrl,
              source: profileImage?.source,
              syncedAt: now,
              providerData: result.data,
              profileData: profileImage?.profileData,
              avatarData: profileImage?.avatarData,
            })
          : {}),
      },
    })
    .eq("id", instance.id);

  await recordUsageEvent(auth, {
    method: "GET",
    endpoint: `/api/v1/instances/${instanceId}/status`,
    statusCode: 200,
    whatsappInstanceId: instance.id,
    provider: "uazapi",
    providerStatus: result.status,
    latencyMs: result.latencyMs ?? Date.now() - providerStartedAt,
  });

  return {
    ...mapGatewayInstance({
      ...instance,
      status,
      phone_number: phoneNumber,
      metadata: {
        ...(instance.metadata ?? {}),
        ...(status === "connected"
          ? buildWhatsappInstanceProfileImageMetadata({
              profileImageUrl: profileImage?.profileImageUrl,
              source: profileImage?.source,
              syncedAt: now,
              providerData: result.data,
              profileData: profileImage?.profileData,
              avatarData: profileImage?.avatarData,
            })
          : {}),
      },
      last_heartbeat_at: now,
      last_synced_at: now,
    }),
    provider: sanitizeProviderData(result.data),
  };
}

export async function deleteGatewayInstance(auth: GatewayAuthContext, instanceId: string) {
  const instance = await requireGatewayInstance(auth, instanceId);
  const result = await deleteGatewayInstanceRow({
    apiClient: auth.apiClient,
    client: auth.client,
    endpoint: `/api/v1/instances/${instanceId}`,
    instance,
    source: "public_api",
  });

  await recordUsageEvent(auth, {
    method: "DELETE",
    endpoint: `/api/v1/instances/${instanceId}`,
    statusCode: result.providerDeleted ? 200 : 202,
    whatsappInstanceId: instance.id,
    provider: "uazapi",
    providerStatus: result.providerStatus ?? undefined,
    latencyMs: result.providerLatencyMs,
    metadata: {
      providerDeleted: result.providerDeleted,
      providerResponse: result.provider,
      refreshedTokenUsed: result.refreshedTokenUsed,
    },
  });

  return result;
}

export async function deleteClientGatewayInstance(input: {
  organizationId: string;
  instanceId: string;
  actorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const instance = await requireOrganizationGatewayInstance(client, input.organizationId, input.instanceId);

  if (!instance.connectyhub_api_client_id) {
    throw new GatewayHttpError(409, "instance_not_api_controlled", "Esta instancia nao pertence ao gateway API deste workspace.");
  }

  const apiClient = await requireOrganizationApiClient(client, input.organizationId, instance.connectyhub_api_client_id);
  const result = await deleteGatewayInstanceRow({
    actorId: input.actorId,
    apiClient,
    client,
    endpoint: `/dashboard/api-whatsapp/instances/${input.instanceId}`,
    instance,
    source: "client_dashboard",
  });

  await recordPanelUsageEvent(client, {
    apiClient,
    endpoint: `/dashboard/api-whatsapp/instances/${input.instanceId}`,
    metadata: {
      actorId: input.actorId,
      source: "client_dashboard",
      providerDeleted: result.providerDeleted,
      providerResponse: result.provider,
      refreshedTokenUsed: result.refreshedTokenUsed,
    },
    providerStatus: result.providerStatus ?? undefined,
    latencyMs: result.providerLatencyMs,
    statusCode: result.providerDeleted ? 200 : 202,
    whatsappInstanceId: instance.id,
  });

  return result;
}

export async function deleteAdminGatewayInstance(input: {
  instanceId: string;
  actorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const instance = await requireAdminGatewayInstance(client, input.instanceId);

  if (!instance.connectyhub_api_client_id) {
    throw new GatewayHttpError(409, "instance_not_api_controlled", "Esta instancia nao pertence a nenhum cliente API.");
  }

  const apiClient = await requireAdminApiClient(client, instance.connectyhub_api_client_id);
  const result = await deleteGatewayInstanceRow({
    actorId: input.actorId,
    apiClient,
    client,
    endpoint: `/admin/api-whatsapp/instances/${input.instanceId}`,
    instance,
    source: "admin_dashboard",
  });

  await recordPanelUsageEvent(client, {
    apiClient,
    endpoint: `/admin/api-whatsapp/instances/${input.instanceId}`,
    metadata: {
      actorId: input.actorId,
      source: "admin_dashboard",
      providerDeleted: result.providerDeleted,
      providerResponse: result.provider,
      refreshedTokenUsed: result.refreshedTokenUsed,
    },
    providerStatus: result.providerStatus ?? undefined,
    latencyMs: result.providerLatencyMs,
    statusCode: result.providerDeleted ? 200 : 202,
    whatsappInstanceId: instance.id,
  });

  return result;
}

export async function sendGatewayTextMessage(
  auth: GatewayAuthContext,
  input: {
    instanceId: string;
    number: string;
    text: string;
    linkPreview?: boolean;
    trackId?: string | null;
    idempotencyKey?: string | null;
  },
) {
  const requestHash = hashStableJson({
    instanceId: input.instanceId,
    number: normalizePhone(input.number),
    text: input.text?.trim(),
    linkPreview: input.linkPreview !== false,
    trackId: input.trackId ?? null,
  });
  const replay = await readIdempotentGatewayResponse(auth, {
    key: input.idempotencyKey,
    requestHash,
    method: "POST",
    endpoint: "/api/v1/messages/text",
  });

  if (replay) {
    return replay;
  }

  const instance = await requireGatewayInstance(auth, input.instanceId);
  const token = decryptInstanceToken(instance);
  const number = normalizePhone(input.number);
  const text = input.text?.trim();

  if (!token) {
    throw new GatewayHttpError(409, "missing_instance_token", "Instancia sem token seguro. Adote ou recrie a instancia.");
  }

  if (!number || number.length < 10) {
    throw new GatewayHttpError(422, "invalid_number", "Informe numero com DDD e pais.");
  }

  if (!text) {
    throw new GatewayHttpError(422, "invalid_text", "Informe o texto da mensagem.");
  }

  await assertMonthlyMessageQuota(auth);

  const credentials = await loadUazapiCredentials(auth.client);
  const providerStartedAt = Date.now();
  const result = await callUazapi(credentials, "/send/text", {
    method: "POST",
    token,
    body: {
      number,
      text,
      linkPreview: input.linkPreview !== false,
      track_source: "connectyhub_api",
      track_id: input.trackId ?? `ch_api_${Date.now()}`,
    },
    tolerateError: true,
  });

  const now = new Date().toISOString();

  await auth.client
    .from("whatsapp_instances")
    .update({
      last_message_at: result.ok ? now : instance.last_message_at,
      metadata: {
        ...(instance.metadata ?? {}),
        last_api_action: "send_text",
        last_api_message_at: result.ok ? now : instance.metadata?.last_api_message_at ?? null,
        last_api_send_response: sanitizeProviderData(result.data),
      },
    })
    .eq("id", instance.id);

  await recordUsageEvent(auth, {
    method: "POST",
    endpoint: "/api/v1/messages/text",
    statusCode: result.ok ? 200 : result.status,
    whatsappInstanceId: instance.id,
    provider: "uazapi",
    providerStatus: result.status,
    unitType: "message",
    latencyMs: result.latencyMs ?? Date.now() - providerStartedAt,
    metadata: {
      messageType: "text",
      ok: result.ok,
    },
  });

  if (!result.ok) {
    throw new GatewayHttpError(result.status, "provider_send_failed", readProviderError(result.data) ?? "Falha ao enviar mensagem pelo provedor WhatsApp.", sanitizeProviderData(result.data));
  }

  const response = {
    ok: true,
    instanceId: input.instanceId,
    provider: sanitizeProviderData(result.data),
  };

  await saveIdempotentGatewayResponse(auth, {
    key: input.idempotencyKey,
    requestHash,
    method: "POST",
    endpoint: "/api/v1/messages/text",
    statusCode: 200,
    response,
    unitType: "message",
  });

  return response;
}

export async function sendGatewayMediaMessage(
  auth: GatewayAuthContext,
  input: {
    instanceId: string;
    number: string;
    type: string;
    file: string;
    text?: string | null;
    docName?: string | null;
    thumbnail?: string | null;
    viewOnce?: boolean;
    delay?: number | null;
    readchat?: boolean;
    readmessages?: boolean;
    replyid?: string | null;
    mentions?: string[] | null;
    trackId?: string | null;
    idempotencyKey?: string | null;
  },
) {
  const mediaType = normalizeMediaType(input.type);
  const requestPayload = {
    instanceId: input.instanceId,
    number: normalizePhone(input.number),
    type: mediaType,
    file: input.file?.trim(),
    text: input.text?.trim() || null,
    docName: input.docName?.trim() || null,
    thumbnail: input.thumbnail?.trim() || null,
    viewOnce: input.viewOnce === true,
    delay: normalizePositiveInteger(input.delay, 0, 120_000),
    readchat: input.readchat === true,
    readmessages: input.readmessages === true,
    replyid: input.replyid?.trim() || null,
    mentions: Array.isArray(input.mentions) ? input.mentions.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [],
    trackId: input.trackId ?? null,
  };
  const requestHash = hashStableJson(requestPayload);
  const replay = await readIdempotentGatewayResponse(auth, {
    key: input.idempotencyKey,
    requestHash,
    method: "POST",
    endpoint: "/api/v1/messages/media",
  });

  if (replay) {
    return replay;
  }

  const instance = await requireGatewayInstance(auth, input.instanceId);
  const token = decryptInstanceToken(instance);
  const number = normalizePhone(input.number);
  const file = input.file?.trim();

  if (!token) {
    throw new GatewayHttpError(409, "missing_instance_token", "Instancia sem token seguro. Adote ou recrie a instancia.");
  }

  if (!number || number.length < 10) {
    throw new GatewayHttpError(422, "invalid_number", "Informe numero com DDD e pais.");
  }

  if (!mediaType) {
    throw new GatewayHttpError(422, "invalid_media_type", "Tipo de midia invalido. Use image, video, document, audio, myaudio, ptt, ptv, videoplay ou sticker.");
  }

  if (!file) {
    throw new GatewayHttpError(422, "invalid_media_file", "Informe uma URL publica ou base64 no campo file.");
  }

  await assertMonthlyMessageQuota(auth);

  const credentials = await loadUazapiCredentials(auth.client);
  const providerBody = removeUndefined({
    number,
    type: mediaType,
    file,
    text: input.text?.trim() || undefined,
    docName: input.docName?.trim() || undefined,
    thumbnail: input.thumbnail?.trim() || undefined,
    viewOnce: input.viewOnce === true ? true : undefined,
    delay: normalizePositiveInteger(input.delay, 0, 120_000) ?? undefined,
    readchat: typeof input.readchat === "boolean" ? input.readchat : undefined,
    readmessages: typeof input.readmessages === "boolean" ? input.readmessages : undefined,
    replyid: input.replyid?.trim() || undefined,
    mentions: Array.isArray(input.mentions) ? input.mentions.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : undefined,
    track_source: "connectyhub_api",
    track_id: input.trackId ?? `ch_api_${Date.now()}`,
  });
  const providerStartedAt = Date.now();
  const result = await callUazapi(credentials, "/send/media", {
    method: "POST",
    token,
    body: providerBody,
    tolerateError: true,
  });
  const now = new Date().toISOString();

  await auth.client
    .from("whatsapp_instances")
    .update({
      last_message_at: result.ok ? now : instance.last_message_at,
      metadata: {
        ...(instance.metadata ?? {}),
        last_api_action: "send_media",
        last_api_message_at: result.ok ? now : instance.metadata?.last_api_message_at ?? null,
        last_api_send_response: sanitizeProviderData(result.data),
      },
    })
    .eq("id", instance.id);

  await recordUsageEvent(auth, {
    method: "POST",
    endpoint: "/api/v1/messages/media",
    statusCode: result.ok ? 200 : result.status,
    whatsappInstanceId: instance.id,
    provider: "uazapi",
    providerStatus: result.status,
    unitType: "message",
    latencyMs: result.latencyMs ?? Date.now() - providerStartedAt,
    metadata: {
      messageType: mediaType,
      ok: result.ok,
    },
  });

  if (!result.ok) {
    throw new GatewayHttpError(result.status, "provider_send_failed", readProviderError(result.data) ?? "Falha ao enviar midia pelo provedor WhatsApp.", sanitizeProviderData(result.data));
  }

  const response = {
    ok: true,
    instanceId: input.instanceId,
    type: mediaType,
    provider: sanitizeProviderData(result.data),
  };

  await saveIdempotentGatewayResponse(auth, {
    key: input.idempotencyKey,
    requestHash,
    method: "POST",
    endpoint: "/api/v1/messages/media",
    statusCode: 200,
    response,
    unitType: "message",
  });

  return response;
}

export async function listGatewayChats(
  auth: GatewayAuthContext,
  input: {
    instanceId: string;
    filters?: JsonRecord | null;
  },
) {
  const result = await callInstanceUazapi(auth, {
    instanceId: input.instanceId,
    endpoint: "/api/v1/chats",
    providerPath: "/chat/find",
    method: "POST",
    body: normalizeSearchBody(input.filters, { sort: "-wa_lastMsgTimestamp", limit: 20, offset: 0 }),
  });

  return {
    ok: result.ok,
    instanceId: input.instanceId,
    provider: sanitizeProviderData(result.data),
  };
}

export async function getGatewayChatDetails(
  auth: GatewayAuthContext,
  input: {
    instanceId: string;
    number: string;
    preview?: boolean;
  },
) {
  if (!input.number?.trim()) {
    throw new GatewayHttpError(422, "invalid_chat_number", "Informe number ou chatId para consultar o chat.");
  }

  const result = await callInstanceUazapi(auth, {
    instanceId: input.instanceId,
    endpoint: "/api/v1/chats/details",
    providerPath: "/chat/details",
    method: "POST",
    body: {
      number: input.number.trim(),
      preview: input.preview === true,
    },
  });

  return {
    ok: result.ok,
    instanceId: input.instanceId,
    chat: sanitizeProviderData(result.data),
  };
}

export async function listGatewayMessages(
  auth: GatewayAuthContext,
  input: {
    instanceId: string;
    filters?: JsonRecord | null;
  },
) {
  const result = await callInstanceUazapi(auth, {
    instanceId: input.instanceId,
    endpoint: "/api/v1/messages",
    providerPath: "/message/find",
    method: "POST",
    body: normalizeSearchBody(input.filters, { limit: 50, offset: 0 }),
  });

  return {
    ok: result.ok,
    instanceId: input.instanceId,
    provider: sanitizeProviderData(result.data),
  };
}

export async function listGatewayContacts(
  auth: GatewayAuthContext,
  input: {
    instanceId: string;
    limit?: number | null;
    offset?: number | null;
    contactScope?: string | null;
  },
) {
  const contactScope = ["address_book", "outside_address_book", "all"].includes(input.contactScope ?? "")
    ? input.contactScope
    : "address_book";
  const result = await callInstanceUazapi(auth, {
    instanceId: input.instanceId,
    endpoint: "/api/v1/contacts",
    providerPath: "/contacts/list",
    method: "POST",
    body: {
      limit: normalizePositiveInteger(input.limit, 1, 1000) ?? 100,
      offset: normalizePositiveInteger(input.offset, 0, 100_000) ?? 0,
      contactScope,
    },
  });

  return {
    ok: result.ok,
    instanceId: input.instanceId,
    provider: sanitizeProviderData(result.data),
  };
}

export async function proxyGatewayProviderRequest(
  auth: GatewayAuthContext,
  input: {
    instanceId: string;
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    query?: URLSearchParams;
    body?: unknown;
    publicEndpointPrefix?: string;
  },
) {
  if (!isProxyPathAllowed(input.path)) {
    throw new GatewayHttpError(403, "proxy_path_not_allowed", "Este endpoint exige privilegio de provedor e nao pode ser exposto ao cliente API.");
  }

  const instance = await requireGatewayInstance(auth, input.instanceId);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new GatewayHttpError(409, "missing_instance_token", "Instancia sem token seguro. Adote ou recrie a instancia.");
  }

  const credentials = await loadUazapiCredentials(auth.client);
  const providerStartedAt = Date.now();
  const result = await callUazapi(credentials, input.path, {
    method: input.method,
    token,
    body: input.body,
    query: input.query,
    tolerateError: true,
  });

  await recordUsageEvent(auth, {
    method: input.method,
    endpoint: `${input.publicEndpointPrefix ?? "/api/v1/provider"}${input.path}`,
    statusCode: result.status,
    whatsappInstanceId: instance.id,
    provider: "uazapi",
    providerStatus: result.status,
    latencyMs: result.latencyMs ?? Date.now() - providerStartedAt,
    metadata: {
      proxiedPath: input.path,
      ok: result.ok,
    },
  });

  return {
    status: result.status,
    body: result.data,
  };
}

export async function dispatchGatewayWebhookDeliveries(input: {
  whatsappInstanceId: string | null;
  webhookEventId: string | null;
  eventType: string;
  payload: unknown;
  ingest: unknown;
  client?: SupabaseClient;
}) {
  if (!input.whatsappInstanceId) {
    return { delivered: 0, skipped: "missing_whatsapp_instance" };
  }

  const client = input.client ?? createServiceClient();
  const { data: instance, error: instanceError } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, connectyhub_api_client_id, connectyhub_api_instance_id")
    .eq("id", input.whatsappInstanceId)
    .maybeSingle<GatewayWebhookInstanceRow>();

  if (instanceError) {
    throw new GatewayHttpError(500, "webhook_instance_lookup_failed", instanceError.message);
  }

  if (!instance?.connectyhub_api_client_id) {
    return { delivered: 0, skipped: "instance_not_owned_by_api_client" };
  }

  const { data: endpoints, error: endpointsError } = await client
    .from("connectyhub_webhook_endpoints")
    .select("id, client_id, organization_id, url, description, status, events, secret_preview, secret_encrypted, created_at, updated_at")
    .eq("client_id", instance.connectyhub_api_client_id)
    .eq("status", "active");

  if (endpointsError) {
    throw new GatewayHttpError(500, "webhook_endpoint_lookup_failed", endpointsError.message);
  }

  const matchingEndpoints = ((endpoints ?? []) as WebhookEndpointRow[]).filter((endpoint) => {
    const events = endpoint.events ?? [];
    return events.length === 0 || events.includes("*") || events.includes(input.eventType);
  });

  let delivered = 0;
  const failures: string[] = [];

  for (const endpoint of matchingEndpoints) {
    const result = await deliverGatewayWebhook(client, {
      endpoint,
      apiClientId: instance.connectyhub_api_client_id,
      organizationId: instance.organization_id,
      whatsappInstanceId: instance.id,
      publicInstanceId: instance.connectyhub_api_instance_id,
      webhookEventId: input.webhookEventId,
      eventType: input.eventType,
      payload: input.payload,
      ingest: input.ingest,
    });

    if (result.ok) {
      delivered += 1;
    } else {
      failures.push(`${endpoint.url}: ${result.error}`);
    }
  }

  return {
    delivered,
    attempted: matchingEndpoints.length,
    failures,
  };
}

export async function listGatewayWebhookEndpoints(auth: GatewayAuthContext) {
  const { data, error } = await auth.client
    .from("connectyhub_webhook_endpoints")
    .select(gatewayWebhookEndpointColumns)
    .eq("client_id", auth.apiClient.id)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new GatewayHttpError(500, "webhook_endpoint_lookup_failed", error.message);
  }

  return ((data ?? []) as WebhookEndpointRow[]).map(mapWebhookEndpoint);
}

export async function createGatewayWebhookEndpoint(
  auth: GatewayAuthContext,
  input: {
    url: string;
    description?: string | null;
    events?: string[] | null;
  },
) {
  const url = normalizeUrl(input.url);

  if (!url) {
    throw new GatewayHttpError(422, "invalid_webhook_url", "Informe uma URL publica de webhook.");
  }

  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const { data, error } = await auth.client
    .from("connectyhub_webhook_endpoints")
    .insert({
      client_id: auth.apiClient.id,
      organization_id: auth.apiClient.organization_id,
      url,
      description: input.description?.trim() || null,
      events: normalizeWebhookEvents(input.events),
      secret_encrypted: encryptCredentialValue(secret),
      secret_preview: previewCredentialValue(secret, "secret"),
      metadata: {
        created_from: "connectyhub_public_api",
        created_by_key: auth.apiKey.key_prefix,
      },
    })
    .select(gatewayWebhookEndpointColumns)
    .single<WebhookEndpointRow>();

  if (error || !data) {
    throw new GatewayHttpError(500, "webhook_endpoint_save_failed", error?.message ?? "Nao foi possivel criar webhook.");
  }

  await recordUsageEvent(auth, {
    method: "POST",
    endpoint: "/api/v1/webhooks",
    statusCode: 201,
  });

  return {
    endpoint: mapWebhookEndpoint(data),
    secret,
  };
}

export async function getGatewayWebhookEndpoint(auth: GatewayAuthContext, endpointId: string) {
  return mapWebhookEndpoint(await requireGatewayWebhookEndpoint(auth, endpointId));
}

export async function updateGatewayWebhookEndpoint(
  auth: GatewayAuthContext,
  endpointId: string,
  input: {
    url?: string | null;
    description?: string | null;
    events?: string[] | null;
    status?: string | null;
  },
) {
  await requireGatewayWebhookEndpoint(auth, endpointId);
  const patch: JsonRecord = {};

  if (input.url !== undefined) {
    const url = normalizeUrl(input.url);
    if (!url) {
      throw new GatewayHttpError(422, "invalid_webhook_url", "Informe uma URL publica de webhook.");
    }
    patch.url = url;
  }

  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }

  if (input.events !== undefined) {
    patch.events = normalizeWebhookEvents(input.events);
  }

  if (input.status !== undefined) {
    if (!["active", "paused", "archived"].includes(input.status ?? "")) {
      throw new GatewayHttpError(422, "invalid_webhook_status", "Status invalido. Use active, paused ou archived.");
    }
    patch.status = input.status;
  }

  if (Object.keys(patch).length === 0) {
    throw new GatewayHttpError(422, "empty_webhook_update", "Informe pelo menos um campo para atualizar.");
  }

  const { data, error } = await auth.client
    .from("connectyhub_webhook_endpoints")
    .update(patch)
    .eq("id", endpointId)
    .eq("client_id", auth.apiClient.id)
    .select(gatewayWebhookEndpointColumns)
    .single<WebhookEndpointRow>();

  if (error || !data) {
    throw new GatewayHttpError(500, "webhook_endpoint_update_failed", error?.message ?? "Nao foi possivel atualizar webhook.");
  }

  await recordUsageEvent(auth, {
    method: "PATCH",
    endpoint: `/api/v1/webhooks/${endpointId}`,
    statusCode: 200,
  });

  return mapWebhookEndpoint(data);
}

export async function deleteGatewayWebhookEndpoint(auth: GatewayAuthContext, endpointId: string) {
  const endpoint = await updateGatewayWebhookEndpoint(auth, endpointId, { status: "archived" });

  return {
    id: endpoint.id,
    status: endpoint.status,
  };
}

export async function testGatewayWebhookEndpoint(auth: GatewayAuthContext, endpointId: string) {
  const endpoint = await requireGatewayWebhookEndpoint(auth, endpointId);
  const result = await deliverGatewayWebhook(auth.client, {
    endpoint,
    apiClientId: auth.apiClient.id,
    organizationId: auth.apiClient.organization_id,
    whatsappInstanceId: null,
    publicInstanceId: "test",
    webhookEventId: null,
    eventType: "test",
    payload: {
      test: true,
      message: "Webhook de teste ConnectyHub",
      clientId: auth.apiClient.id,
    },
    ingest: {
      status: "test",
    },
  });

  await recordUsageEvent(auth, {
    method: "POST",
    endpoint: `/api/v1/webhooks/${endpointId}/test`,
    statusCode: result.ok ? 200 : 502,
  });

  return result;
}

export async function listGatewayWebhookDeliveries(
  auth: GatewayAuthContext,
  input: {
    endpointId?: string | null;
    limit?: number | null;
  } = {},
) {
  let query = auth.client
    .from("connectyhub_webhook_deliveries")
    .select(gatewayWebhookDeliveryColumns)
    .eq("client_id", auth.apiClient.id)
    .order("created_at", { ascending: false })
    .limit(normalizePositiveInteger(input.limit, 1, 200) ?? 50);

  if (input.endpointId) {
    query = query.eq("endpoint_id", input.endpointId);
  }

  const { data, error } = await query;

  if (error) {
    throw new GatewayHttpError(500, "webhook_delivery_lookup_failed", error.message);
  }

  return ((data ?? []) as WebhookDeliveryRow[]).map(mapWebhookDelivery);
}

export async function retryGatewayWebhookDelivery(auth: GatewayAuthContext, deliveryId: string) {
  const { data: delivery, error } = await auth.client
    .from("connectyhub_webhook_deliveries")
    .select(gatewayWebhookDeliveryColumns)
    .eq("id", deliveryId)
    .eq("client_id", auth.apiClient.id)
    .maybeSingle<WebhookDeliveryRow>();

  if (error) {
    throw new GatewayHttpError(500, "webhook_delivery_lookup_failed", error.message);
  }

  if (!delivery) {
    throw new GatewayHttpError(404, "webhook_delivery_not_found", "Entrega de webhook nao encontrada.");
  }

  if (!delivery.endpoint_id) {
    throw new GatewayHttpError(409, "webhook_endpoint_missing", "A entrega nao possui endpoint associado.");
  }

  const endpoint = await requireGatewayWebhookEndpoint(auth, delivery.endpoint_id);
  const result = await sendExistingGatewayWebhookDelivery(auth.client, {
    delivery,
    endpoint,
    publicInstanceId: await readPublicInstanceId(auth.client, delivery.whatsapp_instance_id),
  });

  await recordUsageEvent(auth, {
    method: "POST",
    endpoint: `/api/v1/webhooks/deliveries/${deliveryId}/retry`,
    statusCode: result.ok ? 200 : 502,
  });

  return result;
}

export async function getGatewayUsageSummary(auth: GatewayAuthContext) {
  const period = currentMonthRange();
  const [messagesResult, requestsResult, recentResult] = await Promise.all([
    auth.client
      .from("connectyhub_api_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("client_id", auth.apiClient.id)
      .eq("unit_type", "message")
      .gte("created_at", period.start)
      .lt("created_at", period.end)
      .gte("status_code", 200)
      .lt("status_code", 300),
    auth.client
      .from("connectyhub_api_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("client_id", auth.apiClient.id)
      .gte("created_at", period.start)
      .lt("created_at", period.end),
    auth.client
      .from("connectyhub_api_usage_events")
      .select(gatewayUsageColumns)
      .eq("client_id", auth.apiClient.id)
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  if (messagesResult.error) {
    throw new GatewayHttpError(500, "usage_lookup_failed", messagesResult.error.message);
  }

  if (requestsResult.error) {
    throw new GatewayHttpError(500, "usage_lookup_failed", requestsResult.error.message);
  }

  if (recentResult.error) {
    throw new GatewayHttpError(500, "usage_lookup_failed", recentResult.error.message);
  }

  const messagesUsed = messagesResult.count ?? 0;
  const monthlyLimit = auth.apiClient.monthly_message_limit;

  return {
    period,
    client: mapApiClient(auth.apiClient),
    quota: {
      monthlyMessageLimit: monthlyLimit,
      messagesUsed,
      messagesRemaining: typeof monthlyLimit === "number" ? Math.max(monthlyLimit - messagesUsed, 0) : null,
      limited: typeof monthlyLimit === "number",
    },
    requests: {
      currentPeriod: requestsResult.count ?? 0,
    },
    recent: ((recentResult.data ?? []) as ApiUsageEventRow[]).map(mapUsageEvent),
  };
}

export async function createAdminApiClient(input: {
  organizationId: string;
  name: string;
  contactEmail?: string | null;
  planCode?: string | null;
  actorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const name = input.name.trim();

  if (!name) {
    throw new GatewayHttpError(422, "invalid_client_name", "Informe o nome do cliente API.");
  }

  const { data: existing, error: lookupError } = await client
    .from("connectyhub_api_clients")
    .select(apiClientColumns)
    .eq("organization_id", input.organizationId)
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ApiClientRow>();

  if (lookupError) {
    throw new GatewayHttpError(500, "api_client_lookup_failed", lookupError.message);
  }

  if (existing) {
    return existing;
  }

  const { data, error } = await client
    .from("connectyhub_api_clients")
    .insert({
      organization_id: input.organizationId,
      name,
      slug: slugify(name),
      contact_email: input.contactEmail?.trim() || null,
      plan_code: input.planCode?.trim() || "api_starter",
      created_by: input.actorId,
      metadata: {
        created_from: "admin_connectyhub_api",
      },
    })
    .select(apiClientColumns)
    .single<ApiClientRow>();

  if (error || !data) {
    throw new GatewayHttpError(500, "api_client_save_failed", error?.message ?? "Nao foi possivel criar o cliente API.");
  }

  return data;
}

export async function createAdminApiKey(input: {
  clientId: string;
  name: string;
  scopes?: string[];
  actorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const apiClient = await requireAdminApiClient(client, input.clientId);
  const secret = generateGatewayApiKey();
  const now = new Date().toISOString();
  const scopes = input.scopes?.length ? input.scopes : ["instances:read", "instances:write", "messages:send", "webhooks:read", "webhooks:write", "provider:proxy"];

  const { data, error } = await client
    .from("connectyhub_api_keys")
    .insert({
      client_id: apiClient.id,
      organization_id: apiClient.organization_id,
      name: input.name.trim() || "Chave principal",
      key_prefix: secret.slice(0, 14),
      key_hash: hashSecret(secret),
      scopes,
      created_by: input.actorId,
      metadata: {
        created_from: "admin_connectyhub_api",
        created_at: now,
      },
    })
    .select("id, client_id, organization_id, name, key_prefix, key_hash, scopes, status, last_used_at, expires_at, created_at")
    .single<ApiKeyRow>();

  if (error || !data) {
    throw new GatewayHttpError(500, "api_key_save_failed", error?.message ?? "Nao foi possivel gerar a chave API.");
  }

  return {
    apiKey: data,
    secret,
  };
}

export async function createAdminWebhookEndpoint(input: {
  clientId: string;
  url: string;
  description?: string | null;
  events?: string[];
  actorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const apiClient = await requireAdminApiClient(client, input.clientId);
  const url = normalizeUrl(input.url);

  if (!url) {
    throw new GatewayHttpError(422, "invalid_webhook_url", "Informe uma URL publica de webhook.");
  }

  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const { data, error } = await client
    .from("connectyhub_webhook_endpoints")
    .insert({
      client_id: apiClient.id,
      organization_id: apiClient.organization_id,
      url,
      description: input.description?.trim() || null,
      events: input.events?.length ? input.events : ["messages", "messages_update", "connection"],
      secret_encrypted: encryptCredentialValue(secret),
      secret_preview: previewCredentialValue(secret, "secret"),
      created_by: input.actorId,
      metadata: {
        created_from: "admin_connectyhub_api",
      },
    })
    .select("id, client_id, organization_id, url, description, status, events, secret_preview, created_at, updated_at")
    .single<WebhookEndpointRow>();

  if (error || !data) {
    throw new GatewayHttpError(500, "webhook_endpoint_save_failed", error?.message ?? "Nao foi possivel criar webhook do cliente API.");
  }

  return {
    endpoint: data,
    secret,
  };
}

export async function testAdminWebhookEndpoint(input: {
  clientId: string;
  webhookId: string;
  actorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const apiClient = await requireAdminApiClient(client, input.clientId);
  const endpoint = await requireAdminWebhookEndpoint(client, input.webhookId, apiClient.id);

  if (endpoint.status !== "active") {
    throw new GatewayHttpError(409, "webhook_endpoint_inactive", "Ative o webhook antes de enviar teste.");
  }

  return deliverGatewayWebhook(client, {
    endpoint,
    apiClientId: apiClient.id,
    organizationId: apiClient.organization_id,
    whatsappInstanceId: null,
    publicInstanceId: "test",
    webhookEventId: null,
    eventType: "webhook.test",
    payload: {
      test: true,
      message: "Teste de webhook ConnectyHub",
      sentBy: input.actorId,
      clientId: apiClient.id,
    },
    ingest: {
      status: "admin_test",
      origin: "admin_connectyhub_api",
    },
  });
}

export async function retryAdminWebhookDelivery(input: {
  deliveryId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data: delivery, error } = await client
    .from("connectyhub_webhook_deliveries")
    .select(gatewayWebhookDeliveryColumns)
    .eq("id", input.deliveryId)
    .maybeSingle<WebhookDeliveryRow>();

  if (error) {
    throw new GatewayHttpError(500, "webhook_delivery_lookup_failed", error.message);
  }

  if (!delivery?.endpoint_id) {
    throw new GatewayHttpError(404, "webhook_delivery_not_found", "Entrega de webhook nao encontrada.");
  }

  const endpoint = await requireAdminWebhookEndpoint(client, delivery.endpoint_id, delivery.client_id);

  return sendExistingGatewayWebhookDelivery(client, {
    delivery,
    endpoint,
    publicInstanceId: await readPublicInstanceId(client, delivery.whatsapp_instance_id),
  });
}

export async function adoptAdminProviderInstance(input: {
  clientId: string;
  providerInstanceId: string;
  actorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const apiClient = await requireAdminApiClient(client, input.clientId);
  const credentials = await loadUazapiCredentials(client);
  const providerInstance = await findProviderInstance(credentials, input.providerInstanceId);

  if (!providerInstance) {
    throw new GatewayHttpError(404, "provider_instance_not_found", "Instancia nao encontrada na Uazapi.");
  }

  const providerInstanceId = findString(providerInstance, ["id", "instance_id", "instanceId", "instanceid"]);
  const token = findString(providerInstance, ["token", "instanceToken", "instance_token"]);

  if (!providerInstanceId || !token) {
    throw new GatewayHttpError(422, "provider_instance_without_token", "A instancia existe na Uazapi, mas nao retornou id/token para adocao.");
  }

  const now = new Date().toISOString();
  const status = resolveUazapiWhatsappStatus(providerInstance);
  const phoneNumber = normalizePhone(findString(providerInstance, ["owner", "phone", "number", "phone_number"]));
  const profileImage = status === "connected"
    ? await getWhatsappInstanceProfileImage({
        credentials,
        token,
        phoneNumber,
        providerData: providerInstance,
      }).catch(() => null)
    : null;
  const webhookResult = await configureGatewayProviderWebhook(credentials, token, providerInstanceId);
  const displayName = resolveWhatsappInstanceDisplayName({
    providerData: providerInstance,
    profileData: profileImage?.profileData,
    avatarData: profileImage?.avatarData,
    fallbackName: apiClient.name,
    phoneNumber,
    providerInstanceId,
  });
  const basePayload = {
    organization_id: apiClient.organization_id,
    connectyhub_api_client_id: apiClient.id,
    connectyhub_api_visibility: "api_customer",
    provider: "uazapi",
    provider_instance_id: providerInstanceId,
    phone_number: phoneNumber,
    display_name: displayName,
    status,
    instance_token_preview: previewCredentialValue(token, "secret"),
    instance_token_encrypted: encryptCredentialValue(token),
    webhook_url: credentials.webhookUrl,
    webhook_configured_at: webhookResult.ok ? now : null,
    last_synced_at: now,
    provider_payload: sanitizeProviderData(providerInstance),
    metadata: {
      api_gateway: true,
      adopted_from_uazapi: true,
      adopted_at: now,
      adopted_by: input.actorId,
      connectyhub_api_client_id: apiClient.id,
      connectyhub_api_client_name: apiClient.name,
      provider_name: findString(providerInstance, ["name", "systemName", "instanceName", "instance_name"]),
      webhook_status: webhookResult.ok ? "configured" : "not_configured",
      webhook_error: webhookResult.ok ? null : webhookResult.reason,
      ...(status === "connected"
        ? buildWhatsappInstanceProfileImageMetadata({
            profileImageUrl: profileImage?.profileImageUrl,
            source: profileImage?.source,
            syncedAt: now,
            providerData: providerInstance,
            profileData: profileImage?.profileData,
            avatarData: profileImage?.avatarData,
          })
        : {}),
    },
  };

  const { data: existing } = await client
    .from("whatsapp_instances")
    .select("id, metadata")
    .eq("provider", "uazapi")
    .eq("provider_instance_id", providerInstanceId)
    .maybeSingle<{ id: string; metadata: JsonRecord | null }>();

  const query = existing
    ? client
        .from("whatsapp_instances")
        .update({
          ...basePayload,
          metadata: {
            ...(existing.metadata ?? {}),
            ...basePayload.metadata,
          },
        })
        .eq("id", existing.id)
    : client.from("whatsapp_instances").insert(basePayload);

  const { data, error } = await query
    .select(gatewayInstanceColumns)
    .single<GatewayInstanceRow>();

  if (error || !data) {
    throw new GatewayHttpError(500, "adopt_instance_failed", error?.message ?? "Nao foi possivel vincular a instancia ao cliente API.");
  }

  return mapGatewayInstance(data);
}

export async function getAdminGatewayState(client: SupabaseClient = createServiceClient()) {
  const warnings: string[] = [];
  const [
    clientsResult,
    keysResult,
    endpointsResult,
    instancesResult,
    usageResult,
    deliveriesResult,
    providerEventsResult,
    organizationsResult,
    providerResult,
  ] = await Promise.all([
    client
      .from("connectyhub_api_clients")
      .select(`${apiClientColumns}, organizations(id, name, slug, plan_code, status)`)
      .order("updated_at", { ascending: false })
      .limit(200),
    client
      .from("connectyhub_api_keys")
      .select("id, client_id, organization_id, name, key_prefix, scopes, status, last_used_at, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("connectyhub_webhook_endpoints")
      .select("id, client_id, organization_id, url, description, status, events, secret_preview, last_success_at, last_failure_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    client
      .from("whatsapp_instances")
      .select(`${gatewayInstanceColumns}, organizations(id, name, slug, plan_code, status)`)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(500),
    client
      .from("connectyhub_api_usage_events")
      .select(gatewayUsageColumns)
      .order("created_at", { ascending: false })
      .limit(800),
    client
      .from("connectyhub_webhook_deliveries")
      .select(gatewayWebhookDeliveryColumns)
      .order("created_at", { ascending: false })
      .limit(300),
    client
      .from("whatsapp_webhook_events")
      .select(gatewayProviderWebhookEventColumns)
      .order("received_at", { ascending: false })
      .limit(300),
    client
      .from("organizations")
      .select("id, name, slug, plan_code, status")
      .order("created_at", { ascending: false })
      .limit(500),
    listProviderInstancesForAdmin(client).catch((error) => ({ error: error instanceof Error ? error.message : "Falha ao consultar Uazapi.", instances: [] })),
  ]);

  if (clientsResult.error) warnings.push(`Clientes API indisponiveis: ${clientsResult.error.message}`);
  if (keysResult.error) warnings.push(`Chaves API indisponiveis: ${keysResult.error.message}`);
  if (endpointsResult.error) warnings.push(`Webhooks API indisponiveis: ${endpointsResult.error.message}`);
  if (instancesResult.error) warnings.push(`Instancias WhatsApp indisponiveis: ${instancesResult.error.message}`);
  if (usageResult.error) warnings.push(`Uso API indisponivel: ${usageResult.error.message}`);
  if (deliveriesResult.error) warnings.push(`Entregas webhook indisponiveis: ${deliveriesResult.error.message}`);
  if (providerEventsResult.error) warnings.push(`Eventos recebidos indisponiveis: ${providerEventsResult.error.message}`);
  if (organizationsResult.error) warnings.push(`Empresas indisponiveis: ${organizationsResult.error.message}`);
  if ("error" in providerResult && providerResult.error) warnings.push(`Uazapi: ${providerResult.error}`);

  const apiClients = ((clientsResult.data ?? []) as Array<ApiClientRow & { organizations?: OrganizationRow | OrganizationRow[] | null }>).map((row) => ({
    ...mapApiClient(row),
    organization: mapOrganization(readFirst(row.organizations)),
  }));
  const apiKeys = (keysResult.data ?? []).map((row) => ({
    id: String(row.id),
    clientId: String(row.client_id),
    name: String(row.name),
    keyPrefix: String(row.key_prefix),
    scopes: Array.isArray(row.scopes) ? row.scopes.filter((scope): scope is string => typeof scope === "string") : [],
    status: String(row.status),
    lastUsedAt: row.last_used_at as string | null,
    expiresAt: row.expires_at as string | null,
    createdAt: String(row.created_at),
  }));
  const endpoints = (endpointsResult.data ?? []).map((row) => ({
    id: String(row.id),
    clientId: String(row.client_id),
    url: String(row.url),
    description: row.description as string | null,
    status: String(row.status),
    events: Array.isArray(row.events) ? row.events.filter((event): event is string => typeof event === "string") : [],
    secretPreview: row.secret_preview as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
  const instanceRows = (instancesResult.data ?? []) as Array<GatewayInstanceRow & { organizations?: OrganizationRow | OrganizationRow[] | null }>;
  const apiInstanceRows = instanceRows.filter(isPublicApiGatewayInstance);
  const instances = apiInstanceRows.map((row) => ({
    ...mapGatewayInstance(row),
    organization: mapOrganization(readFirst(row.organizations)),
  }));
  const usage = ((usageResult.data ?? []) as ApiUsageEventRow[]).map(mapUsageEvent);
  const deliveries = ((deliveriesResult.data ?? []) as WebhookDeliveryRow[]).map(mapWebhookDelivery);
  const providerEvents = ((providerEventsResult.data ?? []) as ProviderWebhookEventRow[]).map(mapProviderWebhookEvent);
  const organizations = ((organizationsResult.data ?? []) as OrganizationRow[]).map(mapOrganization).filter(isPresent);
  const providerInstances = "instances" in providerResult ? providerResult.instances : [];
  const localProviderIds = new Set(instanceRows.map((instance) => instance.provider_instance_id).filter(Boolean));
  const apiMappedProviderIds = new Set(apiInstanceRows.filter((instance) => Boolean(instance.connectyhub_api_client_id)).map((instance) => instance.provider_instance_id).filter(Boolean));
  const localProfileImagesByProviderId = new Map(
    instanceRows
      .filter((instance) => Boolean(instance.provider_instance_id))
      .map((instance) => [instance.provider_instance_id, readWhatsappInstanceProfileImageUrl(instance.metadata)])
      .filter((item): item is [string, string] => Boolean(item[0] && item[1])),
  );
  const availableProviderInstances = providerInstances.filter((instance) => {
    const providerInstanceId = instance.providerInstanceId;
    return !localProviderIds.has(providerInstanceId) && !apiMappedProviderIds.has(providerInstanceId);
  });
  const traffic = buildApiTrafficTelemetry({ usage, clients: apiClients, deliveries });

  return {
    summary: {
      clients: apiClients.length,
      activeClients: apiClients.filter((client) => client.status === "active").length,
      keys: apiKeys.length,
      activeKeys: apiKeys.filter((key) => key.status === "active").length,
      endpoints: endpoints.length,
      apiInstances: instances.filter((instance) => Boolean(instance.apiClientId)).length,
      connectedApiInstances: instances.filter((instance) => Boolean(instance.apiClientId) && instance.status === "connected").length,
      providerInstances: providerInstances.length,
      unmappedProviderInstances: availableProviderInstances.length,
      requests24h: usage.filter((item) => Date.now() - new Date(item.createdAt).getTime() <= 86_400_000).length,
      providerEvents24h: providerEvents.filter((item) => Date.now() - new Date(item.receivedAt).getTime() <= 86_400_000).length,
      webhookDeliveries24h: deliveries.filter((item) => Date.now() - new Date(item.createdAt).getTime() <= 86_400_000).length,
      webhookFailures24h: deliveries.filter((item) => item.status === "failed" && Date.now() - new Date(item.createdAt).getTime() <= 86_400_000).length,
    },
    clients: apiClients,
    traffic,
    keys: apiKeys,
    endpoints,
    instances,
    providerInstances: providerInstances.map((instance) => ({
      ...instance,
      profileImageUrl: instance.profileImageUrl ?? localProfileImagesByProviderId.get(instance.providerInstanceId) ?? null,
      profileImageStatus: instance.profileImageUrl || localProfileImagesByProviderId.get(instance.providerInstanceId)
        ? "synced"
        : instance.profileImageStatus,
      hasLocalRow: localProviderIds.has(instance.providerInstanceId),
      hasApiClient: apiMappedProviderIds.has(instance.providerInstanceId),
      availableForApi: availableProviderInstances.some((candidate) => candidate.providerInstanceId === instance.providerInstanceId),
    })),
    organizations,
    usage: usage.slice(0, 80),
    deliveries: deliveries.slice(0, 120),
    providerEvents: providerEvents.slice(0, 120),
    warnings,
  };
}

export type AdminGatewayState = Awaited<ReturnType<typeof getAdminGatewayState>>;

export async function getClientGatewayState(input: {
  organizationId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const warnings: string[] = [];
  const period = currentMonthRange();
  const publicBaseUrl = resolvePublicAppUrl();
  const [
    clientsResult,
    instancesResult,
    clientAgentsResult,
    usageResult,
    deliveriesResult,
    monthlyMessagesResult,
    monthlyRequestsResult,
  ] = await Promise.all([
    client
      .from("connectyhub_api_clients")
      .select(apiClientColumns)
      .eq("organization_id", input.organizationId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(20),
    client
      .from("whatsapp_instances")
      .select(gatewayInstanceColumns)
      .eq("organization_id", input.organizationId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(100),
    client
      .from("agent_registry")
      .select("id, organization_id, agent_code, name, persona_name, metadata")
      .eq("organization_id", input.organizationId)
      .limit(500),
    client
      .from("connectyhub_api_usage_events")
      .select(gatewayUsageColumns)
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(120),
    client
      .from("connectyhub_webhook_deliveries")
      .select(gatewayWebhookDeliveryColumns)
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(80),
    client
      .from("connectyhub_api_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", input.organizationId)
      .eq("unit_type", "message")
      .gte("created_at", period.start)
      .lt("created_at", period.end)
      .gte("status_code", 200)
      .lt("status_code", 300),
    client
      .from("connectyhub_api_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", input.organizationId)
      .gte("created_at", period.start)
      .lt("created_at", period.end),
  ]);

  if (clientsResult.error) warnings.push(`Clientes API indisponiveis: ${clientsResult.error.message}`);
  if (instancesResult.error) warnings.push(`Instancias WhatsApp indisponiveis: ${instancesResult.error.message}`);
  if (clientAgentsResult.error) warnings.push(`Agentes WhatsApp indisponiveis: ${clientAgentsResult.error.message}`);
  if (usageResult.error) warnings.push(`Uso API indisponivel: ${usageResult.error.message}`);
  if (deliveriesResult.error) warnings.push(`Entregas webhook indisponiveis: ${deliveriesResult.error.message}`);
  if (monthlyMessagesResult.error) warnings.push(`Cota mensal indisponivel: ${monthlyMessagesResult.error.message}`);
  if (monthlyRequestsResult.error) warnings.push(`Requests mensais indisponiveis: ${monthlyRequestsResult.error.message}`);

  const apiClients = ((clientsResult.data ?? []) as ApiClientRow[]).map(mapApiClient);
  const clientIds = apiClients.map((apiClient) => apiClient.id);
  const [keysResult, endpointsResult] = clientIds.length > 0
    ? await Promise.all([
        client
          .from("connectyhub_api_keys")
          .select("id, client_id, organization_id, name, key_prefix, scopes, status, last_used_at, expires_at, created_at")
          .eq("organization_id", input.organizationId)
          .in("client_id", clientIds)
          .order("created_at", { ascending: false })
          .limit(100),
        client
          .from("connectyhub_webhook_endpoints")
          .select("id, client_id, organization_id, url, description, status, events, secret_preview, last_success_at, last_failure_at, created_at, updated_at")
          .eq("organization_id", input.organizationId)
          .in("client_id", clientIds)
          .neq("status", "archived")
          .order("updated_at", { ascending: false })
          .limit(100),
      ])
    : [null, null];

  if (keysResult?.error) warnings.push(`Chaves API indisponiveis: ${keysResult.error.message}`);
  if (endpointsResult?.error) warnings.push(`Webhooks API indisponiveis: ${endpointsResult.error.message}`);

  const apiKeys = ((keysResult?.data ?? []) as ApiKeySafeRow[]).map(mapApiKeySafe);
  const endpoints = ((endpointsResult?.data ?? []) as WebhookEndpointSafeRow[]).map(mapWebhookEndpointSafe);
  const instanceRows = (instancesResult.data ?? []) as GatewayInstanceRow[];
  const clientAgents = ((clientAgentsResult.data ?? []) as GatewayClientAgentRow[]).filter(isGatewayClientWhatsappAgent);
  const apiInstanceRows = instanceRows.filter((row) => {
    return Boolean(row.connectyhub_api_client_id && clientIds.includes(row.connectyhub_api_client_id))
      && isPublicApiGatewayInstance(row)
      && !isClientAgentGatewayInstance(row, clientAgents);
  });
  const instances = apiInstanceRows.map(mapGatewayInstance);
  const usage = ((usageResult.data ?? []) as ApiUsageEventRow[]).map(mapUsageEvent);
  const deliveries = ((deliveriesResult.data ?? []) as WebhookDeliveryRow[]).map(mapWebhookDelivery);
  const activeClient = apiClients.find((apiClient) => apiClient.status === "active") ?? apiClients[0] ?? null;
  const apiInstances = instances;
  const activeClientMonthlyLimit = activeClient?.monthlyMessageLimit ?? null;
  const messagesUsed = monthlyMessagesResult.count ?? 0;
  const traffic = buildApiTrafficTelemetry({ usage, clients: apiClients, deliveries });

  return {
    summary: {
      clients: apiClients.length,
      activeClients: apiClients.filter((apiClient) => apiClient.status === "active").length,
      keys: apiKeys.length,
      activeKeys: apiKeys.filter((apiKey) => apiKey.status === "active").length,
      endpoints: endpoints.length,
      activeEndpoints: endpoints.filter((endpoint) => endpoint.status === "active").length,
      workspaceInstances: apiInstances.length,
      connectedWorkspaceInstances: apiInstances.filter((instance) => instance.status === "connected").length,
      apiInstances: apiInstances.length,
      connectedApiInstances: apiInstances.filter((instance) => instance.status === "connected").length,
      requestsCurrentPeriod: monthlyRequestsResult.count ?? 0,
      messagesUsed,
      monthlyMessageLimit: activeClientMonthlyLimit,
      messagesRemaining: typeof activeClientMonthlyLimit === "number" ? Math.max(activeClientMonthlyLimit - messagesUsed, 0) : null,
    },
    clients: apiClients,
    traffic,
    activeClientId: activeClient?.id ?? null,
    keys: apiKeys,
    endpoints,
    instances,
    usage: usage.slice(0, 80),
    deliveries: deliveries.slice(0, 60),
    docs: {
      baseUrl: `${publicBaseUrl}/api/v1`,
      docsUrl: `${publicBaseUrl}/docs/api`,
      openapiUrl: `${publicBaseUrl}/docs/api/openapi.json`,
    },
    period,
    warnings,
  };
}

export type ClientGatewayState = Awaited<ReturnType<typeof getClientGatewayState>>;

export async function ensureClientApiClient(input: {
  organizationId: string;
  organizationName: string;
  organizationSlug?: string | null;
  contactEmail?: string | null;
  actorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data: existing, error: lookupError } = await client
    .from("connectyhub_api_clients")
    .select(apiClientColumns)
    .eq("organization_id", input.organizationId)
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ApiClientRow>();

  if (lookupError) {
    throw new GatewayHttpError(500, "api_client_lookup_failed", lookupError.message);
  }

  if (existing) {
    return existing;
  }

  const baseName = input.organizationName.trim() || "Minha empresa";
  const slugBase = slugify(input.organizationSlug || baseName || input.organizationId) || "connectyhub-api";
  const { data, error } = await client
    .from("connectyhub_api_clients")
    .insert({
      organization_id: input.organizationId,
      name: `${baseName} API WhatsApp`,
      slug: `${slugBase}-api-${randomBytes(4).toString("hex")}`.slice(0, 96),
      contact_email: input.contactEmail?.trim() || null,
      plan_code: "api_starter",
      created_by: input.actorId,
      metadata: {
        created_from: "client_dashboard",
      },
    })
    .select(apiClientColumns)
    .single<ApiClientRow>();

  if (error || !data) {
    throw new GatewayHttpError(500, "api_client_save_failed", error?.message ?? "Nao foi possivel ativar a API WhatsApp.");
  }

  return data;
}

export async function createClientApiKey(input: {
  organizationId: string;
  clientId: string;
  name: string;
  actorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const apiClient = await requireOrganizationApiClient(client, input.organizationId, input.clientId);

  if (apiClient.status !== "active") {
    throw new GatewayHttpError(409, "api_client_inactive", "Ative o cliente API antes de gerar chaves.");
  }

  const secret = generateGatewayApiKey();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("connectyhub_api_keys")
    .insert({
      client_id: apiClient.id,
      organization_id: apiClient.organization_id,
      name: input.name.trim() || "Chave principal",
      key_prefix: secret.slice(0, 14),
      key_hash: hashSecret(secret),
      scopes: ["instances:read", "instances:write", "messages:send", "webhooks:read", "webhooks:write", "provider:proxy"],
      created_by: input.actorId,
      metadata: {
        created_from: "client_dashboard",
        created_at: now,
      },
    })
    .select("id, client_id, organization_id, name, key_prefix, scopes, status, last_used_at, expires_at, created_at")
    .single<ApiKeySafeRow>();

  if (error || !data) {
    throw new GatewayHttpError(500, "api_key_save_failed", error?.message ?? "Nao foi possivel gerar a chave API.");
  }

  return {
    apiKey: mapApiKeySafe(data),
    secret,
  };
}

export async function revokeClientApiKey(input: {
  organizationId: string;
  keyId: string;
  client?: SupabaseClient;
}) {
  return updateClientApiKeyStatus({
    organizationId: input.organizationId,
    keyId: input.keyId,
    status: "revoked",
    client: input.client,
  });
}

export async function updateClientApiKeyStatus(input: {
  organizationId: string;
  keyId: string;
  status: GatewayApiKeyStatus;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const now = new Date().toISOString();
  const payload = input.status === "revoked"
    ? { status: input.status, revoked_at: now }
    : { status: input.status, revoked_at: null };
  const { data, error } = await client
    .from("connectyhub_api_keys")
    .update(payload)
    .eq("id", input.keyId)
    .eq("organization_id", input.organizationId)
    .select("id, client_id, organization_id, name, key_prefix, scopes, status, last_used_at, expires_at, created_at")
    .maybeSingle<ApiKeySafeRow>();

  if (error) {
    throw new GatewayHttpError(500, "api_key_revoke_failed", error.message);
  }

  if (!data) {
    throw new GatewayHttpError(404, "api_key_not_found", "Chave API nao encontrada para este workspace.");
  }

  return mapApiKeySafe(data);
}

export async function deleteClientApiKey(input: {
  organizationId: string;
  keyId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data, error } = await client
    .from("connectyhub_api_keys")
    .delete()
    .eq("id", input.keyId)
    .eq("organization_id", input.organizationId)
    .select("id, client_id, organization_id, name, key_prefix, scopes, status, last_used_at, expires_at, created_at")
    .maybeSingle<ApiKeySafeRow>();

  if (error) {
    throw new GatewayHttpError(500, "api_key_delete_failed", error.message);
  }

  if (!data) {
    throw new GatewayHttpError(404, "api_key_not_found", "Chave API nao encontrada para este workspace.");
  }

  return mapApiKeySafe(data);
}

export async function createClientWebhookEndpoint(input: {
  organizationId: string;
  clientId: string;
  url: string;
  description?: string | null;
  events?: string[];
  actorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const apiClient = await requireOrganizationApiClient(client, input.organizationId, input.clientId);

  if (apiClient.status !== "active") {
    throw new GatewayHttpError(409, "api_client_inactive", "Ative o cliente API antes de criar webhooks.");
  }

  const url = normalizeUrl(input.url);

  if (!url) {
    throw new GatewayHttpError(422, "invalid_webhook_url", "Informe uma URL publica de webhook.");
  }

  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const { data, error } = await client
    .from("connectyhub_webhook_endpoints")
    .insert({
      client_id: apiClient.id,
      organization_id: apiClient.organization_id,
      url,
      description: input.description?.trim() || null,
      events: normalizeWebhookEvents(input.events),
      secret_encrypted: encryptCredentialValue(secret),
      secret_preview: previewCredentialValue(secret, "secret"),
      created_by: input.actorId,
      metadata: {
        created_from: "client_dashboard",
      },
    })
    .select("id, client_id, organization_id, url, description, status, events, secret_preview, last_success_at, last_failure_at, created_at, updated_at")
    .single<WebhookEndpointSafeRow>();

  if (error || !data) {
    throw new GatewayHttpError(500, "webhook_endpoint_save_failed", error?.message ?? "Nao foi possivel criar webhook.");
  }

  return {
    endpoint: mapWebhookEndpointSafe(data),
    secret,
  };
}

export async function updateClientWebhookEndpointStatus(input: {
  organizationId: string;
  webhookId: string;
  status: "active" | "paused" | "archived";
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data, error } = await client
    .from("connectyhub_webhook_endpoints")
    .update({ status: input.status })
    .eq("id", input.webhookId)
    .eq("organization_id", input.organizationId)
    .select("id, client_id, organization_id, url, description, status, events, secret_preview, last_success_at, last_failure_at, created_at, updated_at")
    .maybeSingle<WebhookEndpointSafeRow>();

  if (error) {
    throw new GatewayHttpError(500, "webhook_endpoint_update_failed", error.message);
  }

  if (!data) {
    throw new GatewayHttpError(404, "webhook_endpoint_not_found", "Webhook nao encontrado para este workspace.");
  }

  return mapWebhookEndpointSafe(data);
}

export async function testClientWebhookEndpoint(input: {
  organizationId: string;
  webhookId: string;
  actorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const endpoint = await requireOrganizationWebhookEndpoint(client, input.organizationId, input.webhookId);

  if (endpoint.status !== "active") {
    throw new GatewayHttpError(409, "webhook_endpoint_inactive", "Ative o webhook antes de enviar teste.");
  }

  const now = new Date().toISOString();
  const payload = {
    event: "webhook.test",
    webhookEventId: null,
    instanceId: "test",
    provider: "connectyhub",
    data: {
      message: "ConnectyHub webhook test",
      sentBy: input.actorId,
    },
    sentAt: now,
  };
  const { data: delivery, error: insertError } = await client
    .from("connectyhub_webhook_deliveries")
    .insert({
      endpoint_id: endpoint.id,
      client_id: endpoint.client_id,
      organization_id: endpoint.organization_id,
      event_type: "webhook.test",
      target_url: endpoint.url,
      status: "queued",
      attempt_count: 0,
      payload,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !delivery) {
    throw new GatewayHttpError(500, "webhook_delivery_save_failed", insertError?.message ?? "Nao foi possivel registrar o teste.");
  }

  const body = JSON.stringify(payload);
  const secret = decryptWebhookSecret(endpoint);
  const signature = secret ? createHmac("sha256", secret).update(body).digest("hex") : null;
  const headers = {
    "content-type": "application/json",
    "user-agent": "ConnectyHub-Webhook/1.0",
    "x-connectyhub-event": "webhook.test",
    "x-connectyhub-instance-id": "test",
    ...(signature ? { "x-connectyhub-signature": `sha256=${signature}` } : {}),
  };

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const responseText = await response.text().catch(() => "");
    const deliveredAt = new Date().toISOString();
    const ok = response.ok;

    await client
      .from("connectyhub_webhook_deliveries")
      .update({
        status: ok ? "delivered" : "failed",
        attempt_count: 1,
        status_code: response.status,
        response_preview: previewText(responseText, 1000),
        delivered_at: ok ? deliveredAt : null,
        last_attempt_at: deliveredAt,
        next_retry_at: null,
        error_message: ok ? null : `Endpoint respondeu status ${response.status}.`,
      })
      .eq("id", delivery.id);

    await client
      .from("connectyhub_webhook_endpoints")
      .update(ok ? { last_success_at: deliveredAt } : { last_failure_at: deliveredAt })
      .eq("id", endpoint.id);

    return {
      ok,
      deliveryId: delivery.id,
      statusCode: response.status,
      error: ok ? null : `Endpoint respondeu status ${response.status}.`,
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Falha ao chamar endpoint.";

    await client
      .from("connectyhub_webhook_deliveries")
      .update({
        status: "failed",
        attempt_count: 1,
        last_attempt_at: failedAt,
        error_message: message,
      })
      .eq("id", delivery.id);

    await client
      .from("connectyhub_webhook_endpoints")
      .update({ last_failure_at: failedAt })
      .eq("id", endpoint.id);

    return {
      ok: false,
      deliveryId: delivery.id,
      statusCode: null,
      error: message,
    };
  }
}

export async function retryClientWebhookDelivery(input: {
  organizationId: string;
  deliveryId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data: delivery, error: deliveryError } = await client
    .from("connectyhub_webhook_deliveries")
    .select(gatewayWebhookDeliveryColumns)
    .eq("id", input.deliveryId)
    .eq("organization_id", input.organizationId)
    .maybeSingle<WebhookDeliveryRow>();

  if (deliveryError) {
    throw new GatewayHttpError(500, "webhook_delivery_lookup_failed", deliveryError.message);
  }

  if (!delivery?.endpoint_id) {
    throw new GatewayHttpError(404, "webhook_delivery_not_found", "Entrega nao encontrada para este workspace.");
  }

  const endpoint = await requireOrganizationWebhookEndpoint(client, input.organizationId, delivery.endpoint_id);
  const publicInstanceId = await readPublicInstanceId(client, delivery.whatsapp_instance_id);

  return sendExistingGatewayWebhookDelivery(client, {
    delivery,
    endpoint,
    publicInstanceId,
  });
}

async function callInstanceUazapi(
  auth: GatewayAuthContext,
  input: {
    instanceId: string;
    endpoint: string;
    providerPath: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    query?: URLSearchParams;
  },
) {
  const instance = await requireGatewayInstance(auth, input.instanceId);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new GatewayHttpError(409, "missing_instance_token", "Instancia sem token seguro. Adote ou recrie a instancia.");
  }

  const credentials = await loadUazapiCredentials(auth.client);
  const providerStartedAt = Date.now();
  const result = await callUazapi(credentials, input.providerPath, {
    method: input.method,
    token,
    body: input.body,
    query: input.query,
    tolerateError: true,
  });

  await recordUsageEvent(auth, {
    method: input.method,
    endpoint: input.endpoint,
    statusCode: result.status,
    whatsappInstanceId: instance.id,
    provider: "uazapi",
    providerStatus: result.status,
    latencyMs: result.latencyMs ?? Date.now() - providerStartedAt,
    metadata: {
      providerPath: input.providerPath,
      ok: result.ok,
    },
  });

  if (!result.ok) {
    throw new GatewayHttpError(result.status, "provider_request_failed", readProviderError(result.data) ?? "Falha ao consultar recurso no provedor WhatsApp.", sanitizeProviderData(result.data));
  }

  return result;
}

async function assertMonthlyMessageQuota(auth: GatewayAuthContext) {
  const monthlyLimit = auth.apiClient.monthly_message_limit;

  if (typeof monthlyLimit !== "number" || monthlyLimit <= 0) {
    return;
  }

  const period = currentMonthRange();
  const { count, error } = await auth.client
    .from("connectyhub_api_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("client_id", auth.apiClient.id)
    .eq("unit_type", "message")
    .gte("created_at", period.start)
    .lt("created_at", period.end)
    .gte("status_code", 200)
    .lt("status_code", 300);

  if (error) {
    throw new GatewayHttpError(500, "quota_lookup_failed", error.message);
  }

  const used = count ?? 0;

  if (used >= monthlyLimit) {
    throw new GatewayHttpError(429, "monthly_message_limit_exceeded", "Limite mensal de mensagens atingido para este cliente API.", {
      monthlyMessageLimit: monthlyLimit,
      messagesUsed: used,
      period,
    });
  }
}

async function readIdempotentGatewayResponse(
  auth: GatewayAuthContext,
  input: {
    key?: string | null;
    requestHash: string;
    method: string;
    endpoint: string;
  },
) {
  const key = normalizeIdempotencyKey(input.key);

  if (!key) {
    return null;
  }

  const { data, error } = await auth.client
    .from("connectyhub_api_idempotency_keys")
    .select("request_hash, response_body, status_code, expires_at")
    .eq("client_id", auth.apiClient.id)
    .eq("key", key)
    .maybeSingle<{ request_hash: string; response_body: JsonRecord | null; status_code: number; expires_at: string | null }>();

  if (error) {
    throw new GatewayHttpError(500, "idempotency_lookup_failed", error.message);
  }

  if (!data) {
    return null;
  }

  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  if (data.request_hash !== input.requestHash) {
    throw new GatewayHttpError(409, "idempotency_key_conflict", "Esta Idempotency-Key ja foi usada com outro payload.");
  }

  return {
    ...(data.response_body ?? {}),
    idempotentReplay: true,
  };
}

async function saveIdempotentGatewayResponse(
  auth: GatewayAuthContext,
  input: {
    key?: string | null;
    requestHash: string;
    method: string;
    endpoint: string;
    statusCode: number;
    response: JsonRecord;
    unitType?: string | null;
  },
) {
  const key = normalizeIdempotencyKey(input.key);

  if (!key) {
    return;
  }

  const now = Date.now();
  const expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  await auth.client.from("connectyhub_api_idempotency_keys").insert({
    client_id: auth.apiClient.id,
    organization_id: auth.apiClient.organization_id,
    api_key_id: auth.apiKey.id,
    key,
    request_hash: input.requestHash,
    method: input.method,
    endpoint: input.endpoint,
    status_code: input.statusCode,
    response_body: input.response,
    unit_type: input.unitType ?? null,
    expires_at: expiresAt,
  });
}

async function requireGatewayInstance(auth: GatewayAuthContext, publicInstanceId: string) {
  const { data, error } = await auth.client
    .from("whatsapp_instances")
    .select(gatewayInstanceColumns)
    .eq("connectyhub_api_instance_id", publicInstanceId)
    .eq("connectyhub_api_client_id", auth.apiClient.id)
    .neq("status", "archived")
    .maybeSingle<GatewayInstanceRow>();

  if (error) {
    throw new GatewayHttpError(500, "instance_lookup_failed", error.message);
  }

  if (!data) {
    throw new GatewayHttpError(404, "instance_not_found", "Instancia nao encontrada para este cliente API.");
  }

  return data;
}

async function requireOrganizationGatewayInstance(client: SupabaseClient, organizationId: string, publicInstanceId: string) {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select(gatewayInstanceColumns)
    .eq("organization_id", organizationId)
    .eq("connectyhub_api_instance_id", publicInstanceId)
    .neq("status", "archived")
    .maybeSingle<GatewayInstanceRow>();

  if (error) {
    throw new GatewayHttpError(500, "instance_lookup_failed", error.message);
  }

  if (!data) {
    throw new GatewayHttpError(404, "instance_not_found", "Instancia nao encontrada para este workspace.");
  }

  return data;
}

async function requireAdminGatewayInstance(client: SupabaseClient, publicInstanceId: string) {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select(gatewayInstanceColumns)
    .eq("connectyhub_api_instance_id", publicInstanceId)
    .neq("status", "archived")
    .maybeSingle<GatewayInstanceRow>();

  if (error) {
    throw new GatewayHttpError(500, "instance_lookup_failed", error.message);
  }

  if (!data) {
    throw new GatewayHttpError(404, "instance_not_found", "Instancia nao encontrada.");
  }

  return data;
}

async function deleteGatewayInstanceRow(input: {
  actorId?: string;
  apiClient: Pick<ApiClientRow, "id" | "organization_id" | "name">;
  client: SupabaseClient;
  endpoint: string;
  instance: GatewayInstanceRow;
  source: "public_api" | "client_dashboard" | "admin_dashboard";
}) {
  const credentials = await loadUazapiCredentials(input.client);
  const initialToken = decryptInstanceToken(input.instance);
  let deleteResult: Awaited<ReturnType<typeof callUazapi>> | null = null;
  let refreshedTokenUsed = false;

  if (initialToken) {
    deleteResult = await callUazapi(credentials, "/instance", {
      method: "DELETE",
      token: initialToken,
      tolerateError: true,
    });
  }

  if ((!deleteResult?.ok || !initialToken) && input.instance.provider_instance_id) {
    const providerInstance = await findProviderInstance(credentials, input.instance.provider_instance_id).catch(() => null);
    const refreshedToken = providerInstance ? findString(providerInstance, ["token", "instanceToken", "instance_token"]) : null;

    if (refreshedToken && refreshedToken !== initialToken) {
      refreshedTokenUsed = true;
      deleteResult = await callUazapi(credentials, "/instance", {
        method: "DELETE",
        token: refreshedToken,
        tolerateError: true,
      });
    }
  }

  const providerDeleted = Boolean(deleteResult?.ok);
  const providerStatus = deleteResult?.status ?? null;
  const providerResponse = sanitizeProviderData(deleteResult?.data ?? null);
  const now = new Date().toISOString();

  const { data, error } = await input.client
    .from("whatsapp_instances")
    .update({
      status: "archived",
      qr_status: null,
      instance_token_preview: null,
      instance_token_encrypted: null,
      webhook_url: null,
      webhook_configured_at: null,
      disconnected_at: now,
      last_synced_at: now,
      provider_payload: providerResponse,
      metadata: {
        ...(input.instance.metadata ?? {}),
        last_api_action: "delete",
        deleted_at: now,
        deleted_by: input.actorId ?? null,
        delete_endpoint: input.endpoint,
        delete_source: input.source,
        provider_delete_ok: providerDeleted,
        provider_delete_status: providerStatus,
        provider_delete_response: providerResponse,
        provider_delete_refreshed_token_used: refreshedTokenUsed,
      },
    })
    .eq("id", input.instance.id)
    .select(gatewayInstanceColumns)
    .single<GatewayInstanceRow>();

  if (error || !data) {
    throw new GatewayHttpError(500, "instance_archive_failed", error?.message ?? "Nao foi possivel arquivar a instancia ConnectyHub.");
  }

  return {
    instanceId: input.instance.connectyhub_api_instance_id,
    deleted: true,
    providerDeleted,
    providerStatus,
    providerLatencyMs: deleteResult?.latencyMs ?? null,
    provider: providerResponse,
    refreshedTokenUsed,
    instance: mapGatewayInstance(data),
  };
}

async function requireGatewayWebhookEndpoint(auth: GatewayAuthContext, endpointId: string) {
  const { data, error } = await auth.client
    .from("connectyhub_webhook_endpoints")
    .select(gatewayWebhookEndpointColumns)
    .eq("id", endpointId)
    .eq("client_id", auth.apiClient.id)
    .neq("status", "archived")
    .maybeSingle<WebhookEndpointRow>();

  if (error) {
    throw new GatewayHttpError(500, "webhook_endpoint_lookup_failed", error.message);
  }

  if (!data) {
    throw new GatewayHttpError(404, "webhook_endpoint_not_found", "Webhook nao encontrado para este cliente API.");
  }

  return data;
}

async function sendExistingGatewayWebhookDelivery(
  client: SupabaseClient,
  input: {
    delivery: WebhookDeliveryRow;
    endpoint: WebhookEndpointRow;
    publicInstanceId: string;
  },
) {
  if (input.endpoint.status !== "active") {
    throw new GatewayHttpError(409, "webhook_endpoint_inactive", "Endpoint de webhook pausado ou arquivado.");
  }

  const payload = input.delivery.payload ?? {};
  const body = JSON.stringify(payload);
  const secret = decryptWebhookSecret(input.endpoint);
  const signature = secret ? createHmac("sha256", secret).update(body).digest("hex") : null;
  const attemptCount = (input.delivery.attempt_count ?? 0) + 1;
  const headers = {
    "content-type": "application/json",
    "user-agent": "ConnectyHub-Webhook/1.0",
    "x-connectyhub-event": input.delivery.event_type,
    "x-connectyhub-instance-id": input.publicInstanceId,
    ...(input.delivery.webhook_event_id ? { "x-connectyhub-webhook-event-id": input.delivery.webhook_event_id } : {}),
    ...(signature ? { "x-connectyhub-signature": `sha256=${signature}` } : {}),
  };

  await client
    .from("connectyhub_webhook_deliveries")
    .update({ status: "queued", attempt_count: attemptCount })
    .eq("id", input.delivery.id);

  try {
    const response = await fetch(input.delivery.target_url, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    });
    const responseText = await response.text().catch(() => "");
    const deliveredAt = new Date().toISOString();
    const ok = response.ok;

    await client
      .from("connectyhub_webhook_deliveries")
      .update({
        status: ok ? "delivered" : "failed",
        status_code: response.status,
        response_preview: previewText(responseText, 1000),
        delivered_at: ok ? deliveredAt : input.delivery.delivered_at,
        error_message: ok ? null : `Endpoint respondeu status ${response.status}.`,
      })
      .eq("id", input.delivery.id);

    await client
      .from("connectyhub_webhook_endpoints")
      .update(ok ? { last_success_at: deliveredAt } : { last_failure_at: deliveredAt })
      .eq("id", input.endpoint.id);

    return {
      ok,
      deliveryId: input.delivery.id,
      statusCode: response.status,
      attemptCount,
      error: ok ? null : `Endpoint respondeu status ${response.status}.`,
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Falha ao chamar endpoint.";

    await client
      .from("connectyhub_webhook_deliveries")
      .update({
        status: "failed",
        error_message: message,
      })
      .eq("id", input.delivery.id);

    await client
      .from("connectyhub_webhook_endpoints")
      .update({ last_failure_at: failedAt })
      .eq("id", input.endpoint.id);

    return {
      ok: false,
      deliveryId: input.delivery.id,
      statusCode: null,
      attemptCount,
      error: message,
    };
  }
}

async function readPublicInstanceId(client: SupabaseClient, whatsappInstanceId: string | null) {
  if (!whatsappInstanceId) {
    return "unknown";
  }

  const { data } = await client
    .from("whatsapp_instances")
    .select("connectyhub_api_instance_id")
    .eq("id", whatsappInstanceId)
    .maybeSingle<{ connectyhub_api_instance_id: string | null }>();

  return data?.connectyhub_api_instance_id ?? "unknown";
}

async function requireAdminApiClient(client: SupabaseClient, clientId: string) {
  const { data, error } = await client
    .from("connectyhub_api_clients")
    .select(apiClientColumns)
    .eq("id", clientId)
    .maybeSingle<ApiClientRow>();

  if (error) {
    throw new GatewayHttpError(500, "api_client_lookup_failed", error.message);
  }

  if (!data) {
    throw new GatewayHttpError(404, "api_client_not_found", "Cliente API nao encontrado.");
  }

  return data;
}

async function requireAdminWebhookEndpoint(client: SupabaseClient, webhookId: string, clientId?: string | null) {
  let query = client
    .from("connectyhub_webhook_endpoints")
    .select(gatewayWebhookEndpointColumns)
    .eq("id", webhookId)
    .neq("status", "archived");

  if (clientId) {
    query = query.eq("client_id", clientId);
  }

  const { data, error } = await query.maybeSingle<WebhookEndpointRow>();

  if (error) {
    throw new GatewayHttpError(500, "webhook_endpoint_lookup_failed", error.message);
  }

  if (!data) {
    throw new GatewayHttpError(404, "webhook_endpoint_not_found", "Webhook nao encontrado.");
  }

  return data;
}

async function requireOrganizationApiClient(client: SupabaseClient, organizationId: string, clientId: string) {
  const { data, error } = await client
    .from("connectyhub_api_clients")
    .select(apiClientColumns)
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .maybeSingle<ApiClientRow>();

  if (error) {
    throw new GatewayHttpError(500, "api_client_lookup_failed", error.message);
  }

  if (!data) {
    throw new GatewayHttpError(404, "api_client_not_found", "Cliente API nao encontrado para este workspace.");
  }

  return data;
}

async function requireOrganizationWebhookEndpoint(client: SupabaseClient, organizationId: string, webhookId: string) {
  const { data, error } = await client
    .from("connectyhub_webhook_endpoints")
    .select(gatewayWebhookEndpointColumns)
    .eq("id", webhookId)
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .maybeSingle<WebhookEndpointRow>();

  if (error) {
    throw new GatewayHttpError(500, "webhook_endpoint_lookup_failed", error.message);
  }

  if (!data) {
    throw new GatewayHttpError(404, "webhook_endpoint_not_found", "Webhook nao encontrado para este workspace.");
  }

  return data;
}

async function listProviderInstancesForAdmin(client: SupabaseClient) {
  const credentials = await loadUazapiCredentials(client);
  const result = await callUazapi(credentials, "/instance/all", {
    method: "GET",
    admin: true,
    tolerateError: true,
  });

  if (!result.ok) {
    return {
      error: readProviderError(result.data) ?? `Uazapi respondeu status ${result.status}.`,
      instances: [],
    };
  }

  const providerItems = extractProviderInstances(result.data);
  const instances = await mapWithConcurrency(providerItems, 4, (item) => mapProviderInstanceForAdmin(item, credentials));

  return {
    error: null,
    instances,
  };
}

async function mapProviderInstanceForAdmin(item: JsonRecord, credentials: UazapiCredentials) {
  const status = resolveUazapiWhatsappStatus(item);
  const token = findString(item, ["token", "instanceToken", "instance_token"]);
  const phoneNumber = normalizePhone(findString(item, ["owner", "phone", "number", "phone_number"]));
  const providerInstanceId = findString(item, ["id", "instance_id", "instanceId", "instanceid"]) ?? "unknown";
  const payloadProfileImageUrl = readWhatsappInstanceProfileImageUrl(item);
  const liveProfileImage = payloadProfileImageUrl || status !== "connected" || !token
    ? null
    : await getWhatsappInstanceProfileImage({
        credentials,
        token,
        phoneNumber,
        providerData: item,
      }).catch(() => null);
  const profileImageUrl = payloadProfileImageUrl ?? liveProfileImage?.profileImageUrl ?? null;

  return {
    providerInstanceId,
    name: resolveWhatsappInstanceDisplayName({
      providerData: item,
      profileData: liveProfileImage?.profileData,
      avatarData: liveProfileImage?.avatarData,
      phoneNumber,
      providerInstanceId,
    }),
    status,
    phoneNumber,
    tokenPresent: Boolean(token),
    profileImageUrl,
    profileImageStatus: profileImageUrl ? "synced" : status === "connected" && token ? "not_found" : "skipped",
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index] as T, index);
    }
  }));

  return results;
}

async function findProviderInstance(credentials: UazapiCredentials, providerInstanceId: string) {
  const result = await callUazapi(credentials, "/instance/all", {
    method: "GET",
    admin: true,
    tolerateError: true,
  });

  if (!result.ok) {
    throw new GatewayHttpError(result.status, "provider_list_failed", readProviderError(result.data) ?? "Falha ao listar instancias na Uazapi.");
  }

  return extractProviderInstances(result.data).find((item) => {
    const id = findString(item, ["id", "instance_id", "instanceId", "instanceid"]);
    return id === providerInstanceId;
  }) ?? null;
}

async function configureGatewayProviderWebhook(credentials: UazapiCredentials, token: string, providerInstanceId: string) {
  if (!credentials.webhookUrl) {
    return { ok: false as const, reason: "NEXT_PUBLIC_APP_URL nao configurada." };
  }

  const webhookUrl = new URL(credentials.webhookUrl);
  if (credentials.webhookSecret) {
    webhookUrl.searchParams.set("secret", credentials.webhookSecret);
  }
  webhookUrl.searchParams.set("instanceId", providerInstanceId);

  const result = await callUazapi(credentials, "/webhook", {
    method: "POST",
    token,
    tolerateError: true,
    body: {
      url: webhookUrl.toString(),
      events: ["messages", "messages_update", "connection", "history", "presence", "chats", "contacts", "groups", "labels", "chat_labels", "newsletter_messages", "call", "blocks", "sender"],
      excludeMessages: ["wasSentByApi"],
      enabled: true,
      addUrlEvents: false,
      addUrlTypesMessages: false,
    },
  });

  if (!result.ok) {
    return { ok: false as const, reason: readProviderError(result.data) ?? `Webhook respondeu status ${result.status}.` };
  }

  return { ok: true as const };
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    token?: string;
    admin?: boolean;
    query?: URLSearchParams;
    tolerateError?: boolean;
  },
) {
  const url = new URL(`${credentials.baseUrl}${path}`);
  options.query?.forEach((value, key) => {
    if (!["instanceId", "token", "admintoken"].includes(key)) {
      url.searchParams.set(key, value);
    }
  });

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: options.method,
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.admin ? { admintoken: credentials.adminToken } : {}),
      ...(options.token ? { token: options.token } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const data = await readResponse(response);

  if (!response.ok && !options.tolerateError) {
    throw new GatewayHttpError(response.status, "provider_request_failed", readProviderError(data) ?? `Provedor WhatsApp respondeu status ${response.status}.`, sanitizeProviderData(data));
  }

  return {
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - startedAt,
    data,
  };
}

async function deliverGatewayWebhook(
  client: SupabaseClient,
  input: {
    endpoint: WebhookEndpointRow;
    apiClientId: string;
    organizationId: string;
    whatsappInstanceId: string | null;
    publicInstanceId: string;
    webhookEventId: string | null;
    eventType: string;
    payload: unknown;
    ingest: unknown;
  },
) {
  const now = new Date().toISOString();
  const requestPayload = {
    event: input.eventType,
    webhookEventId: input.webhookEventId,
    instanceId: input.publicInstanceId,
    provider: "connectyhub",
    data: input.payload,
    ingest: input.ingest,
    sentAt: now,
  };
  const body = JSON.stringify(requestPayload);
  const secret = decryptWebhookSecret(input.endpoint);
  const signature = secret ? createHmac("sha256", secret).update(body).digest("hex") : null;
  const headers = {
    "content-type": "application/json",
    "user-agent": "ConnectyHub-Webhook/1.0",
    "x-connectyhub-event": input.eventType,
    "x-connectyhub-instance-id": input.publicInstanceId,
    ...(input.webhookEventId ? { "x-connectyhub-webhook-event-id": input.webhookEventId } : {}),
    ...(signature ? { "x-connectyhub-signature": `sha256=${signature}` } : {}),
  };
  const { data: delivery, error: insertError } = await client
    .from("connectyhub_webhook_deliveries")
    .insert({
      endpoint_id: input.endpoint.id,
      client_id: input.apiClientId,
      organization_id: input.organizationId,
      whatsapp_instance_id: input.whatsappInstanceId,
      webhook_event_id: input.webhookEventId,
      event_type: input.eventType,
      target_url: input.endpoint.url,
      status: "queued",
      attempt_count: 0,
      payload: requestPayload,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !delivery) {
    return { ok: false, error: insertError?.message ?? "Falha ao registrar delivery." };
  }

  try {
    const response = await fetch(input.endpoint.url, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    });
    const responseText = await response.text().catch(() => "");
    const deliveredAt = new Date().toISOString();
    const ok = response.ok;

    await client
      .from("connectyhub_webhook_deliveries")
      .update({
        status: ok ? "delivered" : "failed",
        attempt_count: 1,
        status_code: response.status,
        response_preview: previewText(responseText, 1000),
        delivered_at: ok ? deliveredAt : null,
        error_message: ok ? null : `Endpoint respondeu status ${response.status}.`,
      })
      .eq("id", delivery.id);

    await client
      .from("connectyhub_webhook_endpoints")
      .update(ok ? { last_success_at: deliveredAt } : { last_failure_at: deliveredAt })
      .eq("id", input.endpoint.id);

    return ok
      ? { ok: true }
      : { ok: false, error: `Endpoint respondeu status ${response.status}.` };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Falha ao chamar endpoint.";

    await client
      .from("connectyhub_webhook_deliveries")
      .update({
        status: "failed",
        attempt_count: 1,
        error_message: message,
      })
      .eq("id", delivery.id);

    await client
      .from("connectyhub_webhook_endpoints")
      .update({ last_failure_at: failedAt })
      .eq("id", input.endpoint.id);

    return { ok: false, error: message };
  }
}

async function readResponse(response: Response) {
  const text = await response.text().catch(() => "");

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function recordUsageEvent(
  auth: GatewayAuthContext,
  input: {
    method: string;
    endpoint: string;
    statusCode?: number;
    whatsappInstanceId?: string | null;
    unitType?: string;
    quantity?: number;
    provider?: string;
    providerStatus?: number;
    requestId?: string | null;
    latencyMs?: number | null;
    metadata?: JsonRecord;
  },
) {
  await auth.client.from("connectyhub_api_usage_events").insert({
    client_id: auth.apiClient.id,
    organization_id: auth.apiClient.organization_id,
    api_key_id: auth.apiKey.id,
    whatsapp_instance_id: input.whatsappInstanceId ?? null,
    request_id: input.requestId ?? createGatewayRequestId(),
    method: input.method,
    endpoint: input.endpoint,
    status_code: input.statusCode ?? null,
    unit_type: input.unitType ?? "request",
    quantity: input.quantity ?? 1,
    provider: input.provider ?? null,
    provider_status: input.providerStatus ?? null,
    latency_ms: normalizeLatencyMs(input.latencyMs),
    metadata: input.metadata ?? {},
  });
}

async function recordPanelUsageEvent(
  client: SupabaseClient,
  input: {
    apiClient: Pick<ApiClientRow, "id" | "organization_id">;
    endpoint: string;
    statusCode?: number;
    whatsappInstanceId?: string | null;
    unitType?: string;
    quantity?: number;
    provider?: string;
    providerStatus?: number;
    requestId?: string | null;
    latencyMs?: number | null;
    metadata?: JsonRecord;
  },
) {
  await client.from("connectyhub_api_usage_events").insert({
    client_id: input.apiClient.id,
    organization_id: input.apiClient.organization_id,
    api_key_id: null,
    whatsapp_instance_id: input.whatsappInstanceId ?? null,
    request_id: input.requestId ?? createGatewayRequestId(),
    method: "DELETE",
    endpoint: input.endpoint,
    status_code: input.statusCode ?? null,
    unit_type: input.unitType ?? "request",
    quantity: input.quantity ?? 1,
    provider: input.provider ?? "uazapi",
    provider_status: input.providerStatus ?? null,
    latency_ms: normalizeLatencyMs(input.latencyMs),
    metadata: input.metadata ?? {},
  });
}

function extractApiKey(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return request.headers.get("x-connectyhub-api-key")?.trim() || null;
}

function assertScopes(actual: string[], required: GatewayScope[]) {
  if (required.length === 0) return;
  const scopeSet = new Set(actual.flatMap(expandScopeAliases));
  const missing = required.filter((scope) => !scopeSet.has(scope));

  if (missing.length > 0) {
    throw new GatewayHttpError(403, "missing_scope", `Chave sem permissao: ${missing.join(", ")}.`);
  }
}

function expandScopeAliases(scope: string): string[] {
  if (scope === "uazapi:proxy") {
    return ["uazapi:proxy", "provider:proxy"];
  }

  if (scope === "provider:proxy") {
    return ["provider:proxy", "uazapi:proxy"];
  }

  return [scope];
}

function publicScopeName(scope: string) {
  return scope === "uazapi:proxy" ? "provider:proxy" : scope;
}

function publicProviderName(provider: string | null | undefined) {
  if (!provider) {
    return provider ?? null;
  }

  return provider.toLowerCase() === "uazapi" ? "connectyhub" : scrubProviderName(provider);
}

function generateGatewayApiKey() {
  return `ch_live_${randomBytes(32).toString("base64url")}`;
}

function createGatewayRequestId() {
  return `ch_req_${randomBytes(10).toString("hex")}`;
}

function normalizeLatencyMs(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashStableJson(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  return `{${Object.keys(value as JsonRecord)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as JsonRecord)[key])}`)
    .join(",")}}`;
}

function decryptInstanceToken(instance: GatewayInstanceRow) {
  if (!instance.instance_token_encrypted) {
    return null;
  }

  try {
    return decryptCredentialValue(instance.instance_token_encrypted);
  } catch {
    return null;
  }
}

function decryptWebhookSecret(endpoint: WebhookEndpointRow) {
  if (!endpoint.secret_encrypted) {
    return null;
  }

  try {
    return decryptCredentialValue(endpoint.secret_encrypted);
  } catch {
    return null;
  }
}

function mapGatewayInstance(row: GatewayInstanceRow) {
  const displayName = resolveWhatsappInstanceDisplayName({
    providerData: row.provider_payload,
    metadata: row.metadata,
    existingDisplayName: row.display_name,
    phoneNumber: row.phone_number,
    providerInstanceId: row.provider_instance_id,
    instanceId: row.connectyhub_api_instance_id,
  });

  return {
    id: row.connectyhub_api_instance_id,
    internalId: row.id,
    apiClientId: row.connectyhub_api_client_id,
    organizationId: row.organization_id,
    provider: publicProviderName(row.provider),
    providerInstanceId: row.provider_instance_id,
    phoneNumber: row.phone_number,
    displayName,
    profileImageUrl: readWhatsappInstanceProfileImageUrl(row.metadata),
    status: row.status,
    visibility: row.connectyhub_api_visibility,
    tokenReady: Boolean(row.instance_token_encrypted),
    webhookConfigured: Boolean(row.webhook_url || row.webhook_configured_at),
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    lastSyncedAt: row.last_synced_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastMessageAt: row.last_message_at,
    updatedAt: row.updated_at,
  };
}

function isPublicApiGatewayInstance(row: GatewayInstanceRow) {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const createdFrom = typeof metadata.created_from === "string" ? metadata.created_from.toLowerCase() : "";

  if (createdFrom === "client_dashboard" || metadata.client_agent === true || Boolean(metadata.agent_id)) {
    return false;
  }

  const hasApiOrigin = metadata.api_gateway === true
    || createdFrom === "connectyhub_public_api"
    || createdFrom === "admin_connectyhub_api"
    || row.connectyhub_api_visibility === "api_customer"
    || row.connectyhub_api_visibility === "hybrid";

  return Boolean(row.connectyhub_api_client_id) && hasApiOrigin;
}

function isGatewayClientWhatsappAgent(row: GatewayClientAgentRow) {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const agentKind = readMetadataString(metadata, "agent_kind")?.toLowerCase();
  const agentType = readMetadataString(metadata, "agent_type")?.toLowerCase();
  const code = (row.agent_code ?? "").toLowerCase();
  const name = (row.name ?? "").toLowerCase();
  const personaName = (row.persona_name ?? "").toLowerCase();

  return agentKind === "whatsapp"
    || agentType === "whatsapp_attendant"
    || code.includes("agente-whatsapp")
    || name.includes("whatsapp")
    || personaName.includes("whatsapp");
}

function isClientAgentGatewayInstance(row: GatewayInstanceRow, agents: GatewayClientAgentRow[]) {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const createdFrom = readMetadataString(metadata, "created_from")?.toLowerCase() ?? "";

  if (createdFrom === "client_dashboard" || readMetadataBoolean(metadata, "client_agent")) {
    return true;
  }

  if (getGatewayInstanceAgentCandidateIds(metadata).length > 0) {
    return true;
  }

  if (readMetadataString(metadata, "agent_name") || readMetadataString(metadata, "agent_code")) {
    return true;
  }

  const hasExplicitApiOrigin = metadata.api_gateway === true
    || createdFrom === "connectyhub_public_api"
    || createdFrom === "admin_connectyhub_api";

  if (hasExplicitApiOrigin || agents.length === 0) {
    return false;
  }

  const fingerprint = normalizeComparable([
    row.display_name,
    row.provider_instance_id,
    readMetadataString(metadata, "provider_name"),
  ].filter(Boolean).join(" "));

  return agents.some((agent) => {
    const agentCode = normalizeComparable(agent.agent_code ?? "");
    const agentName = normalizeComparable(agent.persona_name || agent.name || "");

    return Boolean((agentCode && fingerprint.includes(agentCode)) || (agentName && fingerprint.includes(agentName)));
  });
}

function getGatewayInstanceAgentCandidateIds(metadata: JsonRecord) {
  return uniqueStrings([
    readMetadataString(metadata, "agent_id"),
    readMetadataString(metadata, "agentId"),
    readMetadataString(metadata, "whatsapp_agent_id"),
    readMetadataString(metadata, "producer_agent_id"),
    ...readMetadataStringArray(metadata, "agent_ids"),
  ]);
}

function mapApiClient(row: ApiClientRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    contactEmail: row.contact_email,
    planCode: row.plan_code,
    monthlyMessageLimit: row.monthly_message_limit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapApiKeySafe(row: ApiKeySafeRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    organizationId: row.organization_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: Array.isArray(row.scopes)
      ? row.scopes.filter((scope): scope is string => typeof scope === "string").map(publicScopeName)
      : [],
    status: row.status,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function mapWebhookEndpoint(row: WebhookEndpointRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    organizationId: row.organization_id,
    url: row.url,
    description: row.description,
    status: row.status,
    events: Array.isArray(row.events) ? row.events.filter((event): event is string => typeof event === "string") : [],
    secretPreview: row.secret_preview,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWebhookEndpointSafe(row: WebhookEndpointSafeRow) {
  return {
    ...mapWebhookEndpoint(row),
    lastSuccessAt: row.last_success_at ?? null,
    lastFailureAt: row.last_failure_at ?? null,
  };
}

function mapWebhookDelivery(row: WebhookDeliveryRow) {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    clientId: row.client_id,
    organizationId: row.organization_id,
    whatsappInstanceId: row.whatsapp_instance_id,
    webhookEventId: row.webhook_event_id,
    eventType: row.event_type,
    targetUrl: row.target_url,
    status: row.status,
    statusCode: row.status_code,
    attemptCount: row.attempt_count,
    errorMessage: row.error_message,
    responsePreview: row.response_preview,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  };
}

function mapProviderWebhookEvent(row: ProviderWebhookEventRow) {
  return {
    id: row.id,
    provider: publicProviderName(row.provider),
    eventType: row.event_type,
    providerInstanceId: row.provider_instance_id,
    whatsappInstanceId: row.whatsapp_instance_id,
    organizationId: row.organization_id,
    providerMessageId: row.provider_message_id,
    providerChatId: row.provider_chat_id,
    processingStatus: row.processing_status,
    errorMessage: row.error_message,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

function mapUsageEvent(row: ApiUsageEventRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    instanceId: row.whatsapp_instance_id,
    requestId: row.request_id,
    method: row.method,
    endpoint: row.endpoint,
    statusCode: row.status_code,
    unitType: row.unit_type,
    quantity: Number(row.quantity ?? 0),
    provider: publicProviderName(row.provider),
    providerStatus: row.provider_status,
    latencyMs: normalizeLatencyMs(row.latency_ms),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: row.created_at,
  };
}

function buildApiTrafficTelemetry(input: {
  usage: ReturnType<typeof mapUsageEvent>[];
  clients: Array<ReturnType<typeof mapApiClient> & { organization?: ReturnType<typeof mapOrganization> }>;
  deliveries: ReturnType<typeof mapWebhookDelivery>[];
}) {
  const now = Date.now();
  const dayAgo = now - 86_400_000;
  const recentUsage = input.usage.filter((event) => {
    const timestamp = new Date(event.createdAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= dayAgo;
  });
  const recentDeliveries = input.deliveries.filter((delivery) => {
    const timestamp = new Date(delivery.createdAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= dayAgo;
  });
  const activeClientIds = new Set(recentUsage.map((event) => event.clientId).filter((clientId): clientId is string => Boolean(clientId)));
  const successfulRequests24h = recentUsage.filter((event) => isUsageSuccess(event)).length;
  const failedRequests24h = recentUsage.filter((event) => isUsageFailure(event)).length;
  const requests24h = recentUsage.length;
  const messageEvents = recentUsage.filter((event) => event.unitType === "message");
  const textMessages24h = messageEvents.filter((event) => isTextMessageUsage(event)).reduce((total, event) => total + event.quantity, 0);
  const mediaMessages24h = messageEvents.filter((event) => isMediaMessageUsage(event)).reduce((total, event) => total + event.quantity, 0);
  const latencyValues = recentUsage
    .map((event) => event.latencyMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const clientsById = new Map(input.clients.map((client) => [client.id, client]));

  return {
    requests24h,
    successfulRequests24h,
    failedRequests24h,
    successRate24h: requests24h > 0 ? Math.round((successfulRequests24h / requests24h) * 100) : 100,
    activeClients24h: activeClientIds.size,
    messages24h: messageEvents.reduce((total, event) => total + event.quantity, 0),
    textMessages24h,
    mediaMessages24h,
    instanceRequests24h: recentUsage.filter((event) => event.endpoint.includes("/instances")).length,
    webhookRequests24h: recentUsage.filter((event) => event.endpoint.includes("/webhooks")).length,
    providerProxyRequests24h: recentUsage.filter((event) => event.endpoint.includes("/provider/")).length,
    averageLatencyMs: averageNumbers(latencyValues),
    topEndpoints: buildTopEndpointTraffic(recentUsage),
    topClients: buildTopClientTraffic(recentUsage, recentDeliveries, clientsById),
  };
}

function buildTopEndpointTraffic(usage: ReturnType<typeof mapUsageEvent>[]) {
  type Bucket = {
    endpoint: string;
    method: string;
    requests: number;
    errors: number;
    messages: number;
    latencyTotal: number;
    latencyCount: number;
    lastUsedAt: string | null;
  };
  const buckets = new Map<string, Bucket>();

  for (const event of usage) {
    const key = `${event.method} ${event.endpoint}`;
    const bucket = buckets.get(key) ?? {
      endpoint: event.endpoint,
      method: event.method,
      requests: 0,
      errors: 0,
      messages: 0,
      latencyTotal: 0,
      latencyCount: 0,
      lastUsedAt: null,
    };

    bucket.requests += 1;
    bucket.errors += isUsageFailure(event) ? 1 : 0;
    bucket.messages += event.unitType === "message" ? event.quantity : 0;
    if (typeof event.latencyMs === "number") {
      bucket.latencyTotal += event.latencyMs;
      bucket.latencyCount += 1;
    }
    bucket.lastUsedAt = pickLatestIso(bucket.lastUsedAt, event.createdAt);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.requests - a.requests || b.errors - a.errors)
    .slice(0, 8)
    .map((bucket) => ({
      endpoint: bucket.endpoint,
      method: bucket.method,
      requests: bucket.requests,
      errors: bucket.errors,
      messages: bucket.messages,
      averageLatencyMs: bucket.latencyCount > 0 ? Math.round(bucket.latencyTotal / bucket.latencyCount) : null,
      lastUsedAt: bucket.lastUsedAt,
    }));
}

function buildTopClientTraffic(
  usage: ReturnType<typeof mapUsageEvent>[],
  deliveries: ReturnType<typeof mapWebhookDelivery>[],
  clientsById: Map<string, ReturnType<typeof mapApiClient> & { organization?: ReturnType<typeof mapOrganization> }>,
) {
  type Bucket = {
    clientId: string | null;
    clientName: string;
    organizationName: string | null;
    requests: number;
    errors: number;
    messages: number;
    webhookDeliveries: number;
    webhookFailures: number;
    lastUsedAt: string | null;
  };
  const buckets = new Map<string, Bucket>();

  for (const event of usage) {
    const key = event.clientId ?? "unknown";
    const client = event.clientId ? clientsById.get(event.clientId) : null;
    const bucket = buckets.get(key) ?? {
      clientId: event.clientId,
      clientName: client?.name ?? "Sem cliente",
      organizationName: client?.organization?.name ?? null,
      requests: 0,
      errors: 0,
      messages: 0,
      webhookDeliveries: 0,
      webhookFailures: 0,
      lastUsedAt: null,
    };

    bucket.requests += 1;
    bucket.errors += isUsageFailure(event) ? 1 : 0;
    bucket.messages += event.unitType === "message" ? event.quantity : 0;
    bucket.lastUsedAt = pickLatestIso(bucket.lastUsedAt, event.createdAt);
    buckets.set(key, bucket);
  }

  for (const delivery of deliveries) {
    const key = delivery.clientId ?? "unknown";
    const client = delivery.clientId ? clientsById.get(delivery.clientId) : null;
    const bucket = buckets.get(key) ?? {
      clientId: delivery.clientId,
      clientName: client?.name ?? "Sem cliente",
      organizationName: client?.organization?.name ?? null,
      requests: 0,
      errors: 0,
      messages: 0,
      webhookDeliveries: 0,
      webhookFailures: 0,
      lastUsedAt: null,
    };

    bucket.webhookDeliveries += 1;
    bucket.webhookFailures += delivery.status === "failed" ? 1 : 0;
    bucket.lastUsedAt = pickLatestIso(bucket.lastUsedAt, delivery.createdAt);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.requests + b.webhookDeliveries - (a.requests + a.webhookDeliveries))
    .slice(0, 8);
}

function isUsageSuccess(event: ReturnType<typeof mapUsageEvent>) {
  return typeof event.statusCode === "number" && event.statusCode >= 200 && event.statusCode < 400;
}

function isUsageFailure(event: ReturnType<typeof mapUsageEvent>) {
  return !isUsageSuccess(event)
    || (typeof event.providerStatus === "number" && event.providerStatus >= 400);
}

function isTextMessageUsage(event: ReturnType<typeof mapUsageEvent>) {
  const messageType = typeof event.metadata.messageType === "string" ? event.metadata.messageType.toLowerCase() : "";
  return event.endpoint.includes("/messages/text") || messageType === "text";
}

function isMediaMessageUsage(event: ReturnType<typeof mapUsageEvent>) {
  if (event.unitType !== "message") return false;
  return !isTextMessageUsage(event);
}

function averageNumbers(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function pickLatestIso(current: string | null, candidate: string | null | undefined) {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

function mapOrganization(row: OrganizationRow | null | undefined) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    planCode: row.plan_code,
    status: row.status,
  };
}

function readFirst<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function extractProviderInstances(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (!isRecord(value)) {
    return [];
  }

  const candidates = [value.instances, value.data, value.result, value.results];
  const list = candidates.find(Array.isArray);

  return Array.isArray(list) ? list.filter(isRecord) : [];
}

function normalizeProviderInstanceName(value: string | null | undefined) {
  const base = slugify(value || "connectyhub-api").slice(0, 48);
  return `ch-api-${base || randomBytes(4).toString("hex")}`.slice(0, 64);
}

function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

function normalizeUrl(value: string | null | undefined) {
  if (!value) return null;

  let raw = value.trim();
  if (!raw) return null;

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.pathname === "/" || !url.pathname) {
      url.pathname = DEFAULT_CLIENT_WEBHOOK_PATH;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeQrCode(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.startsWith("data:image/") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 120) {
    return `data:image/png;base64,${value}`;
  }

  return value;
}

function normalizeWebhookEvents(events: string[] | null | undefined) {
  const cleaned = (events ?? [])
    .filter((event) => typeof event === "string")
    .map((event) => event.trim())
    .filter(Boolean);

  return cleaned.length ? Array.from(new Set(cleaned)) : ["messages", "messages_update", "connection"];
}

function normalizeSearchBody(value: JsonRecord | null | undefined, defaults: JsonRecord) {
  const body = isRecord(value) ? { ...value } : {};
  const limit = normalizePositiveInteger(typeof body.limit === "number" ? body.limit : null, 1, 1000);
  const offset = normalizePositiveInteger(typeof body.offset === "number" ? body.offset : null, 0, 100_000);

  return {
    ...defaults,
    ...body,
    ...(limit !== null ? { limit } : {}),
    ...(offset !== null ? { offset } : {}),
  };
}

function normalizeMediaType(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  const allowed = new Set(["image", "video", "videoplay", "document", "audio", "myaudio", "ptt", "ptv", "sticker"]);

  return allowed.has(normalized) ? normalized : null;
}

function normalizePositiveInteger(value: number | string | null | undefined, min: number, max: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : NaN;

  if (!Number.isFinite(number)) {
    return null;
  }

  const integer = Math.trunc(number);

  if (integer < min) return min;
  if (integer > max) return max;
  return integer;
}

function removeUndefined(value: JsonRecord) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function resolvePublicAppUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");

  if (explicit) {
    return explicit;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "https://www.connectyhub.com.br";
}

function normalizeIdempotencyKey(value: string | null | undefined) {
  const key = value?.trim();

  if (!key) {
    return null;
  }

  if (key.length > 160) {
    throw new GatewayHttpError(422, "invalid_idempotency_key", "Idempotency-Key deve ter no maximo 160 caracteres.");
  }

  return key;
}

function isProxyPathAllowed(path: string) {
  const normalized = path.toLowerCase();
  const blockedPrefixes = ["/admin", "/globalwebhook", "/instance/all", "/instance/create", "/instance/delete"];
  return normalized.startsWith("/") && !normalized.includes("..") && !blockedPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function sanitizeProviderData(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubProviderName(value);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeProviderData);
  }

  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, item]) => {
      const normalized = key.toLowerCase();

      if (normalized.includes("token") || normalized.includes("secret") || normalized.includes("qrcode")) {
        return [key, "[redacted]"];
      }

      if (typeof item === "string" && item.length > 500 && (normalized.includes("image") || normalized.includes("photo") || normalized.includes("picture"))) {
        return [key, "[redacted-image]"];
      }

      return [key, sanitizeProviderData(item)];
    }),
  );
}

function readProviderError(value: unknown) {
  if (typeof value === "string") {
    return scrubProviderName(value).trim() || null;
  }

  const message = findString(value, ["error", "message", "detail"]);
  return message ? scrubProviderName(message) : null;
}

function scrubProviderName(value: string) {
  return value.replace(/\buazapi\b/gi, "provedor WhatsApp");
}

function previewText(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function findString(value: unknown, keys: string[]): string | null {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => lowerKeys.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0);

  return typeof found === "string" ? found.trim() : null;
}

function findValue(value: unknown, predicate: (key: string, value: unknown) => boolean): unknown {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, predicate);
      if (found) return found;
    }

    return null;
  }

  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (predicate(key, item)) {
      return item;
    }

    const found = findValue(item, predicate);
    if (found) return found;
  }

  return null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMetadataString(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetadataBoolean(record: JsonRecord, key: string) {
  return record[key] === true;
}

function readMetadataStringArray(record: JsonRecord, key: string) {
  const value = record[key];
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())));
}

function normalizeComparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

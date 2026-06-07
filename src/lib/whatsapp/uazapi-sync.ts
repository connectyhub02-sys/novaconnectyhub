import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptCredentialValue, previewCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { loadUazapiCredentials, type UazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;

type ExistingInstanceRow = {
  id: string;
  organization_id: string;
};

type OrganizationLookup = {
  organizationId: string;
  ownerUserId: string | null;
  reason: string;
};

export type UazapiSyncedInstance = {
  providerInstanceId: string;
  organizationId: string;
  status: string;
  phoneNumber: string | null;
  displayName: string | null;
  webhookConfigured: boolean;
};

export type UazapiSkippedInstance = {
  providerInstanceId: string;
  name: string | null;
  reason: string;
};

export type UazapiInstanceSyncSummary = {
  checkedAt: string;
  total: number;
  upserted: number;
  skipped: number;
  webhooksConfigured: number;
  webhookFailures: number;
  instances: UazapiSyncedInstance[];
  skippedInstances: UazapiSkippedInstance[];
  errors: string[];
};

export async function syncUazapiInstances(options: {
  actorId?: string | null;
  configureWebhooks?: boolean;
  client?: SupabaseClient;
} = {}): Promise<UazapiInstanceSyncSummary> {
  const client = options.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const checkedAt = new Date().toISOString();
  const response = await fetchUazapiJson(`${credentials.baseUrl}/instance/all`, {
    headers: {
      Accept: "application/json",
      admintoken: credentials.adminToken,
    },
  });

  if (!response.ok) {
    throw new Error(`Uazapi /instance/all respondeu status ${response.status}.`);
  }

  const providerInstances = extractInstanceList(response.data);
  const summary: UazapiInstanceSyncSummary = {
    checkedAt,
    total: providerInstances.length,
    upserted: 0,
    skipped: 0,
    webhooksConfigured: 0,
    webhookFailures: 0,
    instances: [],
    skippedInstances: [],
    errors: [],
  };

  for (const providerInstance of providerInstances) {
    const syncResult = await syncOneInstance({
      client,
      credentials,
      providerInstance,
      checkedAt,
      actorId: options.actorId ?? null,
      configureWebhook: options.configureWebhooks !== false,
    });

    if (syncResult.ok) {
      summary.upserted += 1;
      summary.webhooksConfigured += syncResult.instance.webhookConfigured ? 1 : 0;
      summary.webhookFailures += syncResult.webhookFailed ? 1 : 0;
      summary.instances.push(syncResult.instance);
    } else {
      summary.skipped += 1;
      summary.skippedInstances.push(syncResult.skipped);
    }

    if (syncResult.error) {
      summary.errors.push(syncResult.error);
    }
  }

  await client.from("maintenance_audit_logs").insert({
    actor_id: options.actorId ?? null,
    event_type: "whatsapp.instances.synced",
    target_table: "whatsapp_instances",
    target_id: null,
    metadata: {
      checkedAt,
      total: summary.total,
      upserted: summary.upserted,
      skipped: summary.skipped,
      webhooksConfigured: summary.webhooksConfigured,
      webhookFailures: summary.webhookFailures,
      errors: summary.errors.slice(0, 10),
    },
  });

  return summary;
}

async function syncOneInstance({
  client,
  credentials,
  providerInstance,
  checkedAt,
  actorId,
  configureWebhook,
}: {
  client: SupabaseClient;
  credentials: UazapiCredentials;
  providerInstance: JsonRecord;
  checkedAt: string;
  actorId: string | null;
  configureWebhook: boolean;
}): Promise<
  | {
      ok: true;
      instance: UazapiSyncedInstance;
      webhookFailed: boolean;
      error?: string;
    }
  | {
      ok: false;
      skipped: UazapiSkippedInstance;
      error?: string;
    }
> {
  const providerInstanceId = readString(providerInstance, ["id", "instance_id", "instanceId", "instanceid"]);
  const name = readString(providerInstance, ["name", "systemName", "profileName"]);

  if (!providerInstanceId) {
    return {
      ok: false,
      skipped: {
        providerInstanceId: "unknown",
        name,
        reason: "Instancia sem id retornada pela Uazapi.",
      },
    };
  }

  const organization = await resolveInstanceOrganization(client, providerInstanceId, providerInstance);

  if (!organization) {
    return {
      ok: false,
      skipped: {
        providerInstanceId,
        name,
        reason: "Nao foi possivel mapear a instancia para uma organizacao.",
      },
    };
  }

  const token = readString(providerInstance, ["token"]);
  const webhookResult =
    configureWebhook && credentials.webhookUrl && token
      ? await configureInstanceWebhook(credentials, token)
      : { ok: false as const, reason: "Webhook nao configurado por falta de URL ou token." };
  const status = normalizeWhatsappStatus(readString(providerInstance, ["status", "state", "connectionStatus"]));
  const phoneNumber = normalizePhone(readString(providerInstance, ["owner", "phone", "number", "phone_number"]));
  const displayName = readString(providerInstance, ["profileName", "name", "systemName", "displayName"]);
  const tokenPayload = buildTokenPayload(token);
  const payload = {
    organization_id: organization.organizationId,
    owner_user_id: organization.ownerUserId,
    provider: "uazapi",
    provider_instance_id: providerInstanceId,
    phone_number: phoneNumber,
    display_name: displayName,
    status,
    instance_token_preview: token ? previewCredentialValue(token, "secret") : null,
    webhook_url: credentials.webhookUrl,
    webhook_configured_at: webhookResult.ok ? checkedAt : null,
    last_synced_at: checkedAt,
    provider_payload: sanitizeProviderPayload(providerInstance),
    metadata: {
      sync_source: "uazapi",
      sync_reason: organization.reason,
      webhook_status: webhookResult.ok ? "configured" : "not_configured",
      webhook_error: webhookResult.ok ? null : webhookResult.reason,
      synced_at: checkedAt,
    },
    updated_at: checkedAt,
    ...tokenPayload,
  };

  const { data: existing, error: lookupError } = await client
    .from("whatsapp_instances")
    .select("id, organization_id")
    .eq("provider", "uazapi")
    .eq("provider_instance_id", providerInstanceId)
    .maybeSingle<ExistingInstanceRow>();

  if (lookupError) {
    return {
      ok: false,
      skipped: {
        providerInstanceId,
        name,
        reason: lookupError.message,
      },
      error: lookupError.message,
    };
  }

  const saveResult = existing
    ? await client.from("whatsapp_instances").update(payload).eq("id", existing.id).select("id").single()
    : await client
        .from("whatsapp_instances")
        .insert({
          ...payload,
          plan_code: "trial",
          created_by: actorId,
        })
        .select("id")
        .single();

  if (saveResult.error) {
    return {
      ok: false,
      skipped: {
        providerInstanceId,
        name,
        reason: saveResult.error.message,
      },
      error: saveResult.error.message,
    };
  }

  return {
    ok: true,
    instance: {
      providerInstanceId,
      organizationId: organization.organizationId,
      status,
      phoneNumber,
      displayName,
      webhookConfigured: webhookResult.ok,
    },
    webhookFailed: Boolean(credentials.webhookUrl && token && !webhookResult.ok),
    error: webhookResult.ok ? undefined : webhookResult.reason,
  };
}

async function resolveInstanceOrganization(
  client: SupabaseClient,
  providerInstanceId: string,
  providerInstance: JsonRecord,
): Promise<OrganizationLookup | null> {
  const { data: existing } = await client
    .from("whatsapp_instances")
    .select("id, organization_id")
    .eq("provider", "uazapi")
    .eq("provider_instance_id", providerInstanceId)
    .maybeSingle<ExistingInstanceRow>();

  if (existing?.organization_id) {
    return {
      organizationId: existing.organization_id,
      ownerUserId: null,
      reason: "existing_whatsapp_instance",
    };
  }

  const directOrganizationId = findFirstUuid([
    readString(providerInstance, ["organizationId", "organization_id", "orgId", "org_id"]),
    readString(providerInstance, ["adminField01", "adminField02"]),
  ]);

  if (directOrganizationId) {
    const organization = await findOrganizationById(client, directOrganizationId);

    if (organization) {
      return {
        organizationId: organization.id,
        ownerUserId: organization.owner_id,
        reason: "provider_admin_field",
      };
    }
  }

  const userId = findFirstUuid([
    readString(providerInstance, ["owner_user_id", "userId", "user_id", "adminField02"]),
    readString(providerInstance, ["name", "systemName"]),
  ]);

  if (userId) {
    const organization = await findOrganizationByUser(client, userId);

    if (organization) {
      return {
        organizationId: organization.id,
        ownerUserId: userId,
        reason: "provider_user_reference",
      };
    }
  }

  return null;
}

async function findOrganizationById(client: SupabaseClient, organizationId: string) {
  const { data } = await client
    .from("organizations")
    .select("id, owner_id")
    .eq("id", organizationId)
    .maybeSingle<{ id: string; owner_id: string | null }>();

  return data ?? null;
}

async function findOrganizationByUser(client: SupabaseClient, userId: string) {
  const { data: owned } = await client
    .from("organizations")
    .select("id, owner_id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; owner_id: string | null }>();

  if (owned) {
    return owned;
  }

  const { data: membership } = await client
    .from("organization_members")
    .select("organizations(id, owner_id)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ organizations: { id: string; owner_id: string | null } | null }>();

  return membership?.organizations ?? null;
}

async function configureInstanceWebhook(credentials: UazapiCredentials, token: string) {
  if (!credentials.webhookUrl) {
    return { ok: false as const, reason: "NEXT_PUBLIC_APP_URL nao configurada." };
  }

  const response = await fetchUazapiJson(`${credentials.baseUrl}/webhook`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token,
    },
    body: JSON.stringify({
      url: buildProviderWebhookUrl(credentials),
      events: ["messages", "messages_update", "connection", "history", "presence", "chats", "contacts"],
      excludeMessages: ["wasSentByApi"],
      addUrlEvents: true,
      addUrlTypesMessages: true,
    }),
  });

  if (!response.ok) {
    return {
      ok: false as const,
      reason: `Uazapi webhook respondeu status ${response.status}.`,
    };
  }

  return { ok: true as const };
}

async function fetchUazapiJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });
  const data = await readResponse(response);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
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

function extractInstanceList(value: unknown) {
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

function normalizeWhatsappStatus(value: string | null) {
  const normalized = value?.toLowerCase() ?? "";

  if (normalized.includes("connect") && !normalized.includes("disconnect")) {
    return "connected";
  }

  if (normalized.includes("disconnect") || normalized.includes("close")) {
    return "disconnected";
  }

  if (normalized.includes("block")) {
    return "blocked";
  }

  if (normalized.includes("qr")) {
    return "qr_pending";
  }

  if (normalized.includes("error") || normalized.includes("fail")) {
    return "error";
  }

  return "draft";
}

function buildTokenPayload(token: string | null) {
  if (!token) {
    return {};
  }

  try {
    return {
      instance_token_encrypted: encryptCredentialValue(token),
    };
  } catch {
    return {};
  }
}

function sanitizeProviderPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeProviderPayload);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey.includes("token") ||
        normalizedKey.includes("apikey") ||
        normalizedKey.includes("qrcode") ||
        normalizedKey.includes("paircode")
      ) {
        return [key, "__redacted__"];
      }

      return [key, sanitizeProviderPayload(nestedValue)];
    }),
  );
}

function buildProviderWebhookUrl(credentials: UazapiCredentials) {
  const url = new URL(credentials.webhookUrl ?? "");

  if (credentials.webhookSecret) {
    url.searchParams.set("secret", credentials.webhookSecret);
  }

  return url.toString();
}

function readString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function normalizePhone(value: string | null) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");

  return digits.length >= 8 ? digits : null;
}

function findFirstUuid(values: Array<string | null>) {
  for (const value of values) {
    const match = value?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

    if (match) {
      return match[0].toLowerCase();
    }
  }

  return null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

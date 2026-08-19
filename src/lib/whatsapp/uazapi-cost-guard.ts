import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { getOrganizationBillingAccess, TRIAL_CREDIT_CONVERSION_GRACE_DAYS } from "@/lib/billing/trial";
import { deleteUazapiProviderInstance } from "./uazapi-instance-cleanup";
import { loadUazapiCredentials } from "./uazapi-credentials";
import { syncUazapiInstances } from "./uazapi-sync";

type JsonRecord = Record<string, unknown>;

type SettingsRow = {
  metadata: JsonRecord | null;
  updated_at: string | null;
};

type RelatedOrganization =
  | {
      name: string | null;
      slug: string | null;
      plan_code: string | null;
      status: string | null;
      created_at: string | null;
    }
  | {
      name: string | null;
      slug: string | null;
      plan_code: string | null;
      status: string | null;
      created_at: string | null;
    }[]
  | null;

type InstanceRow = {
  id: string;
  organization_id: string;
  connectyhub_api_client_id: string | null;
  connectyhub_api_visibility: string | null;
  provider_instance_id: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: string | null;
  instance_token_encrypted: string | null;
  last_heartbeat_at: string | null;
  last_synced_at: string | null;
  disconnected_at: string | null;
  updated_at: string | null;
  metadata: JsonRecord | null;
  organizations: RelatedOrganization;
};

type BillingCacheValue = Awaited<ReturnType<typeof getOrganizationBillingAccess>>;

export type UazapiCostGuardInstanceType =
  | "api_customer"
  | "client_agent"
  | "internal_platform"
  | "unknown";

export type UazapiCostGuardDecision =
  | "keep_connected"
  | "keep_pending"
  | "delete_disconnected"
  | "archive_provider_missing"
  | "hold_trial_grace"
  | "skip_internal"
  | "skip_unknown"
  | "skip_missing_provider_id"
  | "skip_rate_limited";

export type UazapiCostGuardMode = "dry_run" | "delete";

export type UazapiCostGuardSettings = {
  enabled: boolean;
  runTimeLocal: string;
  timezone: string;
  trialGraceDays: number;
  maxDeletionsPerRun: number;
  lastScheduledRunAt: string | null;
  lastScheduledRunStatus: string | null;
  lastScheduledRunSummary: UazapiCostGuardSummaryDigest | null;
  lastManualDryRunAt: string | null;
  lastManualDryRunSummary: UazapiCostGuardSummaryDigest | null;
  updatedAt: string | null;
};

export type UazapiCostGuardSettingsInput = {
  enabled?: boolean;
  runTimeLocal?: string;
  trialGraceDays?: number;
  maxDeletionsPerRun?: number;
};

export type UazapiCostGuardSummaryDigest = {
  checkedAt: string;
  mode: UazapiCostGuardMode;
  totalLocalInstances: number;
  totalProviderInstances: number;
  deleteCandidates: number;
  archivedMissingCandidates: number;
  deleted: number;
  archivedMissing: number;
  failed: number;
  skipped: number;
};

export type UazapiCostGuardRunSummary = UazapiCostGuardSummaryDigest & {
  triggerSource: string;
  status: "completed" | "skipped";
  reason: string | null;
  decisions: UazapiCostGuardDecisionPreview[];
  errors: string[];
};

export type UazapiCostGuardDecisionPreview = {
  instanceId: string;
  providerInstanceId: string | null;
  organizationName: string;
  instanceType: UazapiCostGuardInstanceType;
  status: string;
  decision: UazapiCostGuardDecision;
  reason: string;
  eligibleAt: string | null;
  providerDeleted: boolean | null;
};

export type UazapiCostGuardAdminState = {
  settings: UazapiCostGuardSettings;
  scheduler: {
    enabled: boolean;
    timezone: string;
    currentLocalDate: string;
    currentLocalTime: string;
    nextRunLabel: string;
    dueNow: boolean;
  };
  snapshot: {
    total: number;
    connected: number;
    disconnected: number;
    apiCustomer: number;
    clientAgent: number;
    internalPlatform: number;
    unknown: number;
  };
  recentRuns: Array<{
    id: string;
    createdAt: string | null;
    mode: string | null;
    status: string | null;
    deleted: number;
    archivedMissing: number;
    failed: number;
    skipped: number;
  }>;
};

const metadataKey = "uazapi_cost_guard";
const defaultTimezone = "America/Sao_Paulo";
const defaultRunTime = "23:30";
const maxPreviewItems = 80;

export async function getUazapiCostGuardAdminState(
  client: SupabaseClient = createServiceClient(),
): Promise<UazapiCostGuardAdminState> {
  const settings = await loadUazapiCostGuardSettings(client);
  const now = new Date();
  const localClock = getLocalClock(now, settings.timezone);
  const dueNow = isScheduledRunDue(settings, now);
  const rows = await loadLocalUazapiInstances(client);
  const snapshot = buildSnapshot(rows);
  const recentRuns = await loadRecentRuns(client);

  return {
    settings,
    scheduler: {
      enabled: settings.enabled,
      timezone: settings.timezone,
      currentLocalDate: localClock.date,
      currentLocalTime: localClock.time,
      nextRunLabel: buildNextRunLabel(settings, localClock),
      dueNow,
    },
    snapshot,
    recentRuns,
  };
}

export async function updateUazapiCostGuardSettings(input: {
  actorId: string;
  settings: UazapiCostGuardSettingsInput;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const current = await loadRawSettingsMetadata(client);
  const currentSettings = normalizeSettings(current.metadata, current.updated_at);
  const nextSettings: UazapiCostGuardSettings = {
    ...currentSettings,
    enabled: typeof input.settings.enabled === "boolean" ? input.settings.enabled : currentSettings.enabled,
    runTimeLocal: normalizeRunTime(input.settings.runTimeLocal, currentSettings.runTimeLocal),
    trialGraceDays: normalizeInteger(input.settings.trialGraceDays, currentSettings.trialGraceDays, 0, 30),
    maxDeletionsPerRun: normalizeInteger(input.settings.maxDeletionsPerRun, currentSettings.maxDeletionsPerRun, 1, 250),
  };

  await saveSettingsMetadata(client, {
    ...current.metadata,
    [metadataKey]: serializeSettings(nextSettings),
  }, input.actorId);

  await client.from("maintenance_audit_logs").insert({
    actor_id: input.actorId,
    event_type: "uazapi.cost_guard.settings_updated",
    target_table: "platform_billing_settings",
    target_id: null,
    metadata: {
      enabled: nextSettings.enabled,
      runTimeLocal: nextSettings.runTimeLocal,
      timezone: nextSettings.timezone,
      trialGraceDays: nextSettings.trialGraceDays,
      maxDeletionsPerRun: nextSettings.maxDeletionsPerRun,
    },
  });

  return getUazapiCostGuardAdminState(client);
}

export async function runScheduledUazapiCostGuard(input: {
  client?: SupabaseClient;
  triggerSource?: string;
} = {}): Promise<UazapiCostGuardRunSummary> {
  const client = input.client ?? createServiceClient();
  const settings = await loadUazapiCostGuardSettings(client);

  if (!settings.enabled) {
    return buildSkippedRun(settings, input.triggerSource ?? "inngest_cron", "disabled");
  }

  if (!isScheduledRunDue(settings, new Date())) {
    return buildSkippedRun(settings, input.triggerSource ?? "inngest_cron", "not_due");
  }

  return runUazapiInstanceCostGuard({
    client,
    mode: "delete",
    settings,
    triggerSource: input.triggerSource ?? "inngest_cron",
    updateScheduledRun: true,
  });
}

export async function runUazapiInstanceCostGuard(input: {
  client?: SupabaseClient;
  mode: UazapiCostGuardMode;
  settings?: UazapiCostGuardSettings;
  triggerSource: string;
  actorId?: string | null;
  updateScheduledRun?: boolean;
}): Promise<UazapiCostGuardRunSummary> {
  const client = input.client ?? createServiceClient();
  const settings = input.settings ?? await loadUazapiCostGuardSettings(client);
  const checkedAt = new Date().toISOString();
  const errors: string[] = [];
  let deleted = 0;
  let archivedMissing = 0;
  let failed = 0;
  let skipped = 0;
  let deleteCandidates = 0;
  let archivedMissingCandidates = 0;
  let processedDeletes = 0;

  const syncSummary = await syncUazapiInstances({
    actorId: input.actorId ?? null,
    configureWebhooks: false,
    client,
  });
  const providerIds = new Set([
    ...syncSummary.instances.map((item) => item.providerInstanceId),
    ...syncSummary.skippedInstances.map((item) => item.providerInstanceId),
  ].filter((item) => item && item !== "unknown"));

  const rows = await loadLocalUazapiInstances(client);
  const credentials = input.mode === "delete" ? await loadUazapiCredentials(client) : null;
  const billingCache = new Map<string, BillingCacheValue | null>();
  const decisions: UazapiCostGuardDecisionPreview[] = [];

  for (const row of rows) {
    const plan = await planInstanceDecision({
      client,
      row,
      providerIds,
      settings,
      billingCache,
    });

    if (plan.decision === "delete_disconnected") {
      deleteCandidates += 1;
    }

    if (plan.decision === "archive_provider_missing") {
      archivedMissingCandidates += 1;
    }

    if (input.mode === "delete" && plan.decision === "delete_disconnected" && processedDeletes >= settings.maxDeletionsPerRun) {
      plan.decision = "skip_rate_limited";
      plan.reason = "Limite maximo de exclusoes desta execucao atingido.";
    }

    let providerDeleted: boolean | null = null;

    try {
      if (input.mode === "delete" && plan.decision === "delete_disconnected") {
        processedDeletes += 1;
        const deleteResult = await deleteUazapiProviderInstance({
          credentials: credentials!,
          providerInstanceId: row.provider_instance_id,
          token: decryptInstanceToken(row.instance_token_encrypted),
        });

        providerDeleted = deleteResult.providerDeleted;

        if (!deleteResult.providerDeleted && !deleteResult.skipped) {
          failed += 1;
          errors.push(`Falha ao excluir ${row.id}: status ${deleteResult.providerStatus ?? "desconhecido"}.`);
        } else {
          await archiveInstanceAfterCostGuard(client, row, {
            checkedAt,
            reason: "uazapi_cost_guard_disconnected",
            actorId: input.actorId ?? null,
            deleteResult,
          });
          deleted += 1;
        }
      } else if (input.mode === "delete" && plan.decision === "archive_provider_missing") {
        await archiveInstanceAfterCostGuard(client, row, {
          checkedAt,
          reason: "uazapi_cost_guard_provider_missing",
          actorId: input.actorId ?? null,
          deleteResult: {
            providerDeleted: true,
            providerStatus: 404,
            providerResponse: { message: "provider_missing_from_instance_all" },
            refreshedTokenUsed: false,
            skipped: true,
          },
        });
        archivedMissing += 1;
        providerDeleted = true;
      } else if (plan.decision !== "keep_connected") {
        skipped += 1;
      }
    } catch (error) {
      failed += 1;
      errors.push(error instanceof Error ? error.message : `Falha inesperada na instancia ${row.id}.`);
    }

    if (decisions.length < maxPreviewItems) {
      decisions.push({
        instanceId: row.id,
        providerInstanceId: row.provider_instance_id,
        organizationName: readOrganization(row.organizations)?.name ?? "Empresa sem nome",
        instanceType: plan.instanceType,
        status: row.status ?? "draft",
        decision: plan.decision,
        reason: plan.reason,
        eligibleAt: plan.eligibleAt,
        providerDeleted,
      });
    }
  }

  const summary: UazapiCostGuardRunSummary = {
    checkedAt,
    mode: input.mode,
    triggerSource: input.triggerSource,
    status: "completed",
    reason: null,
    totalLocalInstances: rows.length,
    totalProviderInstances: providerIds.size,
    deleteCandidates,
    archivedMissingCandidates,
    deleted,
    archivedMissing,
    failed,
    skipped,
    decisions,
    errors,
  };

  await recordRun(client, summary, input.actorId ?? null);

  if (input.updateScheduledRun || input.mode === "dry_run") {
    await updateLastRunMetadata(client, summary, input.mode === "delete" ? "scheduled" : "manual_dry_run", input.actorId ?? null);
  }

  return summary;
}

export function isScheduledRunDue(settings: UazapiCostGuardSettings, now: Date) {
  if (!settings.enabled) return false;

  const localClock = getLocalClock(now, settings.timezone);
  const lastRunDate = settings.lastScheduledRunAt
    ? getLocalClock(new Date(settings.lastScheduledRunAt), settings.timezone).date
    : null;

  return localClock.time >= settings.runTimeLocal && lastRunDate !== localClock.date;
}

async function planInstanceDecision(input: {
  client: SupabaseClient;
  row: InstanceRow;
  providerIds: Set<string>;
  settings: UazapiCostGuardSettings;
  billingCache: Map<string, BillingCacheValue | null>;
}): Promise<{
  decision: UazapiCostGuardDecision;
  reason: string;
  eligibleAt: string | null;
  instanceType: UazapiCostGuardInstanceType;
}> {
  const instanceType = classifyInstance(input.row);

  if (!input.row.provider_instance_id) {
    return {
      decision: "skip_missing_provider_id",
      reason: "Registro local sem provider_instance_id.",
      eligibleAt: null,
      instanceType,
    };
  }

  if (!input.providerIds.has(input.row.provider_instance_id)) {
    if (instanceType === "api_customer" || instanceType === "client_agent") {
      return {
        decision: "archive_provider_missing",
        reason: "Instancia nao aparece mais no /instance/all da Uazapi.",
        eligibleAt: null,
        instanceType,
      };
    }

    return {
      decision: instanceType === "internal_platform" ? "skip_internal" : "skip_unknown",
      reason: "Instancia fora do provedor, mas a origem exige revisao manual.",
      eligibleAt: null,
      instanceType,
    };
  }

  if (input.row.status === "connected") {
    return {
      decision: "keep_connected",
      reason: "Instancia conectada.",
      eligibleAt: null,
      instanceType,
    };
  }

  if (input.row.status !== "disconnected") {
    return {
      decision: "keep_pending",
      reason: "Instancia ainda nao esta marcada como desconectada.",
      eligibleAt: null,
      instanceType,
    };
  }

  if (instanceType === "internal_platform") {
    return {
      decision: "skip_internal",
      reason: "Instancia interna da ConnectyHub exige exclusao manual.",
      eligibleAt: null,
      instanceType,
    };
  }

  if (instanceType === "unknown") {
    return {
      decision: "skip_unknown",
      reason: "Origem da instancia nao esta classificada como API ou agente do cliente.",
      eligibleAt: null,
      instanceType,
    };
  }

  const billing = await getCachedBilling(input.client, input.row.organization_id, input.billingCache);
  const trialHold = resolveTrialHold(billing, input.settings.trialGraceDays);

  if (trialHold.hold) {
    return {
      decision: "hold_trial_grace",
      reason: trialHold.reason,
      eligibleAt: trialHold.eligibleAt,
      instanceType,
    };
  }

  return {
    decision: "delete_disconnected",
    reason: instanceType === "api_customer"
      ? "Instancia API desconectada confirmada no provedor."
      : "Instancia de agente de cliente desconectada confirmada no provedor.",
    eligibleAt: trialHold.eligibleAt,
    instanceType,
  };
}

async function archiveInstanceAfterCostGuard(
  client: SupabaseClient,
  row: InstanceRow,
  input: {
    checkedAt: string;
    reason: string;
    actorId: string | null;
    deleteResult: Awaited<ReturnType<typeof deleteUazapiProviderInstance>>;
  },
) {
  const { error } = await client
    .from("whatsapp_instances")
    .update({
      status: "archived",
      qr_status: null,
      instance_token_preview: null,
      instance_token_encrypted: null,
      webhook_url: null,
      webhook_configured_at: null,
      disconnected_at: row.disconnected_at ?? input.checkedAt,
      last_synced_at: input.checkedAt,
      metadata: {
        ...(row.metadata ?? {}),
        archived_reason: input.reason,
        archived_at: input.checkedAt,
        archived_by: input.actorId,
        cost_guard_archived: true,
        cost_guard_archived_at: input.checkedAt,
        cost_guard_reason: input.reason,
        provider_delete_ok: input.deleteResult.providerDeleted,
        provider_delete_status: input.deleteResult.providerStatus,
        provider_delete_response: input.deleteResult.providerResponse,
        provider_delete_refreshed_token_used: input.deleteResult.refreshedTokenUsed,
        provider_delete_skipped: input.deleteResult.skipped,
      },
    })
    .eq("id", row.id)
    .neq("status", "archived");

  if (error) {
    throw new Error(`Nao foi possivel arquivar instancia ${row.id}: ${error.message}`);
  }
}

async function loadUazapiCostGuardSettings(client: SupabaseClient): Promise<UazapiCostGuardSettings> {
  const row = await loadRawSettingsMetadata(client);
  return normalizeSettings(row.metadata, row.updated_at);
}

async function loadRawSettingsMetadata(client: SupabaseClient): Promise<SettingsRow> {
  const { data, error } = await client
    .from("platform_billing_settings")
    .select("metadata, updated_at")
    .eq("setting_key", "default")
    .maybeSingle<SettingsRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar configuracao da limpeza Uazapi: ${error.message}`);
  }

  return {
    metadata: data?.metadata ?? {},
    updated_at: data?.updated_at ?? null,
  };
}

async function saveSettingsMetadata(client: SupabaseClient, metadata: JsonRecord, actorId: string | null) {
  const { data: updated, error: updateError } = await client
    .from("platform_billing_settings")
    .update({
      metadata,
      updated_by: actorId,
    })
    .eq("setting_key", "default")
    .select("setting_key")
    .maybeSingle<{ setting_key: string }>();

  if (updateError) {
    throw new Error(`Nao foi possivel salvar configuracao da limpeza Uazapi: ${updateError.message}`);
  }

  if (updated) {
    return;
  }

  const { error: insertError } = await client
    .from("platform_billing_settings")
    .insert({
      setting_key: "default",
      notification_whatsapp_enabled: true,
      pix_automatic_required: true,
      checkout_mode: "subscription",
      recurring_provider: "mercado_pago",
      metadata,
      updated_by: actorId,
    });

  if (insertError) {
    throw new Error(`Nao foi possivel criar configuracao da limpeza Uazapi: ${insertError.message}`);
  }
}

async function updateLastRunMetadata(
  client: SupabaseClient,
  summary: UazapiCostGuardRunSummary,
  kind: "scheduled" | "manual_dry_run",
  actorId: string | null,
) {
  const current = await loadRawSettingsMetadata(client);
  const settings = normalizeSettings(current.metadata, current.updated_at);
  const digest = toDigest(summary);
  const nextSettings: UazapiCostGuardSettings = kind === "scheduled"
    ? {
        ...settings,
        lastScheduledRunAt: summary.checkedAt,
        lastScheduledRunStatus: summary.failed > 0 ? "warning" : "completed",
        lastScheduledRunSummary: digest,
      }
    : {
        ...settings,
        lastManualDryRunAt: summary.checkedAt,
        lastManualDryRunSummary: digest,
      };

  await saveSettingsMetadata(client, {
    ...current.metadata,
    [metadataKey]: serializeSettings(nextSettings),
  }, actorId);
}

async function recordRun(client: SupabaseClient, summary: UazapiCostGuardRunSummary, actorId: string | null) {
  await client.from("maintenance_audit_logs").insert({
    actor_id: actorId,
    event_type: "uazapi.cost_guard.run",
    target_table: "whatsapp_instances",
    target_id: null,
    metadata: {
      checkedAt: summary.checkedAt,
      mode: summary.mode,
      triggerSource: summary.triggerSource,
      status: summary.status,
      totalLocalInstances: summary.totalLocalInstances,
      totalProviderInstances: summary.totalProviderInstances,
      deleteCandidates: summary.deleteCandidates,
      archivedMissingCandidates: summary.archivedMissingCandidates,
      deleted: summary.deleted,
      archivedMissing: summary.archivedMissing,
      failed: summary.failed,
      skipped: summary.skipped,
      errors: summary.errors.slice(0, 20),
      decisions: summary.decisions.slice(0, 30),
    },
  });
}

async function loadLocalUazapiInstances(client: SupabaseClient) {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select(
      "id, organization_id, connectyhub_api_client_id, connectyhub_api_visibility, provider_instance_id, phone_number, display_name, status, instance_token_encrypted, last_heartbeat_at, last_synced_at, disconnected_at, updated_at, metadata, organizations(name, slug, plan_code, status, created_at)",
    )
    .eq("provider", "uazapi")
    .neq("status", "archived")
    .limit(2000);

  if (error) {
    throw new Error(`Nao foi possivel carregar instancias Uazapi: ${error.message}`);
  }

  return (data ?? []) as InstanceRow[];
}

async function loadRecentRuns(client: SupabaseClient): Promise<UazapiCostGuardAdminState["recentRuns"]> {
  const { data, error } = await client
    .from("maintenance_audit_logs")
    .select("id, created_at, metadata")
    .eq("event_type", "uazapi.cost_guard.run")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    return [];
  }

  return (data ?? []).map((row) => {
    const metadata = readRecord(row.metadata);

    return {
      id: String(row.id),
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
      mode: readString(metadata.mode),
      status: readString(metadata.status),
      deleted: readNumber(metadata.deleted),
      archivedMissing: readNumber(metadata.archivedMissing),
      failed: readNumber(metadata.failed),
      skipped: readNumber(metadata.skipped),
    };
  });
}

async function getCachedBilling(
  client: SupabaseClient,
  organizationId: string,
  cache: Map<string, BillingCacheValue | null>,
) {
  if (cache.has(organizationId)) {
    return cache.get(organizationId) ?? null;
  }

  try {
    const billing = await getOrganizationBillingAccess({ organizationId, client });
    cache.set(organizationId, billing);
    return billing;
  } catch {
    cache.set(organizationId, null);
    return null;
  }
}

function resolveTrialHold(billing: BillingCacheValue | null, trialGraceDays: number) {
  if (!billing) {
    return {
      hold: false,
      eligibleAt: null,
      reason: "Billing indisponivel; aplicando regra padrao para desconectadas.",
    };
  }

  const isTrial = billing.planCode === "trial"
    || billing.organizationStatus === "trial"
    || billing.organizationStatus === "trial_expired"
    || billing.state.startsWith("trial_");

  if (!isTrial || !billing.trialEndsAt) {
    return {
      hold: false,
      eligibleAt: null,
      reason: "Empresa fora de trial.",
    };
  }

  const trialEndsAt = new Date(billing.trialEndsAt);
  const eligibleAt = new Date(trialEndsAt.getTime() + trialGraceDays * 86_400_000);
  const now = Date.now();

  if (trialEndsAt.getTime() > now) {
    return {
      hold: true,
      eligibleAt: eligibleAt.toISOString(),
      reason: "Trial ainda ativo.",
    };
  }

  if (eligibleAt.getTime() > now) {
    return {
      hold: true,
      eligibleAt: eligibleAt.toISOString(),
      reason: "Trial expirado dentro da carencia.",
    };
  }

  return {
    hold: false,
    eligibleAt: eligibleAt.toISOString(),
    reason: "Trial expirado fora da carencia.",
  };
}

function normalizeSettings(metadata: JsonRecord | null, updatedAt: string | null): UazapiCostGuardSettings {
  const raw = readRecord(readRecord(metadata)[metadataKey]);

  return {
    enabled: readBoolean(raw.enabled, false),
    runTimeLocal: normalizeRunTime(raw.run_time_local, defaultRunTime),
    timezone: readString(raw.timezone) ?? defaultTimezone,
    trialGraceDays: normalizeInteger(raw.trial_grace_days, TRIAL_CREDIT_CONVERSION_GRACE_DAYS, 0, 30),
    maxDeletionsPerRun: normalizeInteger(raw.max_deletions_per_run, 50, 1, 250),
    lastScheduledRunAt: readString(raw.last_scheduled_run_at),
    lastScheduledRunStatus: readString(raw.last_scheduled_run_status),
    lastScheduledRunSummary: readDigest(raw.last_scheduled_run_summary),
    lastManualDryRunAt: readString(raw.last_manual_dry_run_at),
    lastManualDryRunSummary: readDigest(raw.last_manual_dry_run_summary),
    updatedAt,
  };
}

function serializeSettings(settings: UazapiCostGuardSettings): JsonRecord {
  return {
    enabled: settings.enabled,
    run_time_local: settings.runTimeLocal,
    timezone: settings.timezone,
    trial_grace_days: settings.trialGraceDays,
    max_deletions_per_run: settings.maxDeletionsPerRun,
    last_scheduled_run_at: settings.lastScheduledRunAt,
    last_scheduled_run_status: settings.lastScheduledRunStatus,
    last_scheduled_run_summary: settings.lastScheduledRunSummary,
    last_manual_dry_run_at: settings.lastManualDryRunAt,
    last_manual_dry_run_summary: settings.lastManualDryRunSummary,
  };
}

function buildSkippedRun(
  settings: UazapiCostGuardSettings,
  triggerSource: string,
  reason: string,
): UazapiCostGuardRunSummary {
  return {
    checkedAt: new Date().toISOString(),
    mode: "delete",
    triggerSource,
    status: "skipped",
    reason,
    totalLocalInstances: 0,
    totalProviderInstances: 0,
    deleteCandidates: 0,
    archivedMissingCandidates: 0,
    deleted: 0,
    archivedMissing: 0,
    failed: 0,
    skipped: 0,
    decisions: [],
    errors: [`Rotina ${settings.enabled ? "fora do horario" : "desativada"}.`],
  };
}

function buildSnapshot(rows: InstanceRow[]): UazapiCostGuardAdminState["snapshot"] {
  const snapshot = {
    total: rows.length,
    connected: 0,
    disconnected: 0,
    apiCustomer: 0,
    clientAgent: 0,
    internalPlatform: 0,
    unknown: 0,
  };

  for (const row of rows) {
    if (row.status === "connected") snapshot.connected += 1;
    if (row.status === "disconnected") snapshot.disconnected += 1;

    const type = classifyInstance(row);
    if (type === "api_customer") snapshot.apiCustomer += 1;
    if (type === "client_agent") snapshot.clientAgent += 1;
    if (type === "internal_platform") snapshot.internalPlatform += 1;
    if (type === "unknown") snapshot.unknown += 1;
  }

  return snapshot;
}

function buildNextRunLabel(settings: UazapiCostGuardSettings, localClock: { date: string; time: string }) {
  if (!settings.enabled) {
    return "desativada";
  }

  const lastRunDate = settings.lastScheduledRunAt
    ? getLocalClock(new Date(settings.lastScheduledRunAt), settings.timezone).date
    : null;
  const todayPending = localClock.time < settings.runTimeLocal && lastRunDate !== localClock.date;

  return `${todayPending ? "hoje" : "amanha"} ${settings.runTimeLocal}`;
}

function classifyInstance(row: InstanceRow): UazapiCostGuardInstanceType {
  const metadata = readRecord(row.metadata);
  const createdFrom = (readString(metadata.created_from) ?? "").toLowerCase();
  const visibility = (row.connectyhub_api_visibility ?? "").toLowerCase();

  if (
    row.connectyhub_api_client_id ||
    visibility === "api_customer" ||
    visibility === "hybrid" ||
    readBoolean(metadata.api_gateway, false) ||
    createdFrom.includes("public_api") ||
    createdFrom.includes("connectyhub_public_api")
  ) {
    return "api_customer";
  }

  if (
    readBoolean(metadata.client_agent, false) ||
    Boolean(readString(metadata.agent_id)) ||
    Boolean(readString(metadata.agent_name)) ||
    createdFrom === "client_dashboard"
  ) {
    return "client_agent";
  }

  if (
    visibility === "internal" ||
    readBoolean(metadata.connectyhub_internal, false) ||
    readBoolean(metadata.platform_whatsapp, false) ||
    readBoolean(metadata.admin_whatsapp, false)
  ) {
    return "internal_platform";
  }

  return "unknown";
}

function getLocalClock(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
}

function normalizeRunTime(value: unknown, fallback: string) {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : fallback;
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(number), min), max);
}

function readDigest(value: unknown): UazapiCostGuardSummaryDigest | null {
  const record = readRecord(value);

  if (!record.checkedAt && !record.checked_at) {
    return null;
  }

  return {
    checkedAt: readString(record.checkedAt) ?? readString(record.checked_at) ?? new Date(0).toISOString(),
    mode: readString(record.mode) === "delete" ? "delete" : "dry_run",
    totalLocalInstances: readNumber(record.totalLocalInstances ?? record.total_local_instances),
    totalProviderInstances: readNumber(record.totalProviderInstances ?? record.total_provider_instances),
    deleteCandidates: readNumber(record.deleteCandidates ?? record.delete_candidates),
    archivedMissingCandidates: readNumber(record.archivedMissingCandidates ?? record.archived_missing_candidates),
    deleted: readNumber(record.deleted),
    archivedMissing: readNumber(record.archivedMissing ?? record.archived_missing),
    failed: readNumber(record.failed),
    skipped: readNumber(record.skipped),
  };
}

function toDigest(summary: UazapiCostGuardRunSummary): UazapiCostGuardSummaryDigest {
  return {
    checkedAt: summary.checkedAt,
    mode: summary.mode,
    totalLocalInstances: summary.totalLocalInstances,
    totalProviderInstances: summary.totalProviderInstances,
    deleteCandidates: summary.deleteCandidates,
    archivedMissingCandidates: summary.archivedMissingCandidates,
    deleted: summary.deleted,
    archivedMissing: summary.archivedMissing,
    failed: summary.failed,
    skipped: summary.skipped,
  };
}

function decryptInstanceToken(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return decryptCredentialValue(value);
  } catch {
    return null;
  }
}

function readOrganization(value: RelatedOrganization) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

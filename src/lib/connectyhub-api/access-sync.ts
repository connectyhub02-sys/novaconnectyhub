import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertOrganizationFeatureAccess,
  formatAccessControlError,
  statusForAccessControlError,
} from "@/lib/billing/access-control";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

type ApiAccessClientRow = {
  id: string;
  organization_id: string;
  status: "active" | "paused" | "archived";
  metadata: JsonRecord | null;
};

type ApiAccessChildRow = {
  id: string;
  status: "active" | "paused" | "archived" | "revoked";
  metadata: JsonRecord | null;
};

type AccessDecision = {
  allowed: boolean;
  reason: string;
  status: number | null;
};

const guardKey = "connectyhub_api_access_guard";

export async function syncConnectyhubApiAccessGuards(input: {
  client?: SupabaseClient;
  limit?: number;
} = {}) {
  const client = input.client ?? createServiceClient();
  const checkedAt = new Date().toISOString();
  const { data, error } = await client
    .from("connectyhub_api_clients")
    .select("id, organization_id, status, metadata")
    .neq("status", "archived")
    .order("updated_at", { ascending: true })
    .limit(input.limit ?? 200);

  if (error) {
    throw new Error(`Nao foi possivel carregar clientes API: ${error.message}`);
  }

  const rows = (data ?? []) as ApiAccessClientRow[];
  const summary = {
    checked: 0,
    allowed: 0,
    blocked: 0,
    clientsPaused: 0,
    clientsReactivated: 0,
    keysPaused: 0,
    keysReactivated: 0,
    webhooksPaused: 0,
    webhooksReactivated: 0,
    errors: [] as Array<{ clientId: string; organizationId: string; error: string }>,
  };

  for (const row of rows) {
    summary.checked += 1;

    try {
      const decision = await resolveApiAccessDecision(client, row.organization_id);

      if (decision.allowed) {
        summary.allowed += 1;
        const result = await restoreApiClientAccess(client, row, checkedAt);
        summary.clientsReactivated += result.clients;
        summary.keysReactivated += result.keys;
        summary.webhooksReactivated += result.webhooks;
        continue;
      }

      summary.blocked += 1;
      const result = await pauseApiClientAccess(client, row, checkedAt, decision);
      summary.clientsPaused += result.clients;
      summary.keysPaused += result.keys;
      summary.webhooksPaused += result.webhooks;
    } catch (error) {
      summary.errors.push({
        clientId: row.id,
        organizationId: row.organization_id,
        error: error instanceof Error ? error.message : "Erro inesperado ao sincronizar acesso API.",
      });
    }
  }

  return {
    checkedAt,
    ...summary,
  };
}

async function resolveApiAccessDecision(client: SupabaseClient, organizationId: string): Promise<AccessDecision> {
  try {
    await assertOrganizationFeatureAccess({
      organizationId,
      featureCode: "connectyhub_api",
      client,
    });

    return {
      allowed: true,
      reason: "allowed",
      status: null,
    };
  } catch (error) {
    const status = statusForAccessControlError(error, 403);
    const formatted = formatAccessControlError(error, "API WhatsApp bloqueada.");

    return {
      allowed: false,
      reason: typeof formatted.error === "string" ? formatted.error : "API WhatsApp bloqueada.",
      status,
    };
  }
}

async function pauseApiClientAccess(
  client: SupabaseClient,
  row: ApiAccessClientRow,
  checkedAt: string,
  decision: AccessDecision,
) {
  const clientPaused = row.status === "active"
    ? await updateClientGuardStatus(client, row, "paused", checkedAt, decision)
    : 0;
  const keysPaused = await updateChildGuardStatuses(client, {
    table: "connectyhub_api_keys",
    clientId: row.id,
    nextStatus: "paused",
    checkedAt,
    decision,
  });
  const webhooksPaused = await updateChildGuardStatuses(client, {
    table: "connectyhub_webhook_endpoints",
    clientId: row.id,
    nextStatus: "paused",
    checkedAt,
    decision,
  });

  return {
    clients: clientPaused,
    keys: keysPaused,
    webhooks: webhooksPaused,
  };
}

async function restoreApiClientAccess(client: SupabaseClient, row: ApiAccessClientRow, checkedAt: string) {
  const clientRestored = row.status === "paused" && wasPausedByGuard(row.metadata)
    ? await updateClientGuardStatus(client, row, "active", checkedAt, { allowed: true, reason: "allowed", status: null })
    : 0;
  const keysRestored = await updateChildGuardStatuses(client, {
    table: "connectyhub_api_keys",
    clientId: row.id,
    nextStatus: "active",
    checkedAt,
    decision: { allowed: true, reason: "allowed", status: null },
  });
  const webhooksRestored = await updateChildGuardStatuses(client, {
    table: "connectyhub_webhook_endpoints",
    clientId: row.id,
    nextStatus: "active",
    checkedAt,
    decision: { allowed: true, reason: "allowed", status: null },
  });

  return {
    clients: clientRestored,
    keys: keysRestored,
    webhooks: webhooksRestored,
  };
}

async function updateClientGuardStatus(
  client: SupabaseClient,
  row: ApiAccessClientRow,
  nextStatus: "active" | "paused",
  checkedAt: string,
  decision: AccessDecision,
) {
  const metadata = buildGuardMetadata(row.metadata, row.status, nextStatus, checkedAt, decision);
  const { error } = await client
    .from("connectyhub_api_clients")
    .update({ status: nextStatus, metadata })
    .eq("id", row.id)
    .neq("status", "archived");

  if (error) {
    throw new Error(`Nao foi possivel atualizar cliente API ${row.id}: ${error.message}`);
  }

  return 1;
}

async function updateChildGuardStatuses(
  client: SupabaseClient,
  input: {
    table: "connectyhub_api_keys" | "connectyhub_webhook_endpoints";
    clientId: string;
    nextStatus: "active" | "paused";
    checkedAt: string;
    decision: AccessDecision;
  },
) {
  const { data, error } = await client
    .from(input.table)
    .select("id, status, metadata")
    .eq("client_id", input.clientId)
    .neq("status", input.table === "connectyhub_api_keys" ? "revoked" : "archived");

  if (error) {
    throw new Error(`Nao foi possivel carregar dependencias API: ${error.message}`);
  }

  let changed = 0;

  for (const row of (data ?? []) as ApiAccessChildRow[]) {
    if (input.nextStatus === "paused" && row.status !== "active") {
      continue;
    }

    if (input.nextStatus === "active" && (row.status !== "paused" || !wasPausedByGuard(row.metadata))) {
      continue;
    }

    const metadata = buildGuardMetadata(row.metadata, row.status, input.nextStatus, input.checkedAt, input.decision);
    const update = await client
      .from(input.table)
      .update({ status: input.nextStatus, metadata })
      .eq("id", row.id);

    if (update.error) {
      throw new Error(`Nao foi possivel atualizar ${input.table} ${row.id}: ${update.error.message}`);
    }

    changed += 1;
  }

  return changed;
}

function buildGuardMetadata(
  metadata: JsonRecord | null,
  previousStatus: string,
  nextStatus: "active" | "paused",
  checkedAt: string,
  decision: AccessDecision,
) {
  const current = readRecord(metadata);
  const previousGuard = readRecord(current[guardKey]);
  const pausedAt = nextStatus === "paused"
    ? typeof previousGuard.paused_at === "string" ? previousGuard.paused_at : checkedAt
    : previousGuard.paused_at ?? null;

  return {
    ...current,
    [guardKey]: {
      allowed: decision.allowed,
      reason: decision.reason,
      status: decision.status,
      checked_at: checkedAt,
      paused_at: pausedAt,
      restored_at: nextStatus === "active" ? checkedAt : null,
      paused_by: nextStatus === "paused" ? guardKey : previousGuard.paused_by ?? guardKey,
      previous_status: nextStatus === "paused" ? previousStatus : previousGuard.previous_status ?? previousStatus,
    },
  };
}

function wasPausedByGuard(metadata: JsonRecord | null) {
  const guard = readRecord(readRecord(metadata)[guardKey]);
  return guard.paused_by === guardKey && guard.allowed === false;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

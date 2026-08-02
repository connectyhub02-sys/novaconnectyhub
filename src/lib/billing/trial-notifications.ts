import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrganizationBillingAccess,
  TRIAL_INCLUDED_CREDITS,
  type BillingAccessStatus,
} from "@/lib/billing/trial";
import { sendPlatformTrialNotification } from "@/lib/billing/platform-billing-webhook";
import { getAppBaseUrl } from "@/lib/sales-catalog/mercado-pago";

const TRIAL_CREDIT_MILESTONE_SIZE = 100;
const STALE_TRIAL_REMINDER_GRACE_HOURS = 36;

type TrialConversionTrigger =
  | "trial_started"
  | "trial_three_days_remaining"
  | "trial_no_credits"
  | "trial_one_day_remaining"
  | "trial_expired";

type TrialConversionMessageRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  trigger_code: string;
  scheduled_at: string;
  payload: Record<string, unknown> | null;
};

export async function sendTrialStartedNotification(input: {
  client: SupabaseClient;
  organizationId: string;
}) {
  const status = await getOrganizationBillingAccess({
    client: input.client,
    organizationId: input.organizationId,
  });

  if (!isTrialWithBalance(status)) {
    return null;
  }

  return sendPlatformTrialNotification(input.client, {
    organizationId: input.organizationId,
    eventType: "trial_started",
    dedupeKey: `trial:started:${input.organizationId}`,
    balanceCredits: status.balanceCredits,
    usedCredits: status.usedCredits,
    includedCredits: readIncludedCredits(status),
    trialDaysRemaining: status.trialDaysRemaining,
    metadata: {
      ...buildTrialCheckoutMetadata(status),
      source: "trial_signup_completed",
      trial_state: status.state,
    },
  });
}

export async function sendTrialUsageNotificationAfterDebit(input: {
  client: SupabaseClient;
  organizationId: string;
  beforeStatus: BillingAccessStatus;
}) {
  if (!isTrialStatus(input.beforeStatus)) {
    return null;
  }

  const afterStatus = await getOrganizationBillingAccess({
    client: input.client,
    organizationId: input.organizationId,
  });

  if (!isTrialStatus(afterStatus)) {
    return null;
  }

  if (afterStatus.balanceCredits <= 0 || afterStatus.state === "trial_no_credits") {
    return sendPlatformTrialNotification(input.client, {
      organizationId: input.organizationId,
      eventType: "trial_no_credits",
      dedupeKey: `trial:no_credits:${input.organizationId}`,
      balanceCredits: Math.max(afterStatus.balanceCredits, 0),
      usedCredits: afterStatus.usedCredits,
      includedCredits: readIncludedCredits(afterStatus),
      trialDaysRemaining: afterStatus.trialDaysRemaining,
      metadata: {
        ...buildTrialCheckoutMetadata(afterStatus),
        source: "trial_credit_debit",
        trial_state: afterStatus.state,
      },
    });
  }

  if (!isTrialWithBalance(afterStatus)) {
    return null;
  }

  const previousMilestone = readUsageMilestone(input.beforeStatus.usedCredits);
  const currentMilestone = readUsageMilestone(afterStatus.usedCredits);

  if (currentMilestone <= previousMilestone || currentMilestone <= 0) {
    return null;
  }

  return sendPlatformTrialNotification(input.client, {
    organizationId: input.organizationId,
    eventType: "trial_credit_milestone",
    dedupeKey: `trial:credit_milestone:${input.organizationId}:${currentMilestone}`,
    balanceCredits: afterStatus.balanceCredits,
    usedCredits: afterStatus.usedCredits,
    includedCredits: readIncludedCredits(afterStatus),
    milestoneCredits: currentMilestone,
    trialDaysRemaining: afterStatus.trialDaysRemaining,
    metadata: {
      ...buildTrialCheckoutMetadata(afterStatus),
      source: "trial_credit_debit",
      trial_state: afterStatus.state,
      previous_milestone: previousMilestone,
      current_milestone: currentMilestone,
    },
  });
}

export async function processPendingTrialConversionMessages(
  client: SupabaseClient,
  input: { limit?: number; now?: Date } = {},
) {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const expiration = await expireTrialCreditsSafely(client, { limit, nowIso });
  const { data, error } = await client
    .from("trial_conversion_messages")
    .select("id, organization_id, user_id, trigger_code, scheduled_at, payload")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(limit)
    .returns<TrialConversionMessageRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar avisos de trial: ${error.message}`);
  }

  const summary = {
    checked: data?.length ?? 0,
    sent: 0,
    skipped: 0,
    canceled: 0,
    failed: 0,
    expiredTrials: expiration.expiredTrials,
    warnings: expiration.warnings,
  };

  for (const row of data ?? []) {
    const trigger = readTrialTrigger(row.trigger_code);

    if (!trigger) {
      await markTrialMessage(client, row.id, "skipped", "Gatilho de trial desconhecido.", row.payload);
      summary.skipped += 1;
      continue;
    }

    try {
      const status = await getOrganizationBillingAccess({
        client,
        organizationId: row.organization_id,
        now,
      });

      if (!isTrialStatus(status)) {
        await markTrialMessage(client, row.id, "canceled", "Cliente ja saiu do trial.", row.payload);
        summary.canceled += 1;
        continue;
      }

      if (shouldSkipStaleTrialReminder(trigger, row.scheduled_at, now)) {
        await markTrialMessage(client, row.id, "skipped", "Aviso de trial antigo demais para envio.", row.payload);
        summary.skipped += 1;
        continue;
      }

      if (shouldSkipTrialReminderByState(trigger, status)) {
        await markTrialMessage(client, row.id, "skipped", "Estado atual do trial nao pede este aviso.", row.payload);
        summary.skipped += 1;
        continue;
      }

      const result = await sendPlatformTrialNotification(client, {
        organizationId: row.organization_id,
        eventType: mapTrialTriggerToNotification(trigger),
        dedupeKey: `trial:${trigger}:${row.organization_id}`,
        balanceCredits: Math.max(status.balanceCredits, 0),
        usedCredits: status.usedCredits,
        includedCredits: readIncludedCredits(status),
        trialDaysRemaining: status.trialDaysRemaining,
        metadata: {
          ...(row.payload ?? {}),
          ...buildTrialCheckoutMetadata(status),
          source: "trial_conversion_schedule",
          trial_message_id: row.id,
          trigger_code: trigger,
          trial_state: status.state,
          trial_ends_at: status.trialEndsAt ?? readString(row.payload?.trial_ends_at),
        },
      });

      const nextStatus = result.status === "skipped" ? "skipped" : result.status === "failed" ? "failed" : "sent";

      await markTrialMessage(client, row.id, nextStatus, result.errorMessage, {
        ...(row.payload ?? {}),
        notification_id: result.notificationId,
        notification_status: result.status,
        sent_by: "trial_conversion_schedule",
      });

      if (nextStatus === "failed") {
        summary.failed += 1;
      } else if (nextStatus === "skipped") {
        summary.skipped += 1;
      } else {
        summary.sent += 1;
      }
    } catch (error) {
      await markTrialMessage(
        client,
        row.id,
        "failed",
        error instanceof Error ? error.message : "Falha ao processar aviso de trial.",
        row.payload,
      );
      summary.failed += 1;
    }
  }

  return summary;
}

function isTrialWithBalance(status: BillingAccessStatus) {
  return isTrialStatus(status)
    && status.balanceCredits > 0
    && (status.state === "trial_active" || status.state === "trial_low_credits");
}

function isTrialStatus(status: BillingAccessStatus) {
  return status.planCode === "trial"
    || status.organizationStatus === "trial"
    || status.organizationStatus === "trial_pending"
    || status.state.startsWith("trial_");
}

function shouldSkipTrialReminderByState(trigger: TrialConversionTrigger, status: BillingAccessStatus) {
  if (trigger === "trial_expired") {
    return status.state !== "trial_expired";
  }

  if (trigger === "trial_no_credits") {
    return status.balanceCredits > 0 && status.state !== "trial_no_credits";
  }

  if (trigger === "trial_three_days_remaining" || trigger === "trial_one_day_remaining") {
    return status.state === "trial_expired" || status.balanceCredits <= 0;
  }

  return false;
}

function shouldSkipStaleTrialReminder(trigger: TrialConversionTrigger, scheduledAt: string, now: Date) {
  if (trigger === "trial_expired" || trigger === "trial_no_credits") {
    return false;
  }

  const scheduledTime = Date.parse(scheduledAt);

  if (!Number.isFinite(scheduledTime)) {
    return true;
  }

  return now.getTime() - scheduledTime > STALE_TRIAL_REMINDER_GRACE_HOURS * 60 * 60 * 1000;
}

function mapTrialTriggerToNotification(trigger: TrialConversionTrigger) {
  return trigger;
}

function readTrialTrigger(value: string): TrialConversionTrigger | null {
  if (
    value === "trial_started"
    || value === "trial_three_days_remaining"
    || value === "trial_no_credits"
    || value === "trial_one_day_remaining"
    || value === "trial_expired"
  ) {
    return value;
  }

  return null;
}

async function markTrialMessage(
  client: SupabaseClient,
  messageId: string,
  status: "sent" | "skipped" | "canceled" | "failed",
  errorMessage: string | null,
  payload: Record<string, unknown> | null | undefined,
) {
  await client
    .from("trial_conversion_messages")
    .update({
      status,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      error_message: errorMessage,
      payload: {
        ...(payload ?? {}),
        processed_at: new Date().toISOString(),
        processing_status: status,
      },
    })
    .eq("id", messageId);
}

async function expireTrialCreditsSafely(
  client: SupabaseClient,
  input: { limit: number; nowIso: string },
) {
  const warnings: string[] = [];
  const { data, error } = await client.rpc("expire_connectyhub_trial_credits", {
    p_limit: input.limit,
    p_now: input.nowIso,
  });

  if (error) {
    warnings.push(error.message);
    return { expiredTrials: 0, warnings };
  }

  return {
    expiredTrials: Array.isArray(data) ? data.length : 0,
    warnings,
  };
}

function readUsageMilestone(usedCredits: number) {
  return Math.floor(Math.max(Number(usedCredits) || 0, 0) / TRIAL_CREDIT_MILESTONE_SIZE)
    * TRIAL_CREDIT_MILESTONE_SIZE;
}

function readIncludedCredits(status: BillingAccessStatus) {
  return status.includedCredits > 0 ? status.includedCredits : TRIAL_INCLUDED_CREDITS;
}

function buildTrialCheckoutMetadata(status: BillingAccessStatus) {
  return {
    trial_ends_at: status.trialEndsAt,
    checkout_url: "/dashboard/planos",
    checkout_public_url: `${getAppBaseUrl()}/dashboard/planos`,
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

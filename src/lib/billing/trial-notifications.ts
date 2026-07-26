import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrganizationBillingAccess,
  TRIAL_INCLUDED_CREDITS,
  type BillingAccessStatus,
} from "@/lib/billing/trial";
import { sendPlatformTrialNotification } from "@/lib/billing/platform-billing-webhook";

const TRIAL_CREDIT_MILESTONE_SIZE = 100;

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
      source: "trial_credit_debit",
      trial_state: afterStatus.state,
      previous_milestone: previousMilestone,
      current_milestone: currentMilestone,
    },
  });
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

function readUsageMilestone(usedCredits: number) {
  return Math.floor(Math.max(Number(usedCredits) || 0, 0) / TRIAL_CREDIT_MILESTONE_SIZE)
    * TRIAL_CREDIT_MILESTONE_SIZE;
}

function readIncludedCredits(status: BillingAccessStatus) {
  return status.includedCredits > 0 ? status.includedCredits : TRIAL_INCLUDED_CREDITS;
}

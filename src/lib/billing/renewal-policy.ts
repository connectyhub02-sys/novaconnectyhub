type JsonRecord = Record<string, unknown>;

export type PlatformBillingRenewalPolicy = {
  pixReminderStartDays: number;
  cardChargeAttemptDays: number;
  gracePeriodDays: number;
  suspendAfterDays: number;
  dailyWhatsAppReminders: boolean;
  cardChargeAttemptEnabled: boolean;
  cardFailureUsesPixFallback: boolean;
  notifyResponsibleHumans: boolean;
};

export const defaultPlatformBillingRenewalPolicy: PlatformBillingRenewalPolicy = {
  pixReminderStartDays: 3,
  cardChargeAttemptDays: 3,
  gracePeriodDays: 3,
  suspendAfterDays: 3,
  dailyWhatsAppReminders: true,
  cardChargeAttemptEnabled: true,
  cardFailureUsesPixFallback: true,
  notifyResponsibleHumans: true,
};

export const platformBillingRenewalPolicyMetadataKey = "renewal_policy";

export function normalizePlatformBillingRenewalPolicy(value: unknown): PlatformBillingRenewalPolicy {
  const record = readRecord(value);

  return {
    pixReminderStartDays: clampInteger(
      record.pix_reminder_start_days ?? record.pixReminderStartDays,
      1,
      15,
      defaultPlatformBillingRenewalPolicy.pixReminderStartDays,
    ),
    cardChargeAttemptDays: clampInteger(
      record.card_charge_attempt_days ?? record.cardChargeAttemptDays,
      1,
      15,
      defaultPlatformBillingRenewalPolicy.cardChargeAttemptDays,
    ),
    gracePeriodDays: clampInteger(
      record.grace_period_days ?? record.gracePeriodDays,
      0,
      15,
      defaultPlatformBillingRenewalPolicy.gracePeriodDays,
    ),
    suspendAfterDays: clampInteger(
      record.suspend_after_days ?? record.suspendAfterDays,
      0,
      30,
      defaultPlatformBillingRenewalPolicy.suspendAfterDays,
    ),
    dailyWhatsAppReminders: readBoolean(
      record.daily_whatsapp_reminders ?? record.dailyWhatsAppReminders,
      defaultPlatformBillingRenewalPolicy.dailyWhatsAppReminders,
    ),
    cardChargeAttemptEnabled: readBoolean(
      record.card_charge_attempt_enabled ?? record.cardChargeAttemptEnabled,
      defaultPlatformBillingRenewalPolicy.cardChargeAttemptEnabled,
    ),
    cardFailureUsesPixFallback: readBoolean(
      record.card_failure_uses_pix_fallback ?? record.cardFailureUsesPixFallback,
      defaultPlatformBillingRenewalPolicy.cardFailureUsesPixFallback,
    ),
    notifyResponsibleHumans: readBoolean(
      record.notify_responsible_humans ?? record.notifyResponsibleHumans,
      defaultPlatformBillingRenewalPolicy.notifyResponsibleHumans,
    ),
  };
}

export function serializePlatformBillingRenewalPolicy(policy: PlatformBillingRenewalPolicy): JsonRecord {
  return {
    pix_reminder_start_days: policy.pixReminderStartDays,
    card_charge_attempt_days: policy.cardChargeAttemptDays,
    grace_period_days: policy.gracePeriodDays,
    suspend_after_days: policy.suspendAfterDays,
    daily_whatsapp_reminders: policy.dailyWhatsAppReminders,
    card_charge_attempt_enabled: policy.cardChargeAttemptEnabled,
    card_failure_uses_pix_fallback: policy.cardFailureUsesPixFallback,
    notify_responsible_humans: policy.notifyResponsibleHumans,
  };
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(number)));
}

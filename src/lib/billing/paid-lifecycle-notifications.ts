import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendPlatformBillingLifecycleNotification,
  type PlatformBillingLifecycleNotificationType,
} from "@/lib/billing/platform-billing-webhook";
import {
  normalizePlatformBillingRenewalPolicy,
  platformBillingRenewalPolicyMetadataKey,
  type PlatformBillingRenewalPolicy,
} from "@/lib/billing/renewal-policy";
import { getAppBaseUrl } from "@/lib/sales-catalog/mercado-pago";

type JsonRecord = Record<string, unknown>;

type PlanRelation = {
  name: string | null;
  monthly_price_brl: number | string | null;
  included_credits: number | string | null;
} | null;

type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan_code: string;
  status: string | null;
  billing_provider: string | null;
  provider_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  included_credits_granted: number | string | null;
  metadata: JsonRecord | null;
  billing_plans: PlanRelation | PlanRelation[] | null;
};

type WalletRow = {
  organization_id: string;
  balance_credits: number | string | null;
  lifetime_used_credits: number | string | null;
};

type CycleRow = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  cycle_start: string;
  cycle_end: string;
  included_credits: number | string | null;
  used_credits: number | string | null;
  status: string | null;
};

type PaymentRow = {
  id: string;
  subscription_id: string | null;
  provider: string | null;
  provider_status: string | null;
  status: string | null;
  payload: JsonRecord | null;
  created_at: string | null;
  paid_at: string | null;
};

type PlatformBillingSettingsRow = {
  metadata: JsonRecord | null;
};

type PaidLifecycleSummary = {
  checked: number;
  deadlineNotifications: number;
  creditNotifications: number;
  expiredPlans: number;
  skipped: number;
  failed: number;
  warnings: string[];
};

const PAID_PLAN_CODES = ["starter", "pro", "scale"];
const DAY_MS = 86_400_000;

export async function processPaidBillingLifecycleNotifications(
  client: SupabaseClient,
  input: { limit?: number; now?: Date } = {},
): Promise<PaidLifecycleSummary> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 250);
  const now = input.now ?? new Date();
  const subscriptions = await loadPaidSubscriptions(client, limit);
  const summary: PaidLifecycleSummary = {
    checked: subscriptions.length,
    deadlineNotifications: 0,
    creditNotifications: 0,
    expiredPlans: 0,
    skipped: 0,
    failed: 0,
    warnings: [],
  };

  if (subscriptions.length === 0) {
    return summary;
  }

  const organizationIds = Array.from(new Set(subscriptions.map((subscription) => subscription.organization_id)));
  const subscriptionIds = subscriptions.map((subscription) => subscription.id);
  const [wallets, cycles, payments, renewalPolicy] = await Promise.all([
    loadWallets(client, organizationIds),
    loadOpenCycles(client, subscriptionIds),
    loadLatestPayments(client, subscriptionIds),
    loadRenewalPolicy(client).catch((error) => {
      summary.warnings.push(error instanceof Error ? error.message : "Nao foi possivel carregar a regua de renovacao.");
      return normalizePlatformBillingRenewalPolicy(null);
    }),
  ]);
  const walletByOrganizationId = new Map(wallets.map((wallet) => [wallet.organization_id, wallet]));
  const paymentBySubscriptionId = buildLatestPaymentMap(payments);

  for (const subscription of subscriptions) {
    try {
      const context = buildNotificationContext({
        subscription,
        wallet: walletByOrganizationId.get(subscription.organization_id) ?? null,
        cycle: findCurrentCycle(cycles, subscription, now),
        latestPayment: paymentBySubscriptionId.get(subscription.id) ?? null,
        renewalPolicy,
        now,
      });

      const deadlineEvent = pickDeadlineEvent(context, renewalPolicy, now);

      if (deadlineEvent) {
        if (deadlineEvent.eventType === "paid_plan_expired") {
          const expired = await markSubscriptionPastDue(client, {
            subscription,
            now,
            periodEnd: context.periodEnd,
          });

          if (expired) {
            summary.expiredPlans += 1;
          }
        }

        const result = await sendLifecycleNotification(client, {
          context,
          eventType: deadlineEvent.eventType,
          dedupeSuffix: deadlineEvent.dedupeSuffix,
          source: "paid_plan_deadline_sweep",
        });

        if (result.status === "failed") {
          summary.failed += 1;
        } else if (result.status === "skipped") {
          summary.skipped += 1;
        } else {
          summary.deadlineNotifications += 1;
        }
      }

      if (!deadlineEvent || deadlineEvent.eventType !== "paid_plan_expired") {
        const creditEvent = pickCreditThresholdEvent(context);

        if (creditEvent) {
          const result = await sendLifecycleNotification(client, {
            context,
            eventType: creditEvent,
            dedupeSuffix: context.cycle?.id ?? dateOnly(context.periodEnd) ?? "wallet",
            source: "paid_credit_threshold_sweep",
          });

          if (result.status === "failed") {
            summary.failed += 1;
          } else if (result.status === "skipped") {
            summary.skipped += 1;
          } else {
            summary.creditNotifications += 1;
          }
        }
      }
    } catch (error) {
      summary.failed += 1;
      summary.warnings.push(error instanceof Error ? error.message : "Falha ao processar ciclo pago.");
    }
  }

  return summary;
}

async function loadPaidSubscriptions(client: SupabaseClient, limit: number) {
  const { data, error } = await client
    .from("organization_subscriptions")
    .select("id, organization_id, plan_code, status, billing_provider, provider_subscription_id, current_period_start, current_period_end, next_billing_at, included_credits_granted, metadata, billing_plans(name, monthly_price_brl, included_credits)")
    .in("plan_code", PAID_PLAN_CODES)
    .in("status", ["active", "past_due"])
    .order("current_period_end", { ascending: true, nullsFirst: false })
    .limit(limit)
    .returns<SubscriptionRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar assinaturas pagas: ${error.message}`);
  }

  return data ?? [];
}

async function loadWallets(client: SupabaseClient, organizationIds: string[]) {
  if (organizationIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("credit_wallets")
    .select("organization_id, balance_credits, lifetime_used_credits")
    .in("organization_id", organizationIds)
    .returns<WalletRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar carteiras de creditos: ${error.message}`);
  }

  return data ?? [];
}

async function loadOpenCycles(client: SupabaseClient, subscriptionIds: string[]) {
  if (subscriptionIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("billing_cycles")
    .select("id, organization_id, subscription_id, cycle_start, cycle_end, included_credits, used_credits, status")
    .in("subscription_id", subscriptionIds)
    .eq("status", "open")
    .order("cycle_end", { ascending: false })
    .limit(subscriptionIds.length * 3)
    .returns<CycleRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar ciclos pagos: ${error.message}`);
  }

  return data ?? [];
}

async function loadLatestPayments(client: SupabaseClient, subscriptionIds: string[]) {
  if (subscriptionIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("billing_payments")
    .select("id, subscription_id, provider, provider_status, status, payload, created_at, paid_at")
    .in("subscription_id", subscriptionIds)
    .order("created_at", { ascending: false })
    .limit(subscriptionIds.length * 4)
    .returns<PaymentRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar pagamentos recentes: ${error.message}`);
  }

  return data ?? [];
}

async function loadRenewalPolicy(client: SupabaseClient) {
  const { data, error } = await client
    .from("platform_billing_settings")
    .select("metadata")
    .eq("setting_key", "default")
    .maybeSingle<PlatformBillingSettingsRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar a regua de renovacao: ${error.message}`);
  }

  return normalizePlatformBillingRenewalPolicy(data?.metadata?.[platformBillingRenewalPolicyMetadataKey]);
}

function buildNotificationContext(input: {
  subscription: SubscriptionRow;
  wallet: WalletRow | null;
  cycle: CycleRow | null;
  latestPayment: PaymentRow | null;
  renewalPolicy: PlatformBillingRenewalPolicy;
  now: Date;
}) {
  const plan = readPlanRelation(input.subscription.billing_plans);
  const periodEnd = readDate(input.subscription.current_period_end)
    ?? readDate(input.subscription.next_billing_at);
  const includedCredits = toNumber(input.cycle?.included_credits)
    || toNumber(plan?.included_credits)
    || toNumber(input.subscription.included_credits_granted);
  const balanceCredits = toNumber(input.wallet?.balance_credits);
  const usedCredits = toNumber(input.cycle?.used_credits)
    || Math.max(includedCredits - balanceCredits, 0)
    || toNumber(input.wallet?.lifetime_used_credits);
  const creditBalancePercent = includedCredits > 0
    ? Math.max(0, Math.min(100, (balanceCredits / includedCredits) * 100))
    : null;
  const daysRemaining = periodEnd
    ? Math.max(Math.ceil((periodEnd.getTime() - input.now.getTime()) / DAY_MS), 0)
    : null;

  return {
    subscription: input.subscription,
    cycle: input.cycle,
    plan,
    periodEnd,
    includedCredits,
    balanceCredits,
    usedCredits,
    creditBalancePercent,
    daysRemaining,
    daysPastDue: periodEnd ? Math.max(Math.floor((input.now.getTime() - periodEnd.getTime()) / DAY_MS), 0) : null,
    paymentMethod: resolveSubscriptionPaymentMethod(input.subscription, input.latestPayment),
    latestPayment: input.latestPayment,
    renewalPolicy: input.renewalPolicy,
    planName: plan?.name?.trim() || input.subscription.plan_code,
    amountBrl: toNumber(plan?.monthly_price_brl),
  };
}

function pickDeadlineEvent(
  context: ReturnType<typeof buildNotificationContext>,
  policy: PlatformBillingRenewalPolicy,
  now: Date,
):
  | { eventType: PlatformBillingLifecycleNotificationType; dedupeSuffix: string }
  | null {
  const periodEnd = context.periodEnd;
  if (!periodEnd) {
    return null;
  }

  const diff = periodEnd.getTime() - now.getTime();
  const periodDate = dateOnly(periodEnd) ?? "sem-data";
  const today = dateOnly(now) ?? "hoje";

  if (diff <= 0) {
    const daysPastDue = Math.max(Math.floor(Math.abs(diff) / DAY_MS), 0);

    if (daysPastDue <= 0) {
      return { eventType: "paid_plan_due_today", dedupeSuffix: `${periodDate}:${today}` };
    }

    const suspendAfterDays = Math.max(policy.suspendAfterDays, policy.gracePeriodDays);

    if (suspendAfterDays > 0 && daysPastDue <= suspendAfterDays) {
      return { eventType: "paid_plan_grace_period", dedupeSuffix: `${periodDate}:d${daysPastDue}:${today}` };
    }

    return { eventType: "paid_plan_expired", dedupeSuffix: `${periodDate}:expired` };
  }

  const daysRemaining = Math.ceil(diff / DAY_MS);
  const cardRetryFailed = readString(context.subscription.metadata?.card_retry_status) === "failed"
    || readString(context.latestPayment?.payload?.card_retry_status) === "failed";

  if (cardRetryFailed && daysRemaining <= policy.cardChargeAttemptDays) {
    return { eventType: "payment_card_retry_failed", dedupeSuffix: `${periodDate}:card_failed:${today}` };
  }

  const shouldRemindPix =
    context.paymentMethod !== "card"
    || !policy.cardChargeAttemptEnabled
    || (cardRetryFailed && policy.cardFailureUsesPixFallback);

  if (shouldRemindPix && daysRemaining <= policy.pixReminderStartDays) {
    return {
      eventType: policy.dailyWhatsAppReminders
        ? "paid_plan_renewal_reminder"
        : daysRemaining <= 1
          ? "paid_plan_one_day_remaining"
          : "paid_plan_three_days_remaining",
      dedupeSuffix: policy.dailyWhatsAppReminders
        ? `${periodDate}:d${daysRemaining}:${today}`
        : periodDate,
    };
  }

  return null;
}

function pickCreditThresholdEvent(context: ReturnType<typeof buildNotificationContext>) {
  if (context.includedCredits <= 0 || context.subscription.status !== "active") {
    return null;
  }

  if (context.balanceCredits <= 0) {
    return "paid_no_credits" satisfies PlatformBillingLifecycleNotificationType;
  }

  const percent = context.creditBalancePercent ?? 100;

  if (percent <= 10) {
    return "paid_low_credits_10" satisfies PlatformBillingLifecycleNotificationType;
  }

  if (percent <= 20) {
    return "paid_low_credits_20" satisfies PlatformBillingLifecycleNotificationType;
  }

  return null;
}

async function sendLifecycleNotification(
  client: SupabaseClient,
  input: {
    context: ReturnType<typeof buildNotificationContext>;
    eventType: PlatformBillingLifecycleNotificationType;
    dedupeSuffix: string;
    source: string;
  },
) {
  const context = input.context;
  const periodEnd = context.periodEnd?.toISOString() ?? null;

  return sendPlatformBillingLifecycleNotification(client, {
    organizationId: context.subscription.organization_id,
    subscriptionId: context.subscription.id,
    planCode: context.subscription.plan_code,
    planName: context.planName,
    amountBrl: context.amountBrl,
    includedCredits: context.includedCredits,
    balanceCredits: context.balanceCredits,
    usedCredits: context.usedCredits,
    daysRemaining: context.daysRemaining,
    eventType: input.eventType,
    dedupeKey: `billing:${context.subscription.id}:${input.eventType}:${input.dedupeSuffix}`,
    providerStatus: context.subscription.status,
    providerReference: context.subscription.provider_subscription_id,
    metadata: {
      source: input.source,
      billing_provider: context.subscription.billing_provider,
      current_period_start: context.subscription.current_period_start,
      current_period_end: periodEnd,
      period_ends_at: periodEnd,
      next_billing_at: context.subscription.next_billing_at,
      cycle_id: context.cycle?.id ?? null,
      credit_balance_percent: context.creditBalancePercent,
      payment_method: context.paymentMethod,
      payment_method_label: formatPaymentMethod(context.paymentMethod),
      days_past_due: context.daysPastDue,
      grace_period_days: context.renewalPolicy.gracePeriodDays,
      checkout_url: "/dashboard/planos",
      checkout_public_url: `${getAppBaseUrl()}/dashboard/planos`,
    },
  });
}

function buildLatestPaymentMap(payments: PaymentRow[]) {
  const map = new Map<string, PaymentRow>();

  for (const payment of payments) {
    if (payment.subscription_id && !map.has(payment.subscription_id)) {
      map.set(payment.subscription_id, payment);
    }
  }

  return map;
}

function resolveSubscriptionPaymentMethod(subscription: SubscriptionRow, payment: PaymentRow | null) {
  const subscriptionMetadata = subscription.metadata ?? {};
  const paymentPayload = payment?.payload ?? {};
  const value = [
    readString(paymentPayload.payment_method),
    readString(paymentPayload.latest_payment_method),
    readString(paymentPayload.paymentMethod),
    readString(paymentPayload.method),
    readString(subscriptionMetadata.payment_method),
    readString(subscriptionMetadata.latest_payment_method),
    readString(subscriptionMetadata.billing_payment_method),
  ].filter(Boolean).join(" ").toLowerCase();

  if (value.includes("pix")) return "pix";
  if (value.includes("card") || value.includes("cartao") || value.includes("cartão") || value.includes("credit") || value.includes("debit")) {
    return "card";
  }

  if (subscription.provider_subscription_id) {
    return "card";
  }

  return subscription.billing_provider === "pagbank" ? "pix" : "unknown";
}

function formatPaymentMethod(value: string) {
  if (value === "pix") return "Pix";
  if (value === "card") return "Cartao";
  return "Pagamento";
}

async function markSubscriptionPastDue(
  client: SupabaseClient,
  input: {
    subscription: SubscriptionRow;
    now: Date;
    periodEnd: Date | null;
  },
) {
  if (input.subscription.status === "past_due") {
    return false;
  }

  const metadata = {
    ...(input.subscription.metadata ?? {}),
    past_due_source: "paid_lifecycle_sweep",
    past_due_at: input.now.toISOString(),
    period_ended_at: input.periodEnd?.toISOString() ?? null,
  };

  const [subscriptionUpdate, organizationUpdate, cycleUpdate] = await Promise.all([
    client
      .from("organization_subscriptions")
      .update({
        status: "past_due",
        metadata,
      })
      .eq("id", input.subscription.id)
      .eq("organization_id", input.subscription.organization_id)
      .eq("status", "active"),
    client
      .from("organizations")
      .update({ status: "past_due" })
      .eq("id", input.subscription.organization_id)
      .eq("plan_code", input.subscription.plan_code)
      .eq("status", "active"),
    input.periodEnd
      ? client
          .from("billing_cycles")
          .update({
            status: "closed",
            metadata: {
              source: "paid_lifecycle_sweep",
              closed_at: input.now.toISOString(),
              reason: "paid_period_expired",
            },
          })
          .eq("subscription_id", input.subscription.id)
          .eq("status", "open")
          .lte("cycle_end", input.now.toISOString())
      : Promise.resolve({ error: null }),
  ]);

  const error = subscriptionUpdate.error ?? organizationUpdate.error ?? cycleUpdate.error;

  if (error) {
    throw new Error(`Nao foi possivel marcar plano como vencido: ${error.message}`);
  }

  return true;
}

function findCurrentCycle(cycles: CycleRow[], subscription: SubscriptionRow, now: Date) {
  const nowTime = now.getTime();
  const matching = cycles.filter((cycle) => cycle.subscription_id === subscription.id);

  return matching.find((cycle) => {
    const start = Date.parse(cycle.cycle_start);
    const end = Date.parse(cycle.cycle_end);

    return Number.isFinite(start) && Number.isFinite(end) && start <= nowTime && end > nowTime;
  }) ?? matching[0] ?? null;
}

function readPlanRelation(relation: PlanRelation | PlanRelation[] | null) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function readDate(value: unknown) {
  const string = typeof value === "string" && value.trim() ? value.trim() : null;

  if (!string) {
    return null;
  }

  const date = new Date(string);
  return Number.isFinite(date.getTime()) ? date : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateOnly(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

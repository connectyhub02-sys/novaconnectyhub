import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  loadAuthUserAvatarState,
  shouldAttemptWhatsappAvatarSync,
  syncAuthUserEmailAvatarIfMissing,
} from "@/lib/account/profile-avatar-sync";
import { getAccountCompletionStatusForUser, syncVerifiedPhoneWhatsappAvatar } from "@/lib/account/signup-completion";
import { buildDashboardBillingCheckoutPath } from "@/lib/billing/plan-checkout";
import { getOrganizationBillingAccess } from "@/lib/billing/trial";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type WalletRow = {
  balance_credits: number | string | null;
  reserved_credits: number | string | null;
  lifetime_purchased_credits: number | string | null;
  lifetime_used_credits: number | string | null;
  status: string | null;
  updated_at: string | null;
};

type BillingPlanRelation = {
  plan_code?: string | null;
  name: string | null;
  monthly_price_brl?: number | string | null;
  included_credits?: number | string | null;
} | Array<{
  plan_code?: string | null;
  name: string | null;
  monthly_price_brl?: number | string | null;
  included_credits?: number | string | null;
}> | null;

type SubscriptionRow = {
  id: string;
  plan_code: string;
  status: string;
  billing_provider: string | null;
  provider_subscription_id: string | null;
  payer_email: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  canceled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  billing_plans: BillingPlanRelation;
};

type InvoiceRelation = {
  total_brl: number | string | null;
  due_at: string | null;
  status: string | null;
  provider_invoice_id: string | null;
} | Array<{
  total_brl: number | string | null;
  due_at: string | null;
  status: string | null;
  provider_invoice_id: string | null;
}> | null;

type SubscriptionRelation = {
  plan_code: string | null;
} | Array<{
  plan_code: string | null;
}> | null;

type PaymentRow = {
  id: string;
  invoice_id: string | null;
  subscription_id: string | null;
  provider: string | null;
  provider_payment_id: string | null;
  provider_status: string | null;
  status: string;
  amount_brl: number | string | null;
  paid_at: string | null;
  payload: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
  billing_invoices: InvoiceRelation;
  organization_subscriptions: SubscriptionRelation;
};

type CreditTransactionRow = {
  id: string;
  transaction_type: string;
  amount_credits: number | string | null;
  balance_after_credits: number | string | null;
  provider: string | null;
  description: string | null;
  created_at: string | null;
};

type UsageEventRow = {
  id: string;
  feature_code: string | null;
  input_units: number | string | null;
  output_units: number | string | null;
  connecty_charge_credits: number | string | null;
  occurred_at: string | null;
  created_at: string | null;
};

type UsageSummaryEventRow = {
  feature_code: string | null;
  connecty_charge_credits: number | string | null;
  occurred_at: string | null;
  created_at: string | null;
};

type BillingCycleRow = {
  id: string;
  cycle_start: string | null;
  cycle_end: string | null;
  included_credits: number | string | null;
  used_credits: number | string | null;
  overage_credits: number | string | null;
  status: string;
  created_at: string | null;
  billing_plans: BillingPlanRelation;
};

export async function GET() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const organization = workspace.organization ?? await ensureStarterOrganization();

  if (!organization) {
    return NextResponse.json({ error: "Empresa obrigatoria." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const usageSummarySince = new Date();
    usageSummarySince.setDate(usageSummarySince.getDate() - 30);
    const [
      accountCompletion,
      billingAccess,
      walletResult,
      subscriptionsResult,
      paymentsResult,
      creditTransactionsResult,
      usageEventsResult,
      usageSummaryEventsResult,
      cyclesResult,
    ] = await Promise.all([
      getAccountCompletionStatusForUser({ userId: workspace.user.id, client }),
      getOrganizationBillingAccess({ organizationId: organization.id, client }),
      client
        .from("credit_wallets")
        .select("balance_credits, reserved_credits, lifetime_purchased_credits, lifetime_used_credits, status, updated_at")
        .eq("organization_id", organization.id)
        .maybeSingle<WalletRow>(),
      client
        .from("organization_subscriptions")
        .select("id, plan_code, status, billing_provider, provider_subscription_id, payer_email, current_period_start, current_period_end, next_billing_at, canceled_at, created_at, updated_at, billing_plans(name, monthly_price_brl, included_credits)")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(8)
        .returns<SubscriptionRow[]>(),
      client
        .from("billing_payments")
        .select("id, invoice_id, subscription_id, provider, provider_payment_id, provider_status, status, amount_brl, paid_at, payload, created_at, updated_at, billing_invoices(total_brl, due_at, status, provider_invoice_id), organization_subscriptions(plan_code)")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(12)
        .returns<PaymentRow[]>(),
      client
        .from("credit_transactions")
        .select("id, transaction_type, amount_credits, balance_after_credits, provider, description, created_at")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(12)
        .returns<CreditTransactionRow[]>(),
      client
        .from("usage_events")
        .select("id, feature_code, input_units, output_units, connecty_charge_credits, occurred_at, created_at")
        .eq("organization_id", organization.id)
        .eq("status", "completed")
        .order("occurred_at", { ascending: false })
        .limit(30)
        .returns<UsageEventRow[]>(),
      client
        .from("usage_events")
        .select("feature_code, connecty_charge_credits, occurred_at, created_at")
        .eq("organization_id", organization.id)
        .eq("status", "completed")
        .gte("occurred_at", usageSummarySince.toISOString())
        .order("occurred_at", { ascending: false })
        .limit(1000)
        .returns<UsageSummaryEventRow[]>(),
      client
        .from("billing_cycles")
        .select("id, cycle_start, cycle_end, included_credits, used_credits, overage_credits, status, created_at, billing_plans(plan_code, name)")
        .eq("organization_id", organization.id)
        .order("cycle_start", { ascending: false })
        .limit(6)
        .returns<BillingCycleRow[]>(),
    ]);

    if (walletResult.error) {
      throw new Error(`Nao foi possivel carregar a carteira: ${walletResult.error.message}`);
    }

    if (subscriptionsResult.error) {
      throw new Error(`Nao foi possivel carregar assinaturas: ${subscriptionsResult.error.message}`);
    }

    if (paymentsResult.error) {
      throw new Error(`Nao foi possivel carregar pagamentos: ${paymentsResult.error.message}`);
    }

    if (creditTransactionsResult.error) {
      throw new Error(`Nao foi possivel carregar historico de creditos: ${creditTransactionsResult.error.message}`);
    }

    if (usageEventsResult.error) {
      throw new Error(`Nao foi possivel carregar consumo recente: ${usageEventsResult.error.message}`);
    }

    if (usageSummaryEventsResult.error) {
      throw new Error(`Nao foi possivel carregar resumo de consumo: ${usageSummaryEventsResult.error.message}`);
    }

    if (cyclesResult.error) {
      throw new Error(`Nao foi possivel carregar ciclos de billing: ${cyclesResult.error.message}`);
    }

    const subscriptions = (subscriptionsResult.data ?? []).map(mapSubscription);
    const pendingSubscription = subscriptions.find((subscription) => isPendingSubscription(subscription.status)) ?? null;
    const payments = (paymentsResult.data ?? []).map((payment) => mapPayment(payment));
    const avatarUrl = await resolveAccountAvatarUrl({
      accountCompletion,
      client,
      fallbackEmail: workspace.profile.email ?? workspace.user.email,
      fallbackUrl: workspace.profile.avatarUrl,
      userId: workspace.user.id,
    });

    return NextResponse.json({
      account: {
        profile: {
          id: workspace.profile.id,
          email: workspace.profile.email ?? workspace.user.email ?? null,
          fullName: accountCompletion.fullName ?? workspace.profile.fullName,
          phone: accountCompletion.phone ?? workspace.profile.phone,
          phoneNormalized: accountCompletion.phoneNormalized,
          phoneVerified: accountCompletion.phoneVerified,
          phoneWhatsappExists: accountCompletion.phoneWhatsappExists,
          cpfPreview: accountCompletion.cpfPreview,
          signupCompletedAt: accountCompletion.signupCompletedAt,
          companyName: workspace.profile.companyName,
          avatarUrl: avatarUrl ?? workspace.profile.avatarUrl,
          completion: accountCompletion,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          role: organization.role,
          planCode: organization.planCode,
          status: organization.status,
        },
        billingAccess,
        wallet: mapWallet(walletResult.data, billingAccess.balanceCredits),
        subscriptions,
        payments,
        creditTransactions: (creditTransactionsResult.data ?? []).map(mapCreditTransaction),
        usageEvents: (usageEventsResult.data ?? []).map(mapUsageEvent),
        usageSummary: mapUsageSummary(usageSummaryEventsResult.data ?? [], billingAccess),
        cycles: (cyclesResult.data ?? []).map(mapCycle),
        actions: {
          plansHref: "/dashboard/planos",
          pendingCheckoutHref: pendingSubscription ? buildDashboardBillingCheckoutPath(pendingSubscription.id) : null,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel carregar sua conta." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = readRecord(await request.json().catch(() => null));
  const fullName = readString(body.fullName);
  const companyName = readNullableString(body.companyName);

  if (!fullName || fullName.length < 3) {
    return NextResponse.json({ error: "Informe seu nome completo." }, { status: 422 });
  }

  if (fullName.length > 120) {
    return NextResponse.json({ error: "Nome muito longo." }, { status: 422 });
  }

  if (companyName !== null && companyName.length < 2) {
    return NextResponse.json({ error: "Informe o nome da empresa com pelo menos 2 caracteres." }, { status: 422 });
  }

  if (companyName !== null && companyName.length > 120) {
    return NextResponse.json({ error: "Nome da empresa muito longo." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const now = new Date().toISOString();
    const updateResult = await client
      .from("profiles")
      .update({
        full_name: fullName,
        company_name: companyName,
        updated_at: now,
      })
      .eq("id", workspace.user.id);

    if (updateResult.error) {
      throw new Error(`Nao foi possivel atualizar o perfil: ${updateResult.error.message}`);
    }

    const authUser = await client.auth.admin.getUserById(workspace.user.id);

    if (!authUser.error && authUser.data.user) {
      const metadata = readRecord(authUser.data.user.user_metadata);

      await client.auth.admin.updateUserById(workspace.user.id, {
        user_metadata: {
          ...metadata,
          full_name: fullName,
          company_name: companyName,
        },
      });
    }

    const organizationToRename = workspace.organization
      && ["owner", "admin"].includes(workspace.organization.role)
      && companyName
        ? workspace.organization
        : null;

    if (organizationToRename) {
      const orgUpdate = await client
        .from("organizations")
        .update({
          name: companyName,
          updated_at: now,
        })
        .eq("id", organizationToRename.id);

      if (orgUpdate.error) {
        throw new Error(`Nao foi possivel atualizar a empresa: ${orgUpdate.error.message}`);
      }
    }

    await client.from("maintenance_audit_logs").insert({
      actor_id: workspace.user.id,
      event_type: "profile.account_updated",
      target_table: "profiles",
      target_id: workspace.user.id,
      metadata: {
        organizationId: workspace.organization?.id ?? null,
        organizationRenamed: Boolean(organizationToRename),
      },
    }).then(undefined, () => null);

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/minha-conta");
    revalidatePath("/dashboard/empresa");

    return GET();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel atualizar sua conta." },
      { status: 422 },
    );
  }
}

async function resolveAccountAvatarUrl(input: {
  accountCompletion: Awaited<ReturnType<typeof getAccountCompletionStatusForUser>>;
  client: SupabaseClient;
  fallbackEmail: string | null | undefined;
  fallbackUrl: string | null;
  userId: string;
}) {
  const avatarState = await loadAuthUserAvatarState(input.client, input.userId).catch(() => null);
  let avatarUrl = avatarState?.avatarUrl ?? input.fallbackUrl;

  if (
    avatarState
    && input.accountCompletion.phoneVerified
    && input.accountCompletion.phoneNormalized
    && shouldAttemptWhatsappAvatarSync(avatarState.metadata)
  ) {
    const whatsappAvatarUrl = await syncVerifiedPhoneWhatsappAvatar(input.client, {
      userId: input.userId,
      phoneNormalized: input.accountCompletion.phoneNormalized,
    }).catch(() => null);

    avatarUrl = whatsappAvatarUrl ?? avatarUrl;
  }

  if (!avatarUrl) {
    const emailAvatarUrl = await syncAuthUserEmailAvatarIfMissing({
      client: input.client,
      email: input.fallbackEmail,
      state: avatarState,
      userId: input.userId,
    }).catch(() => null);

    avatarUrl = emailAvatarUrl ?? avatarUrl;
  }

  return avatarUrl;
}

function mapWallet(row: WalletRow | null, balanceCredits: number) {
  return {
    balanceCredits: row ? toNumber(row.balance_credits) : balanceCredits,
    reservedCredits: toNumber(row?.reserved_credits),
    lifetimePurchasedCredits: toNumber(row?.lifetime_purchased_credits),
    lifetimeUsedCredits: toNumber(row?.lifetime_used_credits),
    status: row?.status ?? "active",
    updatedAt: row?.updated_at ?? null,
  };
}

function mapSubscription(row: SubscriptionRow) {
  const plan = firstRelation(row.billing_plans);

  return {
    id: row.id,
    planCode: row.plan_code,
    planName: plan?.name ?? row.plan_code,
    status: row.status,
    billingProvider: row.billing_provider,
    providerSubscriptionId: row.provider_subscription_id,
    payerEmail: row.payer_email,
    monthlyPriceBrl: toNumber(plan?.monthly_price_brl),
    includedCredits: toNumber(plan?.included_credits),
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    nextBillingAt: row.next_billing_at,
    canceledAt: row.canceled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    checkoutHref: isPendingSubscription(row.status) ? buildDashboardBillingCheckoutPath(row.id) : null,
  };
}

function mapPayment(row: PaymentRow) {
  const invoice = firstRelation(row.billing_invoices);
  const subscription = firstRelation(row.organization_subscriptions);

  return {
    id: row.id,
    invoiceId: row.invoice_id,
    subscriptionId: row.subscription_id,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    providerStatus: row.provider_status,
    status: row.status,
    amountBrl: toNumber(row.amount_brl),
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    invoiceStatus: invoice?.status ?? null,
    invoiceDueAt: invoice?.due_at ?? null,
    invoiceTotalBrl: toNumber(invoice?.total_brl),
    providerInvoiceId: invoice?.provider_invoice_id ?? null,
    planCode: subscription?.plan_code ?? null,
    invoiceHref: row.invoice_id ? `/dashboard/minha-conta/faturas/${encodeURIComponent(row.invoice_id)}` : null,
    receiptUrl: readPublicReceiptUrl(row.payload),
    checkoutHref: row.subscription_id && isPendingSubscription(row.status)
      ? buildDashboardBillingCheckoutPath(row.subscription_id)
      : null,
  };
}

function mapCreditTransaction(row: CreditTransactionRow) {
  return {
    id: row.id,
    type: row.transaction_type,
    amountCredits: toNumber(row.amount_credits),
    balanceAfterCredits: toNumber(row.balance_after_credits),
    provider: row.provider,
    description: row.description,
    createdAt: row.created_at,
  };
}

function mapUsageEvent(row: UsageEventRow) {
  return {
    id: row.id,
    featureCode: row.feature_code,
    publicCategory: usagePublicCategory(row.feature_code),
    inputUnits: toNumber(row.input_units),
    outputUnits: toNumber(row.output_units),
    chargeCredits: toNumber(row.connecty_charge_credits),
    createdAt: row.occurred_at ?? row.created_at,
  };
}

function mapUsageSummary(rows: UsageSummaryEventRow[], billingAccess: Awaited<ReturnType<typeof getOrganizationBillingAccess>>) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const categoryMap = new Map<string, { category: string; chargeCredits: number; events: number }>();
  let totalChargeCredits = 0;
  let todayChargeCredits = 0;
  let eventCount = 0;
  let lastEventAt: string | null = null;
  let lastEventTime = 0;

  for (const row of rows) {
    const chargeCredits = toNumber(row.connecty_charge_credits);
    const occurredAt = row.occurred_at ?? row.created_at;
    const occurredTime = occurredAt ? new Date(occurredAt).getTime() : 0;
    const category = usagePublicCategory(row.feature_code);
    const current = categoryMap.get(category) ?? { category, chargeCredits: 0, events: 0 };

    current.chargeCredits += chargeCredits;
    current.events += 1;
    categoryMap.set(category, current);
    totalChargeCredits += chargeCredits;
    eventCount += 1;

    if (Number.isFinite(occurredTime) && occurredTime >= todayStart.getTime()) {
      todayChargeCredits += chargeCredits;
    }

    if (Number.isFinite(occurredTime) && occurredTime > lastEventTime) {
      lastEventTime = occurredTime;
      lastEventAt = occurredAt;
    }
  }

  return {
    balanceCredits: billingAccess.balanceCredits,
    includedCredits: billingAccess.includedCredits,
    usedCredits: billingAccess.usedCredits,
    remainingCredits: billingAccess.balanceCredits,
    totalChargeCredits30d: roundCredits(totalChargeCredits),
    todayChargeCredits: roundCredits(todayChargeCredits),
    eventCount30d: eventCount,
    lastEventAt,
    byCategory: Array.from(categoryMap.values())
      .map((item) => ({
        ...item,
        chargeCredits: roundCredits(item.chargeCredits),
      }))
      .sort((left, right) => right.chargeCredits - left.chargeCredits)
      .slice(0, 6),
  };
}

function usagePublicCategory(featureCode: string | null) {
  if (!featureCode) return "Consumo da plataforma";
  if (featureCode.includes("audio") || featureCode === "voice_reply_whatsapp" || featureCode === "text_to_speech") return "Audio";
  if (featureCode.includes("media") || featureCode.includes("image") || featureCode.includes("video") || featureCode.includes("document")) return "Midia recebida";
  if (featureCode.includes("memory") || featureCode.includes("summary") || featureCode.includes("state")) return "Memoria e contexto";
  if (featureCode.includes("prompt") || featureCode.includes("clone_profile")) return "Painel";
  return "Atendimento IA";
}

function mapCycle(row: BillingCycleRow) {
  const plan = firstRelation(row.billing_plans);

  return {
    id: row.id,
    planCode: plan?.plan_code ?? null,
    planName: plan?.name ?? null,
    cycleStart: row.cycle_start,
    cycleEnd: row.cycle_end,
    includedCredits: toNumber(row.included_credits),
    usedCredits: toNumber(row.used_credits),
    overageCredits: toNumber(row.overage_credits),
    status: row.status,
    createdAt: row.created_at,
  };
}

function isPendingSubscription(status: string | null | undefined) {
  return status === "pending" || status === "incomplete" || status === "in_process";
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readPublicReceiptUrl(value: unknown): string | null {
  const candidate = findStringByKeys(value, [
    "pix_ticket_url",
    "ticket_url",
    "receipt_url",
    "receiptUrl",
    "comprovante_url",
    "external_resource_url",
    "externalResourceUrl",
    "transaction_receipt_url",
  ]);

  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function findStringByKeys(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 5 || !value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys, depth + 1);

      if (found) return found;
    }

    return null;
  }

  const record = value as JsonRecord;
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));

  for (const [key, item] of Object.entries(record)) {
    if (lowerKeys.has(key.toLowerCase()) && typeof item === "string" && item.trim()) {
      return item.trim();
    }
  }

  for (const item of Object.values(record)) {
    const found = findStringByKeys(item, keys, depth + 1);

    if (found) return found;
  }

  return null;
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function roundCredits(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1_000_000) / 1_000_000;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

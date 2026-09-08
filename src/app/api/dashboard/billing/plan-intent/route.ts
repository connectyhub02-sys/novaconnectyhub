import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { billingPeriodEnd, readCommercialTerms, snapshotPlanCommercialTerms } from "@/lib/billing/commercial-terms";
import {
  assertAccountComplete,
  formatAccountCompletionError,
  statusForAccountCompletionError,
} from "@/lib/account/signup-completion";
import {
  buildDashboardBillingCheckoutPath,
  buildDashboardBillingCheckoutUrl,
  buildPlatformBillingExternalReference,
  isBillingCheckoutPayable,
  loadBillingCheckoutIntent,
  type BillingCheckoutKind,
  type BillingCheckoutProvider,
} from "@/lib/billing/plan-checkout";
import {
  sendPlatformPlanInteractionNotification,
  sendPlatformSubscriptionPendingNotification,
} from "@/lib/billing/platform-billing-webhook";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { preparePlanPurchaseDiscount } from "@/lib/billing/plan-discounts-server";
import { preparePlatformCampaign } from "@/lib/commerce/platform-campaigns";
import { retirePlatformCheckout } from "@/lib/commerce/invoice-retirement";
import { loadCustomContract } from "@/lib/billing/custom-contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type BillingPlanIntentRow = {
  id: string;
  plan_code: string;
  name: string;
  monthly_price_brl: number | string | null;
  first_purchase_discount_percent: number;
  annual_discount_percent: number;
  billing_cycle: string;
  billing_interval: string;
  access_duration_days: number | null;
  included_credits: number | string | null;
  mercado_pago_preapproval_plan_id: string | null;
};

type ExistingSubscriptionRow = {
  id: string;
  plan_id: string | null;
  plan_code: string;
  status: string;
  provider_subscription_id: string | null;
  payer_email: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  metadata: JsonRecord | null;
  created_at: string;
};

type PlatformBillingProviderRow = {
  recurring_provider: string | null;
};

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const organization = workspace.organization ?? await ensureStarterOrganization();

  if (!organization) {
    return NextResponse.json({ error: "Empresa obrigatoria." }, { status: 422 });
  }

  const body = readRecord(await request.json().catch(() => null));
  const planCode = readPlanCode(body.planCode);
  const replacePending = body.replacePending === true;
  const campaignSelection = typeof body.campaignId === "string" && typeof body.optionId === "string" ? { campaignId: body.campaignId, optionId: body.optionId } : undefined;

  if (!planCode) {
    return NextResponse.json({ error: "Escolha um plano pago valido." }, { status: 422 });
  }

  const client = createServiceClient();

  try {
    await assertAccountComplete({ userId: workspace.user.id, client });

    const { data: plan, error: planError } = await client
      .from("billing_plans")
      .select("id, plan_code, name, monthly_price_brl, first_purchase_discount_percent, annual_discount_percent, billing_cycle, billing_interval, access_duration_days, included_credits, mercado_pago_preapproval_plan_id")
      .eq("plan_code", planCode)
      .eq("status", "active")
      .maybeSingle<BillingPlanIntentRow>();

    if (planError) {
      throw new Error(`Nao foi possivel carregar o plano: ${planError.message}`);
    }

    if (!plan) {
      return NextResponse.json({ error: "Plano nao encontrado, inativo ou indisponivel." }, { status: 404 });
    }

    const custom = await loadCustomContract(client, organization.id);
    if (custom?.base_plan_code === plan.plan_code) {
      Object.assign(plan, { name: custom.name, monthly_price_brl: custom.monthly_price_brl, included_credits: custom.included_credits, billing_cycle: "recurring", billing_interval: "month", annual_discount_percent: 0, first_purchase_discount_percent: 0, custom_contract_id: custom.id, custom_contract_version: custom.version, features: custom.features, resource_limits: custom.resource_limits });
      if (campaignSelection) return NextResponse.json({ error: "Este contrato já tem condições individuais. Não é possível somar uma campanha pública." }, { status:422 });
    }
    let amountBrl = snapshotPlanCommercialTerms(plan).price_brl;
    const payerEmail = workspace.profile.email ?? workspace.user.email ?? null;

    if (!payerEmail) {
      return NextResponse.json({ error: "Informe um e-mail no cadastro para criar a assinatura." }, { status: 422 });
    }

    if (amountBrl <= 0) {
      return NextResponse.json({ error: "Este plano ainda nao tem valor mensal configurado." }, { status: 422 });
    }

    let replacedSubscription: ExistingSubscriptionRow | null = null;
    const existingSubscription = await loadBlockingSubscription(client, organization.id);
    const platformBillingProvider = await loadPlatformBillingProvider(client);

    if (existingSubscription) {
      if (isPendingSubscription(existingSubscription.status)) {
        if (existingSubscription.plan_code === plan.plan_code) {
          let pendingIntent = await loadBillingCheckoutIntent(client, { organizationId: organization.id, subscriptionId: existingSubscription.id });
          if (!pendingIntent) throw new Error("Não foi possível carregar a cobrança pendente.");
          if (campaignSelection) { await preparePlatformCampaign(client, pendingIntent.payment.id, campaignSelection); pendingIntent = (await loadBillingCheckoutIntent(client, { organizationId: organization.id, subscriptionId: existingSubscription.id }))!; }
          const terms = readRecord(pendingIntent.payment.payload?.commercial_terms);
          amountBrl = pendingIntent.checkoutKind === "initial" && !pendingIntent.payment.payload?.campaign_pricing && terms.first_purchase_discount_percent !== undefined
            ? await preparePlanPurchaseDiscount(client, pendingIntent.payment.id)
            : toNumber(pendingIntent.payment.amount_brl);
          const notification = await notifySubscriptionPendingSafely(client, {
            organizationId: organization.id,
            actorId: workspace.user.id,
            subscriptionId: existingSubscription.id,
            invoiceId: null,
            paymentId: null,
            planCode: plan.plan_code,
            planName: plan.name,
            amountBrl,
            includedCredits: toNumber(plan.included_credits),
            checkoutPath: buildDashboardBillingCheckoutPath(existingSubscription.id),
            checkoutUrl: buildDashboardBillingCheckoutUrl(existingSubscription.id),
            source: "dashboard_plan_intent_existing_pending",
          });

          return NextResponse.json({
            ok: true,
            subscriptionId: existingSubscription.id,
            planCode: existingSubscription.plan_code,
            checkoutUrl: buildDashboardBillingCheckoutPath(existingSubscription.id),
            notificationStatus: notification.status,
            notificationError: notification.errorMessage,
            message: "Ja existe um checkout deste plano em aberto. Vamos te levar para concluir pelo painel.",
          });
        }

        if (replacePending) {
          await cancelPendingSubscription(client, {
            subscription: existingSubscription,
            organizationId: organization.id,
            actorId: workspace.user.id,
            nextPlanCode: plan.plan_code,
          });
          replacedSubscription = existingSubscription;
        } else {
          return NextResponse.json(
            {
              code: "pending_plan_exists",
              error: "Ja existe uma solicitacao de plano em andamento. Conclua ou aguarde a confirmacao antes de trocar de plano.",
              pendingPlanCode: existingSubscription.plan_code,
              pendingSubscriptionId: existingSubscription.id,
              pendingCheckoutUrl: buildDashboardBillingCheckoutPath(existingSubscription.id),
            },
            { status: 409 },
          );
        }
      } else if (isRenewableSubscription(existingSubscription.status)) {
        const checkoutKind: BillingCheckoutKind = existingSubscription.plan_code === plan.plan_code
          ? "renewal"
          : "plan_change";
        const checkout = await createCheckoutForExistingSubscription(client, {
          organizationId: organization.id,
          actorId: workspace.user.id,
          subscription: existingSubscription,
          plan,
          payerEmail,
          provider: platformBillingProvider,
          checkoutKind,
          campaignSelection,
        });

        return NextResponse.json({
          ok: true,
          subscriptionId: existingSubscription.id,
          invoiceId: checkout.invoiceId,
          paymentId: checkout.paymentId,
          planCode: plan.plan_code,
          previousPlanCode: existingSubscription.plan_code,
          checkoutKind,
          checkoutUrl: checkout.checkoutPath,
          notificationStatus: checkout.notification.status,
          notificationError: checkout.notification.errorMessage,
          reusedCheckout: checkout.reused,
          message: checkoutKind === "renewal"
            ? "Checkout de renovacao criado. Finalize o pagamento para manter seu plano ativo."
            : "Checkout de troca de plano criado. A troca sera aplicada apos o pagamento aprovado.",
        });
      }
    }

    const now = new Date();
    const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const subscriptionId = randomUUID();
    const invoiceId = randomUUID();
    const paymentId = randomUUID();
    const externalReference = buildPlatformBillingExternalReference({
      organizationId: organization.id,
      subscriptionId,
      invoiceId,
      paymentId,
    });
    const checkoutPath = buildDashboardBillingCheckoutPath(subscriptionId);
    const checkoutUrl = buildDashboardBillingCheckoutUrl(subscriptionId);
    const intentMetadata = {
      campaign_selection: campaignSelection,
      commercial_terms: snapshotPlanCommercialTerms(plan),
      source: "dashboard_plan_intent",
      checkout_model: "connectyhub_plan_checkout",
      checkout_kind: "initial",
      requested_plan_code: plan.plan_code,
      target_plan_code: plan.plan_code,
      current_plan_code: organization.planCode,
      organization_status: organization.status,
      actor_id: workspace.user.id,
      subscription_id: subscriptionId,
      invoice_id: invoiceId,
      payment_id: paymentId,
      external_reference: externalReference,
      checkout_status: "internal_checkout_created",
      checkout_url: checkoutPath,
      checkout_public_url: checkoutUrl,
      billing_provider: platformBillingProvider,
    };

    const { error: subscriptionError } = await client
      .from("organization_subscriptions")
      .insert({
        id: subscriptionId,
        organization_id: organization.id,
        plan_id: plan.id,
        plan_code: plan.plan_code,
        status: "pending",
        billing_provider: platformBillingProvider,
        provider_plan_id: null,
        payer_email: payerEmail,
        included_credits_granted: 0,
        metadata: intentMetadata,
      });

    if (subscriptionError) {
      throw new Error(`Nao foi possivel registrar a assinatura pendente: ${subscriptionError.message}`);
    }

    const { error: invoiceError } = await client
      .from("billing_invoices")
      .insert({
        id: invoiceId,
        organization_id: organization.id,
        subscription_id: subscriptionId,
        status: "open",
        currency: "BRL",
        subtotal_brl: amountBrl,
        discount_brl: 0,
        total_brl: amountBrl,
        due_at: dueAt,
        provider: platformBillingProvider,
        metadata: intentMetadata,
      });

    if (invoiceError) {
      throw new Error(invoiceError?.message ?? "Nao foi possivel registrar a fatura do plano.");
    }

    const { error: itemError } = await client.from("billing_invoice_items").insert({
      invoice_id: invoiceId,
      organization_id: organization.id,
      item_type: "plan",
      description: `Plano ${plan.name}`,
      quantity: 1,
      unit_price_brl: amountBrl,
      total_brl: amountBrl,
      credit_amount: toNumber(plan.included_credits),
      metadata: intentMetadata,
    });

    if (itemError) {
      throw new Error(`Fatura criada, mas o item do plano falhou: ${itemError.message}`);
    }

    const { error: paymentError } = await client
      .from("billing_payments")
      .insert({
        id: paymentId,
        organization_id: organization.id,
        invoice_id: invoiceId,
        subscription_id: subscriptionId,
        provider: platformBillingProvider,
        status: "pending",
        amount_brl: amountBrl,
        payload: intentMetadata,
      });

    if (paymentError) {
      throw new Error(paymentError?.message ?? "Nao foi possivel registrar o pagamento pendente.");
    }

    if (campaignSelection) amountBrl = (await preparePlatformCampaign(client, paymentId, campaignSelection))!.price_brl;
    else amountBrl = await preparePlanPurchaseDiscount(client, paymentId);

    await client.from("maintenance_audit_logs").insert({
      event_type: "billing.plan_checkout.created",
      target_table: "billing_payments",
      target_id: paymentId,
      metadata: {
        ...intentMetadata,
        amount_brl: amountBrl,
      },
    });

    const notification = await notifySubscriptionPendingSafely(client, {
      organizationId: organization.id,
      actorId: workspace.user.id,
      subscriptionId,
      invoiceId,
      paymentId,
      planCode: plan.plan_code,
      planName: plan.name,
      amountBrl,
      includedCredits: toNumber(plan.included_credits),
      checkoutPath,
      checkoutUrl,
      source: "dashboard_plan_intent_created",
    });
    const replacementNotification = replacedSubscription
      ? await notifySubscriptionReplacedSafely(client, {
          organizationId: organization.id,
          actorId: workspace.user.id,
          previousSubscriptionId: replacedSubscription.id,
          previousPlanCode: replacedSubscription.plan_code,
          subscriptionId,
          invoiceId,
          paymentId,
          planCode: plan.plan_code,
          planName: plan.name,
          amountBrl,
          includedCredits: toNumber(plan.included_credits),
          checkoutPath,
          checkoutUrl,
        })
      : null;

    return NextResponse.json({
      ok: true,
      subscriptionId,
      invoiceId,
      paymentId,
      planCode: plan.plan_code,
      checkoutUrl: checkoutPath,
      notificationStatus: notification.status,
      notificationError: notification.errorMessage,
      replacementNotificationStatus: replacementNotification?.status ?? null,
      replacementNotificationError: replacementNotification?.errorMessage ?? null,
      message: "Checkout criado. Finalize o pagamento para ativar seu plano.",
    });
  } catch (error) {
    const accountStatus = statusForAccountCompletionError(error, 500);

    return NextResponse.json(
      accountStatus !== 500
        ? formatAccountCompletionError(error)
        : { error: error instanceof Error ? error.message : "Nao foi possivel solicitar o plano." },
      { status: accountStatus },
    );
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readPlanCode(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "trial") return null;

  return /^[a-z0-9_-]{2,60}$/.test(normalized) ? normalized : null;
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function readDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function loadBlockingSubscription(client: ReturnType<typeof createServiceClient>, organizationId: string) {
  const { data, error } = await client
    .from("organization_subscriptions")
    .select("id, plan_id, plan_code, status, provider_subscription_id, payer_email, current_period_start, current_period_end, next_billing_at, metadata, created_at")
    .eq("organization_id", organizationId)
    .eq("subscription_kind", "plan")
    .in("status", ["pending", "active", "past_due", "incomplete"])
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<ExistingSubscriptionRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel validar assinaturas existentes: ${error.message}`);
  }

  return data?.[0] ?? null;
}

function isPendingSubscription(status: string) {
  return status === "pending" || status === "incomplete";
}

function isRenewableSubscription(status: string) {
  return status === "active" || status === "past_due";
}

async function loadPlatformBillingProvider(client: ReturnType<typeof createServiceClient>): Promise<BillingCheckoutProvider> {
  const { error } = await client
    .from("platform_billing_settings")
    .select("recurring_provider")
    .eq("setting_key", "default")
    .maybeSingle<PlatformBillingProviderRow>();

  if (error) {
    throw new Error("Não foi possível conferir o recebimento da ConnectyHub. Tente novamente.");
  }



  return "asaas";
}

async function createCheckoutForExistingSubscription(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    actorId: string;
    subscription: ExistingSubscriptionRow;
    plan: BillingPlanIntentRow;
    payerEmail: string;
    provider: BillingCheckoutProvider;
    checkoutKind: BillingCheckoutKind;
    campaignSelection?: { campaignId: string; optionId: string };
  },
) {
  let existingIntent = await loadBillingCheckoutIntent(client, {
    organizationId: input.organizationId,
    subscriptionId: input.subscription.id,
  });

  if (
    existingIntent
    && isBillingCheckoutPayable(existingIntent)
    && existingIntent.targetPlanCode === input.plan.plan_code
    && existingIntent.checkoutKind === input.checkoutKind
    && (input.checkoutKind !== "renewal" || existingIntent.payment.payload?.previous_current_period_end === input.subscription.current_period_end)
  ) {
    await preparePlatformCampaign(client, existingIntent.payment.id, input.campaignSelection);
    existingIntent = (await loadBillingCheckoutIntent(client, { organizationId: input.organizationId, subscriptionId: input.subscription.id }))!;
    const checkoutPath = buildDashboardBillingCheckoutPath(input.subscription.id);
    const checkoutUrl = buildDashboardBillingCheckoutUrl(input.subscription.id);
    const notification = await notifySubscriptionPendingSafely(client, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      subscriptionId: input.subscription.id,
      invoiceId: existingIntent.invoice.id,
      paymentId: existingIntent.payment.id,
      planCode: input.plan.plan_code,
      planName: input.plan.name,
      amountBrl: toNumber(existingIntent.payment.amount_brl ?? existingIntent.invoice.total_brl ?? input.plan.monthly_price_brl),
      includedCredits: toNumber(input.plan.included_credits),
      checkoutPath,
      checkoutUrl,
      source: `dashboard_plan_${input.checkoutKind}_existing_checkout`,
    });

    return {
      invoiceId: existingIntent.invoice.id,
      paymentId: existingIntent.payment.id,
      checkoutPath,
      checkoutUrl,
      notification,
      reused: true,
    };
  }

  if (existingIntent && isBillingCheckoutPayable(existingIntent)) {
    await cancelOpenCheckoutForSubscription(client, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      subscription: input.subscription,
      nextPlanCode: input.plan.plan_code,
    });
  }

  const now = new Date();
  const termsSnapshot = input.checkoutKind === "renewal" && input.subscription.metadata?.commercial_terms
    ? readRecord(input.subscription.metadata.commercial_terms) : snapshotPlanCommercialTerms(input.plan);
  let amountBrl = toNumber(termsSnapshot.price_brl as number | undefined ?? input.plan.monthly_price_brl);
  const invoiceId = randomUUID();
  const paymentId = randomUUID();
  const externalReference = buildPlatformBillingExternalReference({
    organizationId: input.organizationId,
    subscriptionId: input.subscription.id,
    invoiceId,
    paymentId,
  });
  const checkoutPath = buildDashboardBillingCheckoutPath(input.subscription.id);
  const checkoutUrl = buildDashboardBillingCheckoutUrl(input.subscription.id);
  const currentPeriodEnd = readDate(input.subscription.current_period_end);
  const cycleStart = input.checkoutKind === "renewal" && currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()
    ? currentPeriodEnd
    : now;
  const cycleEnd = billingPeriodEnd(cycleStart, readCommercialTerms(termsSnapshot));
  const dueAt = input.checkoutKind === "renewal" && currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()
    ? currentPeriodEnd
    : new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const intentMetadata = {
    ...(input.subscription.metadata ?? {}),
    campaign_selection: null, campaign_pricing: null, plan_pricing: null,
    commercial_terms: termsSnapshot,
    source: `dashboard_plan_${input.checkoutKind}`,
    checkout_model: "connectyhub_plan_checkout",
    checkout_kind: input.checkoutKind,
    requested_plan_code: input.plan.plan_code,
    target_plan_code: input.plan.plan_code,
    previous_plan_code: input.subscription.plan_code,
    current_subscription_plan_code: input.subscription.plan_code,
    previous_current_period_start: input.subscription.current_period_start,
    previous_current_period_end: input.subscription.current_period_end,
    cycle_start_at: cycleStart.toISOString(),
    cycle_end_at: cycleEnd.toISOString(),
    actor_id: input.actorId,
    subscription_id: input.subscription.id,
    invoice_id: invoiceId,
    payment_id: paymentId,
    external_reference: externalReference,
    checkout_status: "internal_checkout_created",
    checkout_url: checkoutPath,
    checkout_public_url: checkoutUrl,
    billing_provider: input.provider,
  };

  const subscriptionUpdate = await client
    .from("organization_subscriptions")
    .update({
      billing_provider: input.provider,
      payer_email: input.subscription.payer_email ?? input.payerEmail,
      metadata: { ...(input.subscription.metadata ?? {}), pending_checkout_payment_id: paymentId, pending_checkout_invoice_id: invoiceId },
    })
    .eq("id", input.subscription.id)
    .eq("organization_id", input.organizationId);

  if (subscriptionUpdate.error) {
    throw new Error(`Nao foi possivel atualizar a assinatura para checkout: ${subscriptionUpdate.error.message}`);
  }

  const invoiceInsert = await client
    .from("billing_invoices")
    .insert({
      id: invoiceId,
      organization_id: input.organizationId,
      subscription_id: input.subscription.id,
      status: "open",
      currency: "BRL",
      subtotal_brl: amountBrl,
      discount_brl: 0,
      total_brl: amountBrl,
      due_at: dueAt.toISOString(),
      provider: input.provider,
      metadata: intentMetadata,
    });

  if (invoiceInsert.error) {
    throw new Error(`Nao foi possivel registrar a fatura da assinatura: ${invoiceInsert.error.message}`);
  }

  const itemInsert = await client.from("billing_invoice_items").insert({
    invoice_id: invoiceId,
    organization_id: input.organizationId,
    item_type: "plan",
    description: input.checkoutKind === "plan_change" ? `Troca para Plano ${input.plan.name}` : `Renovacao Plano ${input.plan.name}`,
    quantity: 1,
    unit_price_brl: amountBrl,
    total_brl: amountBrl,
    credit_amount: toNumber(input.plan.included_credits),
    metadata: intentMetadata,
  });

  if (itemInsert.error) {
    throw new Error(`Fatura criada, mas o item do plano falhou: ${itemInsert.error.message}`);
  }

  const paymentInsert = await client
    .from("billing_payments")
    .insert({
      id: paymentId,
      organization_id: input.organizationId,
      invoice_id: invoiceId,
      subscription_id: input.subscription.id,
      provider: input.provider,
      status: "pending",
      amount_brl: amountBrl,
      payload: intentMetadata,
    });

  if (paymentInsert.error) {
    throw new Error(`Nao foi possivel registrar o pagamento pendente: ${paymentInsert.error.message}`);
  }

  await preparePlatformCampaign(client, paymentId, input.campaignSelection);
  const priced = await client.from("billing_payments").select("amount_brl").eq("id", paymentId).single();
  if (priced.error) throw new Error("Não foi possível conferir o valor contratado.");
  amountBrl = Number(priced.data.amount_brl);

  await client.from("maintenance_audit_logs").insert({
    event_type: `billing.plan_checkout.${input.checkoutKind}.created`,
    target_table: "billing_payments",
    target_id: paymentId,
    metadata: {
      ...intentMetadata,
      amount_brl: amountBrl,
    },
  });

  const notification = await notifySubscriptionPendingSafely(client, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    subscriptionId: input.subscription.id,
    invoiceId,
    paymentId,
    planCode: input.plan.plan_code,
    planName: input.plan.name,
    amountBrl,
    includedCredits: toNumber(input.plan.included_credits),
    checkoutPath,
    checkoutUrl,
    source: `dashboard_plan_${input.checkoutKind}_created`,
  });

  return {
    invoiceId,
    paymentId,
    checkoutPath,
    checkoutUrl,
    notification,
    reused: false,
  };
}

async function cancelOpenCheckoutForSubscription(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    actorId: string;
    subscription: ExistingSubscriptionRow;
    nextPlanCode: string;
  },
) {
  await retirePlatformCheckout(client, input.organizationId, input.subscription.id, input.actorId, input.nextPlanCode);
}

async function cancelPendingSubscription(
  client: ReturnType<typeof createServiceClient>,
  input: {
    subscription: ExistingSubscriptionRow;
    organizationId: string;
    actorId: string;
    nextPlanCode: string;
  },
) {
  await cancelOpenCheckoutForSubscription(client, input);
  const now = new Date().toISOString();
  const replacementMetadata = {
    ...(input.subscription.metadata ?? {}),
    checkout_status: "replaced_by_customer",
    replaced_at: now,
    replaced_by: input.actorId,
    replaced_by_plan_code: input.nextPlanCode,
    previous_plan_code: input.subscription.plan_code,
  };

  const subscriptionUpdate = await client
      .from("organization_subscriptions")
      .update({
        status: "canceled",
        canceled_at: now,
        metadata: replacementMetadata,
      })
      .eq("id", input.subscription.id)
      .eq("organization_id", input.organizationId)
      .in("status", ["pending", "incomplete"]);

  if (subscriptionUpdate.error) {
    throw new Error(
      subscriptionUpdate.error?.message
      ?? "Nao foi possivel trocar o plano pendente.",
    );
  }

  await client.from("maintenance_audit_logs").insert({
    event_type: "billing.plan_checkout.replaced",
    target_table: "organization_subscriptions",
    target_id: input.subscription.id,
    metadata: replacementMetadata,
  });
}

async function notifySubscriptionPendingSafely(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    actorId: string;
    subscriptionId: string;
    invoiceId: string | null;
    paymentId: string | null;
    planCode: string;
    planName: string;
    amountBrl: number;
    includedCredits: number;
    checkoutPath: string;
    checkoutUrl: string;
    source: string;
  },
) {
  try {
    return await sendPlatformSubscriptionPendingNotification(client, {
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      planCode: input.planCode,
      planName: input.planName,
      amountBrl: input.amountBrl,
      includedCredits: input.includedCredits,
      dedupeKey: `billing:${input.subscriptionId}:${input.paymentId ?? "subscription"}:pending`,
      providerStatus: "pending",
      metadata: {
        source: input.source,
        actor_id: input.actorId,
        checkout_url: input.checkoutPath,
        checkout_public_url: input.checkoutUrl,
        checkout_model: "connectyhub_plan_checkout",
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao disparar automacao de assinatura pendente.";

    await client.from("maintenance_audit_logs").insert({
      event_type: "billing.plan_checkout.notification_failed",
      target_table: "organization_subscriptions",
      target_id: input.subscriptionId,
      metadata: {
        source: input.source,
        actor_id: input.actorId,
        organization_id: input.organizationId,
        plan_code: input.planCode,
        error: errorMessage,
      },
    });

    return {
      notificationId: null,
      status: "failed",
      selectedAgentId: null,
      recipientPhone: null,
      messagePreview: null,
      errorMessage,
    };
  }
}

async function notifySubscriptionReplacedSafely(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    actorId: string;
    previousSubscriptionId: string;
    previousPlanCode: string;
    subscriptionId: string;
    invoiceId: string;
    paymentId: string;
    planCode: string;
    planName: string;
    amountBrl: number;
    includedCredits: number;
    checkoutPath: string;
    checkoutUrl: string;
  },
) {
  try {
    return await sendPlatformPlanInteractionNotification(client, {
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      planCode: input.planCode,
      planName: input.planName,
      amountBrl: input.amountBrl,
      includedCredits: input.includedCredits,
      eventType: "subscription_replaced",
      dedupeKey: `billing:${input.subscriptionId}:subscription_replaced:${input.previousSubscriptionId}`,
      providerStatus: "replaced_before_payment",
      metadata: {
        source: "dashboard_plan_checkout_replaced",
        actor_id: input.actorId,
        previous_subscription_id: input.previousSubscriptionId,
        previous_plan_code: input.previousPlanCode,
        previous_plan_name: formatPlanName(input.previousPlanCode),
        checkout_url: input.checkoutPath,
        checkout_public_url: input.checkoutUrl,
        checkout_model: "connectyhub_plan_checkout",
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao disparar automacao de troca de plano.";

    await client.from("maintenance_audit_logs").insert({
      event_type: "billing.plan_checkout.replaced_notification_failed",
      target_table: "organization_subscriptions",
      target_id: input.subscriptionId,
      metadata: {
        source: "dashboard_plan_checkout_replaced",
        actor_id: input.actorId,
        organization_id: input.organizationId,
        previous_subscription_id: input.previousSubscriptionId,
        previous_plan_code: input.previousPlanCode,
        plan_code: input.planCode,
        error: errorMessage,
      },
    });

    return {
      notificationId: null,
      status: "failed",
      selectedAgentId: null,
      recipientPhone: null,
      messagePreview: null,
      errorMessage,
    };
  }
}

function formatPlanName(planCode: string) {
  if (planCode === "starter") return "Start";
  if (planCode === "pro") return "Pro";
  if (planCode === "scale") return "Scale";
  if (planCode === "trial") return "Teste gratis";
  return planCode;
}

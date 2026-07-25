import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppBaseUrl, normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import {
  billingCheckoutBumps,
  type BillingCheckoutBump,
  type BillingCheckoutBumpCode,
} from "./plan-checkout-catalog";

export type JsonRecord = Record<string, unknown>;

export type BillingCheckoutIntent = {
  subscription: {
    id: string;
    organization_id: string;
    plan_id: string | null;
    plan_code: string;
    status: string;
    payer_email: string | null;
    provider_subscription_id: string | null;
    metadata: JsonRecord | null;
  };
  invoice: {
    id: string;
    organization_id: string;
    subscription_id: string | null;
    status: string;
    subtotal_brl: number | string | null;
    discount_brl: number | string | null;
    total_brl: number | string | null;
    metadata: JsonRecord | null;
  };
  payment: {
    id: string;
    organization_id: string;
    invoice_id: string | null;
    subscription_id: string | null;
    status: string;
    amount_brl: number | string | null;
    provider_payment_id: string | null;
    provider_status: string | null;
    payload: JsonRecord | null;
  };
  plan: {
    id: string;
    plan_code: string;
    name: string;
    monthly_price_brl: number | string | null;
    included_credits: number | string | null;
  };
};

const bumpByCode = new Map<BillingCheckoutBumpCode, BillingCheckoutBump>(
  billingCheckoutBumps.map((bump) => [bump.code, bump]),
);

export function buildDashboardBillingCheckoutPath(subscriptionId: string) {
  return `/dashboard/planos/checkout/${encodeURIComponent(subscriptionId)}`;
}

export function buildDashboardBillingCheckoutUrl(subscriptionId: string) {
  return `${getAppBaseUrl()}${buildDashboardBillingCheckoutPath(subscriptionId)}`;
}

export function buildPlatformBillingExternalReference(input: {
  organizationId: string;
  subscriptionId: string;
  invoiceId: string;
  paymentId: string;
}) {
  return `connectyhub_subscription:${input.organizationId}:${input.subscriptionId}:${input.invoiceId}:${input.paymentId}`;
}

export async function loadBillingCheckoutIntent(
  client: SupabaseClient,
  input: {
    organizationId: string;
    subscriptionId: string;
  },
): Promise<BillingCheckoutIntent | null> {
  const { data: subscription, error: subscriptionError } = await client
    .from("organization_subscriptions")
    .select("id, organization_id, plan_id, plan_code, status, payer_email, provider_subscription_id, metadata")
    .eq("id", input.subscriptionId)
    .eq("organization_id", input.organizationId)
    .maybeSingle<BillingCheckoutIntent["subscription"]>();

  if (subscriptionError) {
    throw new Error(`Nao foi possivel carregar a assinatura: ${subscriptionError.message}`);
  }

  if (!subscription) {
    return null;
  }

  const [invoiceResult, paymentResult, planResult] = await Promise.all([
    client
      .from("billing_invoices")
      .select("id, organization_id, subscription_id, status, subtotal_brl, discount_brl, total_brl, metadata")
      .eq("subscription_id", subscription.id)
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<BillingCheckoutIntent["invoice"]>(),
    client
      .from("billing_payments")
      .select("id, organization_id, invoice_id, subscription_id, status, amount_brl, provider_payment_id, provider_status, payload")
      .eq("subscription_id", subscription.id)
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<BillingCheckoutIntent["payment"]>(),
    client
      .from("billing_plans")
      .select("id, plan_code, name, monthly_price_brl, included_credits")
      .eq("plan_code", subscription.plan_code)
      .maybeSingle<BillingCheckoutIntent["plan"]>(),
  ]);

  if (invoiceResult.error) {
    throw new Error(`Nao foi possivel carregar a fatura: ${invoiceResult.error.message}`);
  }

  if (paymentResult.error) {
    throw new Error(`Nao foi possivel carregar o pagamento: ${paymentResult.error.message}`);
  }

  if (planResult.error) {
    throw new Error(`Nao foi possivel carregar o plano: ${planResult.error.message}`);
  }

  if (!invoiceResult.data || !paymentResult.data || !planResult.data) {
    return null;
  }

  return {
    subscription,
    invoice: invoiceResult.data,
    payment: paymentResult.data,
    plan: planResult.data,
  };
}

export async function syncBillingCheckoutCart(
  client: SupabaseClient,
  intent: BillingCheckoutIntent,
  selectedBumpCodes: BillingCheckoutBumpCode[],
) {
  const selectedBumps = selectedBumpCodes
    .map((code) => bumpByCode.get(code))
    .filter((bump): bump is BillingCheckoutBump => Boolean(bump));
  const planAmount = normalizeCurrencyAmount(intent.plan.monthly_price_brl) ?? normalizeCurrencyAmount(intent.invoice.subtotal_brl) ?? 0;
  const bumpsAmount = roundMoney(selectedBumps.reduce((total, bump) => total + bump.priceBrl, 0));
  const totalAmount = roundMoney(planAmount + bumpsAmount);
  const externalReference = readExternalReference(intent)
    ?? buildPlatformBillingExternalReference({
      organizationId: intent.subscription.organization_id,
      subscriptionId: intent.subscription.id,
      invoiceId: intent.invoice.id,
      paymentId: intent.payment.id,
    });
  const checkoutPath = buildDashboardBillingCheckoutPath(intent.subscription.id);
  const checkoutUrl = buildDashboardBillingCheckoutUrl(intent.subscription.id);
  const cartMetadata = {
    selected_bump_codes: selectedBumps.map((bump) => bump.code),
    selected_bumps: selectedBumps.map(serializeBump),
    plan_amount_brl: planAmount,
    bumps_amount_brl: bumpsAmount,
    checkout_total_brl: totalAmount,
    checkout_url: checkoutPath,
    checkout_public_url: checkoutUrl,
    external_reference: externalReference,
    checkout_model: "connectyhub_plan_checkout",
    checkout_status: "internal_checkout_ready",
  };

  const deleteExistingBumps = await client
    .from("billing_invoice_items")
    .delete()
    .eq("invoice_id", intent.invoice.id)
    .eq("organization_id", intent.subscription.organization_id)
    .contains("metadata", { source: "dashboard_plan_checkout_bump" });

  if (deleteExistingBumps.error) {
    throw new Error(`Nao foi possivel atualizar os adicionais do checkout: ${deleteExistingBumps.error.message}`);
  }

  if (selectedBumps.length > 0) {
    const insertItems = await client.from("billing_invoice_items").insert(
      selectedBumps.map((bump) => ({
        invoice_id: intent.invoice.id,
        organization_id: intent.subscription.organization_id,
        item_type: bump.itemType,
        description: bump.title,
        quantity: 1,
        unit_price_brl: bump.priceBrl,
        total_brl: bump.priceBrl,
        credit_amount: bump.creditAmount,
        metadata: {
          source: "dashboard_plan_checkout_bump",
          bump: serializeBump(bump),
          recurrence: bump.recurrence,
        },
      })),
    );

    if (insertItems.error) {
      throw new Error(`Nao foi possivel inserir adicionais no checkout: ${insertItems.error.message}`);
    }
  }

  const [subscriptionUpdate, invoiceUpdate, paymentUpdate] = await Promise.all([
    client
      .from("organization_subscriptions")
      .update({
        metadata: {
          ...(intent.subscription.metadata ?? {}),
          ...cartMetadata,
        },
      })
      .eq("id", intent.subscription.id)
      .eq("organization_id", intent.subscription.organization_id),
    client
      .from("billing_invoices")
      .update({
        subtotal_brl: totalAmount,
        discount_brl: 0,
        total_brl: totalAmount,
        metadata: {
          ...(intent.invoice.metadata ?? {}),
          ...cartMetadata,
        },
      })
      .eq("id", intent.invoice.id)
      .eq("organization_id", intent.subscription.organization_id),
    client
      .from("billing_payments")
      .update({
        amount_brl: totalAmount,
        payload: {
          ...(intent.payment.payload ?? {}),
          ...cartMetadata,
        },
      })
      .eq("id", intent.payment.id)
      .eq("organization_id", intent.subscription.organization_id),
  ]);

  if (subscriptionUpdate.error || invoiceUpdate.error || paymentUpdate.error) {
    throw new Error(
      subscriptionUpdate.error?.message
      ?? invoiceUpdate.error?.message
      ?? paymentUpdate.error?.message
      ?? "Nao foi possivel atualizar o carrinho.",
    );
  }

  return {
    planAmount,
    bumpsAmount,
    totalAmount,
    selectedBumps,
    externalReference,
    checkoutPath,
    checkoutUrl,
    metadata: cartMetadata,
  };
}

export function normalizeBillingCheckoutBumpCodes(value: unknown): BillingCheckoutBumpCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<BillingCheckoutBumpCode>();

  for (const item of value) {
    if (typeof item !== "string") continue;
    const code = item.trim() as BillingCheckoutBumpCode;

    if (bumpByCode.has(code)) {
      seen.add(code);
    }
  }

  return [...seen];
}

export function readSelectedBillingCheckoutBumpCodes(intent: BillingCheckoutIntent | null) {
  return normalizeBillingCheckoutBumpCodes(
    intent?.payment.payload?.selected_bump_codes
    ?? intent?.subscription.metadata?.selected_bump_codes
    ?? intent?.invoice.metadata?.selected_bump_codes,
  );
}

export function readBillingCheckoutPixData(intent: BillingCheckoutIntent | null) {
  const payload = intent?.payment.payload ?? {};

  return {
    pixQrCode: readString(payload.pix_qr_code),
    pixQrCodeBase64: readString(payload.pix_qr_code_base64),
    pixTicketUrl: readString(payload.pix_ticket_url),
  };
}

export function readExternalReference(intent: BillingCheckoutIntent) {
  return readString(intent.payment.payload?.external_reference)
    ?? readString(intent.invoice.metadata?.external_reference)
    ?? readString(intent.subscription.metadata?.external_reference);
}

export function isBillingCheckoutPayable(intent: BillingCheckoutIntent) {
  return ["pending", "incomplete", "past_due"].includes(intent.subscription.status)
    && ["open", "draft", "failed"].includes(intent.invoice.status)
    && ["pending", "rejected", "in_process"].includes(intent.payment.status);
}

export function formatBillingCheckoutDescription(intent: BillingCheckoutIntent, selectedBumps: BillingCheckoutBump[]) {
  const bumpText = selectedBumps.length > 0
    ? ` + ${selectedBumps.map((bump) => bump.title).join(" + ")}`
    : "";

  return `ConnectyHub ${intent.plan.name}${bumpText}`.slice(0, 220);
}

function serializeBump(bump: BillingCheckoutBump) {
  return {
    code: bump.code,
    title: bump.title,
    price_brl: bump.priceBrl,
    recurrence: bump.recurrence,
    item_type: bump.itemType,
    credit_amount: bump.creditAmount,
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

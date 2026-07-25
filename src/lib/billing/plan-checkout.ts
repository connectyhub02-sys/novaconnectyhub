import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppBaseUrl, normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import type { BillingCheckoutBump, BillingCheckoutBumpCode, BillingCheckoutBumpMedia } from "./plan-checkout-catalog";

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

export type BillingOrderBumpProductOption = {
  id: string;
  productCode: string;
  name: string;
  description: string;
  priceBrl: number;
  priceLabel: string;
  status: string;
  selected: boolean;
  available: boolean;
  creditAmount: number | null;
  recurrence: BillingCheckoutBump["recurrence"];
  badge: string;
  highlightLabel: string | null;
  media: BillingCheckoutBumpMedia | null;
};

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
  availableBumps: BillingCheckoutBump[],
) {
  const bumpByCode = new Map(availableBumps.map((bump) => [bump.code, bump]));
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
          platform_product_id: bump.platformProductId,
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
  return normalizeBillingCheckoutBumpCodesForCatalog(value, null);
}

export function normalizeBillingCheckoutBumpCodesForCatalog(
  value: unknown,
  availableBumps: BillingCheckoutBump[] | null,
): BillingCheckoutBumpCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<BillingCheckoutBumpCode>();
  const allowedCodes = availableBumps ? new Set(availableBumps.map((bump) => bump.code)) : null;

  for (const item of value) {
    if (typeof item !== "string") continue;
    const code = item.trim() as BillingCheckoutBumpCode;

    if (!allowedCodes || allowedCodes.has(code)) {
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

export function readSelectedBillingCheckoutBumpCodesForCatalog(
  intent: BillingCheckoutIntent | null,
  availableBumps: BillingCheckoutBump[],
) {
  return normalizeBillingCheckoutBumpCodesForCatalog(
    intent?.payment.payload?.selected_bump_codes
    ?? intent?.subscription.metadata?.selected_bump_codes
    ?? intent?.invoice.metadata?.selected_bump_codes,
    availableBumps,
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

export async function loadBillingCheckoutBumps(client: SupabaseClient) {
  const options = await loadBillingOrderBumpProductOptions(client);
  return options
    .filter((option) => option.selected && option.available)
    .map((option) => ({
      code: option.id,
      platformProductId: option.id,
      title: option.name,
      description: option.description,
      priceBrl: option.priceBrl,
      recurrence: option.recurrence,
      itemType: option.creditAmount && option.creditAmount > 0 ? "credit_pack" : "adjustment",
      creditAmount: option.creditAmount,
      badge: option.badge,
      highlightLabel: option.highlightLabel,
      media: option.media,
    } satisfies BillingCheckoutBump));
}

export async function loadBillingOrderBumpProductOptions(client: SupabaseClient): Promise<BillingOrderBumpProductOption[]> {
  const settings = await loadBillingOrderBumpSettings(client);
  const { data, error } = await client
    .from("platform_products")
    .select("id, product_code, name, short_description, commercial_description, category, status, owner_type, sales_channel_type, price, currency, offer, media, metadata, updated_at")
    .eq("owner_type", "connectyhub")
    .eq("sales_channel_type", "direct")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Nao foi possivel carregar produtos internos para order bump: ${error.message}`);
  }

  const selectedIds = new Set(settings.selectedProductIds);

  return (data ?? []).map((row) => {
    const record = row as JsonRecord;
    const metadata = readRecord(record.metadata) ?? {};
    const offer = readRecord(record.offer) ?? {};
    const priceText = readString(offer.sale_price ?? offer.salePrice) ?? readString(record.price);
    const priceBrl = parseBrlPrice(priceText);
    const name = readString(record.name) ?? "Produto ConnectyHub";
    const description = readString(record.short_description)
      ?? readString(record.commercial_description)
      ?? "Adicional ConnectyHub para aumentar o carrinho no checkout.";
    const status = readString(record.status) ?? "draft";
    const creditAmount = readOrderBumpCreditAmount(metadata, name, description);
    const media = readOrderBumpMedia(record.media);

    return {
      id: String(record.id),
      productCode: readString(record.product_code) ?? String(record.id),
      name,
      description,
      priceBrl,
      priceLabel: priceBrl > 0 ? formatBrl(priceBrl) : priceText ?? "Sem preco",
      status,
      selected: selectedIds.has(String(record.id)),
      available: status === "active" && priceBrl > 0,
      creditAmount,
      recurrence: readString(metadata.billing_order_bump_recurrence) === "monthly" ? "monthly" : "one_time",
      badge: readString(metadata.billing_order_bump_badge)
        ?? (creditAmount && creditAmount > 0 ? "Creditos" : "Adicional"),
      highlightLabel: readHighlightLabel(metadata),
      media,
    };
  });
}

function serializeBump(bump: BillingCheckoutBump) {
  return {
    code: bump.code,
    platform_product_id: bump.platformProductId,
    title: bump.title,
    price_brl: bump.priceBrl,
    recurrence: bump.recurrence,
    item_type: bump.itemType,
    credit_amount: bump.creditAmount,
    highlight_label: bump.highlightLabel,
    media: bump.media,
  };
}

async function loadBillingOrderBumpSettings(client: SupabaseClient) {
  const { data, error } = await client
    .from("platform_billing_settings")
    .select("metadata")
    .eq("setting_key", "default")
    .maybeSingle<{ metadata: JsonRecord | null }>();

  if (error) {
    throw new Error(`Nao foi possivel carregar configuracao de order bump: ${error.message}`);
  }

  const metadata = data?.metadata ?? {};

  return {
    selectedProductIds: readUuidList(metadata.billing_order_bump_product_ids),
  };
}

function readOrderBumpCreditAmount(metadata: JsonRecord, name: string, description: string) {
  const explicit = toNumberOrNull(
    metadata.billing_credit_amount
    ?? metadata.order_bump_credit_amount
    ?? metadata.credit_amount,
  );

  if (explicit && explicit > 0) {
    return explicit;
  }

  const text = `${name} ${description}`.toLowerCase();

  if (!text.includes("credito") && !text.includes("creditos")) {
    return null;
  }

  const match = text.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:mil|k)?\s*credit/);
  if (!match) {
    const compact = text.match(/(\d+)\s*(?:mil|k)/);
    return compact ? Number(compact[1]) * 1000 : null;
  }

  const raw = match[1].replace(/[.\s]/g, "");
  const base = Number(raw);
  if (!Number.isFinite(base) || base <= 0) {
    return null;
  }

  return /(?:mil|k)\s*credit/.test(match[0]) && base < 1000 ? base * 1000 : base;
}

function readHighlightLabel(metadata: JsonRecord) {
  return readString(
    metadata.highlight_label
      ?? metadata.highlightLabel
      ?? metadata.product_highlight_label
      ?? metadata.productHighlightLabel,
  );
}

function readOrderBumpMedia(value: unknown): BillingCheckoutBumpMedia | null {
  const source = Array.isArray(value) ? value : [];

  for (const item of source) {
    const record = readRecord(item);
    if (!record) continue;

    const storageUrl = readString(record.storage_url ?? record.storageUrl);
    if (!storageUrl) continue;

    const fileName = readString(record.file_name ?? record.fileName) ?? "midia";
    const contentType = readString(record.content_type ?? record.contentType) ?? "";
    const kind = readOrderBumpMediaKind(record.kind, contentType, fileName);
    if (!kind) continue;

    return {
      fileName,
      contentType,
      storageUrl,
      kind,
    };
  }

  return null;
}

function readOrderBumpMediaKind(value: unknown, contentType: string, fileName: string): BillingCheckoutBumpMedia["kind"] | null {
  const explicit = readString(value);
  if (explicit === "image" || explicit === "video") return explicit;

  const lowerName = fileName.toLowerCase();
  const lowerType = contentType.toLowerCase();
  if (lowerType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(lowerName)) return "image";
  if (lowerType.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(lowerName)) return "video";

  return null;
}

function parseBrlPrice(value: string | null) {
  if (!value) {
    return 0;
  }

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? roundMoney(parsed) : 0;
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function readUuidList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item));
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumberOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import { createSalesCatalogPixPaymentSession } from "@/lib/sales-catalog/payment-sessions";
import { createPublicCheckoutIntentKey, findRecentPublicCheckoutSession } from "@/lib/sales-catalog/public-checkout-idempotency";
import { isSalesCatalogDisplayableProduct } from "@/lib/sales-catalog/shared";
import { validatePublicWriteRequest, type PublicWriteGuardResult } from "@/lib/security/public-request-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { appendLeadTrackingParams } from "@/lib/tracking/tracked-links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  metadata?: JsonRecord | null;
};

type SalesCatalogMemoryRow = {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type LeadRow = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  metadata: JsonRecord | null;
};

type PublicCartItem = {
  productId: string;
  quantity: number;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ storeSlug: string }> },
) {
  const guard = validatePublicWriteRequest({
    headers: request.headers,
    requestUrl: request.url,
    routeKey: "sales-catalog-store-checkout",
    maxPayloadBytes: 24 * 1024,
    rateLimit: {
      limit: 10,
      windowMs: 60_000,
    },
  });

  if (!guard.ok) {
    return publicGuardResponse(guard);
  }

  const { storeSlug } = await context.params;
  const body = readRecord(await request.json().catch(() => null));
  const client = createServiceClient();
  const organization = await loadOrganizationBySlug(client, storeSlug);

  if (!organization) {
    return NextResponse.json({ error: "Loja nao encontrada." }, { status: 404 });
  }

  const leadId = normalizeUuid(readString(body.leadId));
  const conversationId = normalizeUuid(readString(body.conversationId));
  const trackingLinkId = normalizeUuid(readString(body.trackingLinkId));
  const leadPhone = normalizePhone(readString(body.leadPhone));
  const lead = leadId ? await loadLead(client, organization.id, leadId) : null;
  const customerName = normalizeText(readString(body.customerName), 140)
    ?? readString(lead?.display_name)
    ?? null;
  const customerPhone = normalizePhone(readString(body.customerPhone))
    ?? normalizePhone(lead?.phone_number)
    ?? leadPhone;
  const customerEmail = normalizeEmail(readString(body.customerEmail))
    ?? normalizeEmail(readString(readRecord(lead?.metadata).email))
    ?? normalizeEmail(readString(readRecord(lead?.metadata).customer_email));
  const cartItems = readPublicCartItems(body.items);

  if (!customerName && !customerPhone) {
    return NextResponse.json({ error: "Informe seu nome ou WhatsApp para acompanhar o pedido." }, { status: 422 });
  }

  if (cartItems.length === 0) {
    return NextResponse.json({ error: "Adicione ao menos um produto na sacola." }, { status: 422 });
  }

  const productIds = cartItems.map((item) => item.productId);
  const { data: rows, error: rowsError } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", organization.id)
    .eq("memory_type", "sales_catalog_item")
    .in("id", productIds)
    .returns<SalesCatalogMemoryRow[]>();

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  const rowsById = new Map((rows ?? []).map((row) => [row.id, row]));
  const missingItems = productIds.filter((productId) => !rowsById.has(productId));

  if (missingItems.length > 0) {
    return NextResponse.json({ error: "Um ou mais produtos nao estao mais disponiveis nesta loja." }, { status: 422 });
  }

  const resolvedItems = cartItems.map((cartItem) => {
    const row = rowsById.get(cartItem.productId);

    if (!row) {
      throw new Error("Produto indisponivel.");
    }

    const item = mapSalesCatalogItem(row);

    if (!isSalesCatalogDisplayableProduct(item) || item.status !== "active" || item.salesDestination !== "connectyhub_checkout") {
      throw new Error(`O produto "${item.title}" nao esta disponivel para checkout online.`);
    }

    if (item.inventory.status === "out_of_stock" && !item.inventory.allowBackorder) {
      throw new Error(`O produto "${item.title}" esta esgotado no momento.`);
    }

    const price = normalizeCurrencyAmount(item.offer.salePrice) ?? normalizeCurrencyAmount(item.price);

    if (!price) {
      throw new Error(`O produto "${item.title}" ainda nao tem preco valido.`);
    }

    const unitPriceCents = Math.round(price * 100);
    const totalCents = unitPriceCents * cartItem.quantity;

    return {
      item,
      quantity: cartItem.quantity,
      unitPriceCents,
      totalCents,
    };
  });
  const hasPlatformItems = resolvedItems.some((entry) => Boolean(entry.item.platformProductId));
  const hasClientItems = resolvedItems.some((entry) => !entry.item.platformProductId);

  if (hasPlatformItems && hasClientItems) {
    return NextResponse.json({
      error: "Nao misture produtos proprios e produtos ConnectyHub no mesmo checkout. Crie pedidos separados.",
    }, { status: 422 });
  }

  const subtotalCents = resolvedItems.reduce((total, entry) => total + entry.totalCents, 0);
  const subtotal = formatMoneyCents(subtotalCents);
  const total = subtotal;
  const checkoutIntentKey = createPublicCheckoutIntentKey([
    "sales_catalog_public_store",
    organization.id,
    resolvedItems.map((entry) => ({
      productId: entry.item.id,
      quantity: entry.quantity,
      unitPriceCents: entry.unitPriceCents,
    })).sort((left, right) => left.productId.localeCompare(right.productId)),
    lead?.id ?? leadId,
    conversationId,
    customerPhone,
    trackingLinkId,
  ]);
  const existingCheckout = await findRecentPublicCheckoutSession({
    client,
    organizationId: organization.id,
    checkoutIntentKey,
  });

  if (existingCheckout) {
    return NextResponse.json({
      ok: true,
      reused: true,
      orderId: existingCheckout.orderId,
      sessionId: existingCheckout.sessionId,
      checkoutUrl: existingCheckout.checkoutUrl,
      trackingUrl: existingCheckout.trackingUrl ?? existingCheckout.checkoutUrl,
    });
  }

  const now = new Date().toISOString();
  const orderId = randomUUID();
  const firstItem = resolvedItems[0]?.item;
  const orderCommercialFlowType = hasPlatformItems ? firstItem?.commercialFlowType ?? "connectyhub_resale" : "client_direct";
  const orderRevenueOwnerType = hasPlatformItems ? firstItem?.revenueOwnerType ?? "connectyhub" : "client";
  const orderCommissionEligible = resolvedItems.some((entry) => entry.item.commissionEligible);

  const { error: orderError } = await client
    .from("sales_catalog_orders")
    .insert({
      id: orderId,
      organization_id: organization.id,
      lead_id: lead?.id ?? leadId,
      conversation_id: conversationId,
      source: "public_store_page",
      status: "pending_payment",
      payment_status: "pending",
      fulfillment_status: "pending",
      customer_name: customerName ?? "Cliente da loja",
      customer_phone: customerPhone,
      customer_email: customerEmail,
      subtotal,
      discount_total: null,
      shipping_total: null,
      total,
      payment_method: null,
      shipping_method: null,
      agent_notes: "Checkout iniciado pela loja publica.",
      internal_notes: null,
      commercial_flow_type: orderCommercialFlowType,
      revenue_owner_type: orderRevenueOwnerType,
      contains_platform_products: hasPlatformItems,
      commission_eligible: orderCommissionEligible,
      metadata: {
        created_from: "sales_catalog_public_store",
        source: "public_store_page",
        checkout_intent_key: checkoutIntentKey,
        cart_item_count: resolvedItems.length,
        cart_total_cents: subtotalCents,
        currency: "BRL",
        tracking_link_id: trackingLinkId,
        lead_phone: customerPhone,
        lead_name: customerName,
        commercial_flow_type: orderCommercialFlowType,
        revenue_owner_type: orderRevenueOwnerType,
        commission_eligible: orderCommissionEligible,
        platform_product_marketplace: hasPlatformItems,
      },
      created_by: null,
      created_at: now,
      updated_at: now,
    });

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  const itemPayload = resolvedItems.map((entry) => ({
    order_id: orderId,
    organization_id: organization.id,
    catalog_item_id: entry.item.id,
    sku_id: null,
    sku_code: null,
    title: entry.item.title,
    tag: entry.item.tag,
    quantity: entry.quantity,
    unit_price: formatMoneyCents(entry.unitPriceCents),
    sale_price: formatMoneyCents(entry.unitPriceCents),
    total: formatMoneyCents(entry.totalCents),
    product_origin_type: entry.item.productOriginType,
    commercial_flow_type: entry.item.commercialFlowType,
    revenue_owner_type: entry.item.revenueOwnerType,
    commission_eligible: entry.item.commissionEligible,
    platform_product_id: entry.item.platformProductId,
    attributes: entry.item.attributes.map((attribute) => ({
      id: attribute.id,
      name: attribute.name,
      values: attribute.values,
    })),
    fulfillment: {
      mode: entry.item.fulfillment.mode,
      scheduling_required: entry.item.fulfillment.schedulingRequired,
      service_duration: entry.item.fulfillment.serviceDuration,
      delivery_instructions: entry.item.fulfillment.deliveryInstructions,
      access_instructions: entry.item.fulfillment.accessInstructions,
    },
    metadata: {
      source: entry.item.source,
      category: entry.item.category,
      currency: entry.item.currency,
      stock_status: entry.item.inventory.status,
      platform_product_id: entry.item.platformProductId,
      platform_product_code: entry.item.platformProductCode,
      commercial_flow_type: entry.item.commercialFlowType,
      revenue_owner_type: entry.item.revenueOwnerType,
      commission_policy_type: entry.item.commissionPolicyType,
      commission_eligible: entry.item.commissionEligible,
      created_from: "sales_catalog_public_store",
    },
  }));
  const { error: itemError } = await client
    .from("sales_catalog_order_items")
    .insert(itemPayload);

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  const payment = await createSalesCatalogPixPaymentSession({
    client,
    organizationId: organization.id,
    orderId,
    amount: total,
    payerEmail: customerEmail,
    source: "checkout",
    actorId: null,
  });
  const checkoutUrl = appendLeadTrackingParams(payment.trackingUrl ?? payment.checkoutUrl, {
    leadId: lead?.id ?? leadId,
    leadPhone: customerPhone,
    conversationId,
    orderId,
    paymentSessionId: payment.session.id,
    trackingLinkId,
    trackingSource: "sales_catalog_store_checkout",
  });

  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: organization.id,
    source_type: "sales_catalog_order",
    source_id: orderId,
    event_type: "sales_catalog.checkout_created_from_store_page",
    title: "Checkout criado pela loja publica",
    summary: `${resolvedItems.length} item(ns) enviados para checkout publico da loja.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "checkout", "store_page", "lead_tracking"],
    payload: {
      order_id: orderId,
      payment_session_id: payment.session.id,
      checkout_url: payment.checkoutUrl,
      tracking_url: checkoutUrl,
      lead_id: lead?.id ?? leadId,
      conversation_id: conversationId,
      lead_phone: customerPhone,
      item_count: resolvedItems.length,
      total,
      gateway_unavailable: payment.gatewayUnavailable === true,
    },
  });

  return NextResponse.json({
    ok: true,
    orderId,
    sessionId: payment.session.id,
    checkoutUrl: payment.checkoutUrl,
    trackingUrl: checkoutUrl,
    gatewayUnavailable: payment.gatewayUnavailable === true,
    paymentDeferred: payment.paymentDeferred === true,
    paymentDeferredReason: payment.paymentDeferredReason ?? null,
  });
}

async function loadOrganizationBySlug(
  client: ReturnType<typeof createServiceClient>,
  storeSlug: string,
) {
  const decoded = decodeURIComponent(storeSlug).trim();
  const query = client
    .from("organizations")
    .select("id, name, slug, metadata");

  const { data } = normalizeUuid(decoded)
    ? await query.eq("id", decoded).maybeSingle<OrganizationRow>()
    : await query.eq("slug", decoded).maybeSingle<OrganizationRow>();

  return data ?? null;
}

async function loadLead(
  client: ReturnType<typeof createServiceClient>,
  organizationId: string,
  leadId: string,
) {
  const { data } = await client
    .from("leads")
    .select("id, display_name, phone_number, metadata")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle<LeadRow>();

  return data ?? null;
}

function readPublicCartItems(value: unknown): PublicCartItem[] {
  if (!Array.isArray(value)) return [];

  const byProductId = new Map<string, number>();

  for (const raw of value.slice(0, 40)) {
    const record = readRecord(raw);
    const productId = normalizeUuid(readString(record.productId));
    const quantity = normalizeQuantity(record.quantity);

    if (!productId || quantity <= 0) continue;

    byProductId.set(productId, Math.min(20, (byProductId.get(productId) ?? 0) + quantity));
  }

  return Array.from(byProductId.entries())
    .slice(0, 20)
    .map(([productId, quantity]) => ({ productId, quantity }));
}

function publicGuardResponse(guard: PublicWriteGuardResult) {
  if (guard.ok) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: guard.message },
    {
      status: guard.status,
      headers: guard.retryAfterSeconds ? { "Retry-After": String(guard.retryAfterSeconds) } : undefined,
    },
  );
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function normalizeText(value: string | null, maxLength: number) {
  return value?.replace(/\s+/g, " ").trim().slice(0, maxLength) || null;
}

function normalizeEmail(value: string | null) {
  const normalized = normalizeText(value, 160);

  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length >= 8 ? digits.slice(0, 18) : null;
}

function normalizeQuantity(value: unknown) {
  const quantity = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(quantity)) return 1;

  return Math.min(20, Math.max(1, Math.round(quantity)));
}

function formatMoneyCents(value: number) {
  return (Math.max(0, Math.round(value)) / 100).toFixed(2);
}

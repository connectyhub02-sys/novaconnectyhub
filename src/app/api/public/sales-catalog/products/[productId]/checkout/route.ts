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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  const guard = validatePublicWriteRequest({
    headers: request.headers,
    requestUrl: request.url,
    routeKey: "sales-catalog-product-checkout",
    maxPayloadBytes: 16 * 1024,
    rateLimit: {
      limit: 10,
      windowMs: 60_000,
    },
  });

  if (!guard.ok) {
    return publicGuardResponse(guard);
  }

  const { productId } = await context.params;
  const itemId = normalizeUuid(productId);

  if (!itemId) {
    return NextResponse.json({ error: "Produto invalido." }, { status: 404 });
  }

  const body = readRecord(await request.json().catch(() => null));
  const client = createServiceClient();
  const { data: row, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("id", itemId)
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_item")
    .maybeSingle<SalesCatalogMemoryRow>();

  if (error || !row?.organization_id) {
    return NextResponse.json({ error: "Produto nao encontrado." }, { status: 404 });
  }

  const item = mapSalesCatalogItem(row);

  if (!isSalesCatalogDisplayableProduct(item) || item.status !== "active" || item.salesDestination !== "connectyhub_checkout") {
    return NextResponse.json({ error: "Este produto nao esta disponivel para checkout online." }, { status: 422 });
  }

  if (item.billingCycle !== "one_time") {
    return NextResponse.json({ error: "Este produto usa cobranca recorrente e ainda nao esta disponivel neste checkout." }, { status: 422 });
  }

  if (item.inventory.status === "out_of_stock" && !item.inventory.allowBackorder) {
    return NextResponse.json({ error: "Este produto esta esgotado no momento." }, { status: 422 });
  }

  const amount = normalizeCurrencyAmount(item.offer.salePrice) ?? normalizeCurrencyAmount(item.price);

  if (!amount) {
    return NextResponse.json({ error: "Este produto ainda nao tem preco valido para checkout." }, { status: 422 });
  }

  const leadId = normalizeUuid(readString(body.leadId));
  const conversationId = normalizeUuid(readString(body.conversationId));
  const agentId = normalizeUuid(readString(body.agentId));
  const leadPhone = normalizePhone(readString(body.leadPhone));
  const trackingLinkId = normalizeUuid(readString(body.trackingLinkId));
  const quantity = normalizeQuantity(body.quantity);
  let lead = leadId ? await loadLead(client, row.organization_id, leadId) : null;

  if (!lead && leadPhone) {
    lead = await loadLeadByPhone(client, row.organization_id, leadPhone);
  }

  const customerPhone = normalizePhone(lead?.phone_number) ?? leadPhone;
  const customerName = readString(lead?.display_name) ?? "Lead WhatsApp";
  const customerEmail = readString(readRecord(lead?.metadata)?.email) ?? readString(readRecord(lead?.metadata)?.customer_email);
  const totalAmount = (amount * quantity).toFixed(2);
  const checkoutIntentKey = createPublicCheckoutIntentKey([
    "sales_catalog_public_product",
    row.organization_id,
    item.id,
    quantity,
    lead?.id ?? leadId,
    conversationId,
    customerPhone,
    agentId,
    trackingLinkId,
  ]);
  const existingCheckout = await findRecentPublicCheckoutSession({
    client,
    organizationId: row.organization_id,
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

  const { error: orderError } = await client
    .from("sales_catalog_orders")
    .insert({
      id: orderId,
      organization_id: row.organization_id,
      lead_id: lead?.id ?? leadId,
      conversation_id: conversationId,
      source: "public_product_page",
      status: "pending_payment",
      payment_status: "pending",
      fulfillment_status: item.fulfillment.schedulingRequired ? "scheduled" : "pending",
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      subtotal: totalAmount,
      discount_total: null,
      shipping_total: null,
      total: totalAmount,
      payment_method: null,
      shipping_method: null,
      agent_notes: "Checkout iniciado pela pagina publica do produto.",
      internal_notes: null,
      commercial_flow_type: item.commercialFlowType,
      revenue_owner_type: item.revenueOwnerType,
      contains_platform_products: Boolean(item.platformProductId),
      commission_eligible: item.commissionEligible,
      metadata: {
        created_from: "sales_catalog_public_product",
        catalog_item_id: item.id,
        catalog_item_tag: item.tag,
        agent_id: agentId,
        tracking_link_id: trackingLinkId,
        lead_phone: customerPhone,
        product_page_checkout: true,
        quantity,
        checkout_intent_key: checkoutIntentKey,
        currency: item.currency,
        category: item.category,
        billing_cycle: item.billingCycle,
        billing_interval: item.billingInterval,
        platform_product_id: item.platformProductId,
        platform_product_code: item.platformProductCode,
        commercial_flow_type: item.commercialFlowType,
        revenue_owner_type: item.revenueOwnerType,
        commission_policy_type: item.commissionPolicyType,
        commission_eligible: item.commissionEligible,
      },
      created_by: null,
      created_at: now,
      updated_at: now,
    });

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  const { error: itemError } = await client
    .from("sales_catalog_order_items")
    .insert({
      order_id: orderId,
      organization_id: row.organization_id,
      catalog_item_id: item.id,
      sku_id: null,
      sku_code: null,
      title: item.title,
      tag: item.tag,
      quantity,
      unit_price: item.price ?? amount,
      sale_price: item.offer.salePrice ?? item.price ?? amount,
      total: totalAmount,
      product_origin_type: item.productOriginType,
      commercial_flow_type: item.commercialFlowType,
      revenue_owner_type: item.revenueOwnerType,
      commission_eligible: item.commissionEligible,
      platform_product_id: item.platformProductId,
      attributes: item.attributes.map((attribute) => ({
        id: attribute.id,
        name: attribute.name,
        values: attribute.values,
      })),
      fulfillment: {
        mode: item.fulfillment.mode,
        scheduling_required: item.fulfillment.schedulingRequired,
        service_duration: item.fulfillment.serviceDuration,
        delivery_instructions: item.fulfillment.deliveryInstructions,
        access_instructions: item.fulfillment.accessInstructions,
      },
      metadata: {
        source: item.source,
        category: item.category,
        currency: item.currency,
        stock_status: item.inventory.status,
        billing_cycle: item.billingCycle,
        billing_interval: item.billingInterval,
        platform_product_id: item.platformProductId,
        platform_product_code: item.platformProductCode,
        commercial_flow_type: item.commercialFlowType,
        revenue_owner_type: item.revenueOwnerType,
        commission_policy_type: item.commissionPolicyType,
        commission_eligible: item.commissionEligible,
      },
    });

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  const payment = await createSalesCatalogPixPaymentSession({
    client,
    organizationId: row.organization_id,
    orderId,
    amount: totalAmount,
    payerEmail: customerEmail,
    source: "checkout",
    actorId: null,
  });
  const checkoutUrl = appendLeadTrackingParams(payment.trackingUrl ?? payment.checkoutUrl, {
    leadId: lead?.id ?? leadId,
    leadPhone: customerPhone,
    conversationId,
    agentId,
    orderId,
    paymentSessionId: payment.session.id,
    trackingLinkId,
    trackingSource: "sales_catalog_product_checkout",
  });

  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: row.organization_id,
    source_type: "sales_catalog_order",
    source_id: orderId,
    event_type: "sales_catalog.checkout_created_from_product_page",
    title: "Checkout criado pela pagina do produto",
    summary: `${item.title} enviado para checkout publico.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "checkout", "product_page", "lead_tracking"],
    payload: {
      order_id: orderId,
      product_id: item.id,
      payment_session_id: payment.session.id,
      checkout_url: payment.checkoutUrl,
      tracking_url: checkoutUrl,
      lead_id: lead?.id ?? leadId,
      conversation_id: conversationId,
      agent_id: agentId,
      lead_phone: customerPhone,
      quantity,
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

async function loadLeadByPhone(
  client: ReturnType<typeof createServiceClient>,
  organizationId: string,
  leadPhone: string,
) {
  const { data } = await client
    .from("leads")
    .select("id, display_name, phone_number, metadata")
    .eq("organization_id", organizationId)
    .eq("phone_number", leadPhone)
    .limit(1)
    .maybeSingle<LeadRow>();

  return data ?? null;
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

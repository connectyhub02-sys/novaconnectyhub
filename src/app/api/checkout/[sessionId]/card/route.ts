import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildMercadoPagoAdditionalInfo,
  buildMercadoPagoWebhookUrl,
  buildSalesCatalogCheckoutUrl,
  createMercadoPagoCardPayment,
  ensureMercadoPagoAccessToken,
  extractMercadoPagoPixData,
  loadMercadoPagoPlatformBillingConfig,
  normalizeCurrencyAmount,
} from "@/lib/sales-catalog/mercado-pago";
import { resolveSalesCatalogOrderPaymentOwner } from "@/lib/platform-product-sales";
import { handleSalesCatalogApprovedPayment } from "@/lib/sales-catalog/post-payment";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type PaymentSessionRow = {
  id: string;
  organization_id: string;
  order_id: string;
  integration_id: string | null;
  amount: string | number | null;
  currency: string | null;
  payer_email: string | null;
  payment_owner_type?: string | null;
  commercial_flow_type?: string | null;
  revenue_owner_type?: string | null;
  commission_context?: JsonRecord | null;
  metadata: JsonRecord | null;
};

type OrderRow = {
  id: string;
  customer_name: string | null;
  customer_document: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  destination_cep: string | null;
  shipping_total: string | null;
  shipping_method: string | null;
  total: string | null;
  subtotal: string | null;
  metadata: JsonRecord | null;
};

type OrderItemRow = {
  id: string;
  title: string;
  quantity: number | null;
  unit_price: string | null;
  sale_price: string | null;
  total: string | null;
  sku_code: string | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const body = readRecord(await request.json().catch(() => null)) ?? {};
  const formData = readRecord(body.formData) ?? body;
  const client = createServiceClient();
  const { data: sourceSession, error: sessionError } = await client
    .from("sales_catalog_payment_sessions")
    .select("id, organization_id, order_id, integration_id, amount, currency, payer_email, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata")
    .eq("id", sessionId)
    .maybeSingle<PaymentSessionRow>();

  if (sessionError || !sourceSession) {
    return NextResponse.json({ error: "Sessao de pagamento nao encontrada." }, { status: 404 });
  }

  const token = readString(formData.token);
  const paymentMethodId = readString(formData.payment_method_id);
  const installments = normalizeInstallments(formData.installments);
  const payer = readRecord(formData.payer);
  const payerIdentification = readRecord(payer?.identification);
  const payerEmail = normalizeEmail(readString(payer?.email) ?? sourceSession.payer_email);
  const deviceSessionId = readString(body.deviceSessionId)
    ?? readString(body.device_id)
    ?? readString(body.MP_DEVICE_SESSION_ID)
    ?? readString(request.headers.get("x-meli-session-id"));
  const frontendAmount = normalizeCurrencyAmount(readString(formData.transaction_amount) ?? readNumber(formData.transaction_amount));
  const sessionAmount = normalizeCurrencyAmount(sourceSession.amount);
  const amount = sessionAmount ?? frontendAmount;

  if (!token || !paymentMethodId || !amount || !payerEmail) {
    return NextResponse.json({ error: "Dados de cartao incompletos." }, { status: 400 });
  }

  if (frontendAmount && Math.abs(frontendAmount - amount) > 0.009) {
    return NextResponse.json({ error: "Valor recebido nao confere com a sessao." }, { status: 400 });
  }

  const { data: order, error: orderError } = await client
    .from("sales_catalog_orders")
    .select("id, customer_name, customer_document, customer_email, customer_phone, destination_cep, shipping_total, shipping_method, total, subtotal, metadata")
    .eq("id", sourceSession.order_id)
    .eq("organization_id", sourceSession.organization_id)
    .maybeSingle<OrderRow>();

  if (orderError || !order) {
    return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
  }

  const { data: itemRows } = await client
    .from("sales_catalog_order_items")
    .select("id, title, quantity, unit_price, sale_price, total, sku_code")
    .eq("order_id", order.id)
    .eq("organization_id", sourceSession.organization_id)
    .order("created_at", { ascending: true });
  const items = (itemRows ?? []) as OrderItemRow[];
  let cardSessionId: string | null = null;

  try {
    const sourceMetadata = readRecord(sourceSession.metadata) ?? {};
    const resolvedOwner = await resolveSalesCatalogOrderPaymentOwner({
      client,
      organizationId: sourceSession.organization_id,
      orderId: order.id,
    });
    const sourceOwner = readString(sourceMetadata.payment_owner);
    const connectyHubOwned = sourceOwner === "connectyhub" || (!sourceOwner && resolvedOwner.owner === "connectyhub");
    const platformProductIds = readStringList(sourceMetadata.platform_product_ids, resolvedOwner.platformProductIds);
    const platformCatalogItemIds = readStringList(sourceMetadata.platform_catalog_item_ids, resolvedOwner.catalogItemIds);
    const commercialFlowType = normalizeCommercialFlowType(readString(sourceSession.commercial_flow_type)
      ?? readString(sourceMetadata.commercial_flow_type)
      ?? resolvedOwner.commercialFlowType);
    const revenueOwnerType = normalizeRevenueOwnerType(readString(sourceSession.revenue_owner_type)
      ?? readString(sourceMetadata.revenue_owner_type)
      ?? resolvedOwner.revenueOwnerType);
    const commissionEligible = readBoolean(sourceMetadata.commission_eligible) ?? resolvedOwner.commissionEligible;
    const integration = connectyHubOwned
      ? null
      : await ensureMercadoPagoAccessToken({
          client,
          organizationId: sourceSession.organization_id,
        });
    const platformBilling = connectyHubOwned
      ? await loadMercadoPagoPlatformBillingConfig({ client })
      : null;
    const accessToken = platformBilling?.accessToken ?? integration?.accessToken;

    if (!accessToken) {
      throw new Error("Nao foi possivel localizar a conta Mercado Pago para este pagamento.");
    }

    cardSessionId = randomUUID();
    const idempotencyKey = randomUUID();
    const externalReference = `sales_catalog_order:${order.id}:${cardSessionId}`;
    const checkoutUrl = buildSalesCatalogCheckoutUrl(cardSessionId);
    const description = buildCardPaymentDescription(items, order.id);
    const additionalInfo = buildMercadoPagoAdditionalInfo({
      payerName: order.customer_name,
      payerPhone: order.customer_phone,
      payerZipCode: order.destination_cep,
      shippingTotal: order.shipping_total,
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        skuCode: item.sku_code,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        salePrice: item.sale_price,
        total: item.total,
      })),
    });
    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await client
      .from("sales_catalog_payment_sessions")
      .insert({
        id: cardSessionId,
        organization_id: sourceSession.organization_id,
        order_id: order.id,
        integration_id: integration?.id ?? null,
        provider: "mercado_pago",
        method: "card",
        status: "created",
        amount,
        currency: sourceSession.currency ?? "BRL",
        payment_owner_type: connectyHubOwned ? "connectyhub" : "client",
        commercial_flow_type: commercialFlowType,
        revenue_owner_type: revenueOwnerType,
        commission_context: {
          ...(readRecord(sourceSession.commission_context) ?? {}),
          eligible: commissionEligible,
          platform_product_ids: platformProductIds,
          catalog_item_ids: platformCatalogItemIds,
        },
        payer_email: payerEmail,
        checkout_url: checkoutUrl,
        idempotency_key: idempotencyKey,
        external_reference: externalReference,
        metadata: {
          created_from: "checkout_card_brick",
          source_payment_session_id: sourceSession.id,
          payment_method_id: paymentMethodId,
          installments,
          mercado_pago_device_session_sent: Boolean(deviceSessionId),
          payment_owner: connectyHubOwned ? "connectyhub" : "seller",
          commercial_flow_type: commercialFlowType,
          revenue_owner_type: revenueOwnerType,
          commission_eligible: commissionEligible,
          payment_receiver: connectyHubOwned ? "connectyhub" : "seller",
          platform_product_marketplace: connectyHubOwned,
          platform_product_ids: platformProductIds,
          platform_catalog_item_ids: platformCatalogItemIds,
        },
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? "Nao foi possivel iniciar a sessao de cartao.");
    }

    const payment = await createMercadoPagoCardPayment({
      accessToken,
      amount,
      description,
      externalReference,
      payerEmail,
      token,
      paymentMethodId,
      installments,
      issuerId: readString(formData.issuer_id) ?? readNumber(formData.issuer_id),
      payerName: order.customer_name,
      payerPhone: order.customer_phone,
      payerDocument: order.customer_document,
      payerZipCode: order.destination_cep,
      payerIdentification: {
        type: readString(payerIdentification?.type),
        number: readString(payerIdentification?.number),
      },
      notificationUrl: buildMercadoPagoWebhookUrl(),
      idempotencyKey,
      deviceSessionId,
      additionalInfo,
    });
    const paymentData = extractMercadoPagoPixData(payment.payment);

    await client
      .from("sales_catalog_payment_sessions")
      .update({
        status: paymentData.status,
        provider_payment_id: paymentData.providerPaymentId,
        provider_status: paymentData.providerStatus,
        provider_status_detail: paymentData.providerStatusDetail,
        paid_at: paymentData.paidAt,
        failure_reason: null,
        metadata: {
          created_from: "checkout_card_brick",
          source_payment_session_id: sourceSession.id,
          payment_method_id: paymentMethodId,
          installments,
          mercado_pago_device_session_sent: Boolean(deviceSessionId),
          payment_owner: connectyHubOwned ? "connectyhub" : "seller",
          commercial_flow_type: commercialFlowType,
          revenue_owner_type: revenueOwnerType,
          commission_eligible: commissionEligible,
          payment_receiver: connectyHubOwned ? "connectyhub" : "seller",
          platform_product_marketplace: connectyHubOwned,
          platform_product_ids: platformProductIds,
          platform_catalog_item_ids: platformCatalogItemIds,
          mercado_pago_payment_id: paymentData.providerPaymentId,
          mercado_pago_status: paymentData.providerStatus,
        },
      })
      .eq("id", cardSessionId)
      .eq("organization_id", sourceSession.organization_id);

    await client
      .from("sales_catalog_orders")
      .update(buildOrderPatch(paymentData.status, cardSessionId, paymentData.providerPaymentId, readRecord(order.metadata) ?? {}, {
        commercialFlowType,
        revenueOwnerType,
        containsPlatformProducts: connectyHubOwned,
        commissionEligible,
      }))
      .eq("id", order.id)
      .eq("organization_id", sourceSession.organization_id);

    const postPayment = paymentData.status === "approved"
      ? await handleSalesCatalogApprovedPayment({
          client,
          organizationId: sourceSession.organization_id,
          orderId: order.id,
          paymentSessionId: cardSessionId,
          providerPaymentId: paymentData.providerPaymentId,
          paymentMethodLabel: "Cartao Mercado Pago",
          source: "checkout_card",
        })
      : null;

    await client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: sourceSession.organization_id,
      source_type: "sales_catalog_payment_session",
      source_id: cardSessionId,
      event_type: "sales_catalog.card_payment_processed",
      title: "Pagamento com cartao processado",
      summary: `Pagamento ${paymentData.providerPaymentId ?? cardSessionId.slice(0, 8)} atualizado para ${paymentData.providerStatus ?? paymentData.status}.`,
      confidence: 1,
      visibility: "organization",
      tags: ["sales_catalog", "payment", "mercado_pago", "card", "checkout"],
      payload: {
        order_id: order.id,
        payment_session_id: cardSessionId,
        source_payment_session_id: sourceSession.id,
        provider_payment_id: paymentData.providerPaymentId,
        provider_status: paymentData.providerStatus,
        status: paymentData.status,
        payment_owner: connectyHubOwned ? "connectyhub" : "seller",
        commercial_flow_type: commercialFlowType,
        revenue_owner_type: revenueOwnerType,
        commission_eligible: commissionEligible,
        post_payment: postPayment,
      },
    });

    revalidatePath(`/checkout/${sourceSession.id}`);
    revalidatePath(`/checkout/${cardSessionId}`);
    revalidatePath("/dashboard/links");

    return NextResponse.json({
      ok: true,
      sessionId: cardSessionId,
      checkoutUrl,
      status: paymentData.status,
      providerStatus: paymentData.providerStatus,
      providerStatusDetail: paymentData.providerStatusDetail,
    });
  } catch (error) {
    if (cardSessionId) {
      await client
        .from("sales_catalog_payment_sessions")
        .update({
          status: "error",
          failure_reason: error instanceof Error ? error.message : "Nao foi possivel processar o cartao.",
        })
        .eq("id", cardSessionId)
        .eq("organization_id", sourceSession.organization_id);
    }

    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel processar o cartao.",
    }, { status: 400 });
  }
}

function buildCardPaymentDescription(items: OrderItemRow[], orderId: string) {
  const titles = items.length > 0
    ? items.slice(0, 4).map((item) => {
        const quantity = item.quantity ?? 1;
        const sku = item.sku_code ? ` ${item.sku_code}` : "";
        return `${quantity}x ${item.title}${sku}`;
      })
    : [`Pedido ${orderId.slice(0, 8)}`];

  return titles.join(", ").slice(0, 220);
}

function buildOrderPatch(
  status: "created" | "pending" | "approved" | "rejected" | "cancelled" | "expired" | "refunded" | "error",
  sessionId: string,
  providerPaymentId: string | null,
  currentMetadata: JsonRecord,
  ownerContext: {
    commercialFlowType: string;
    revenueOwnerType: string;
    containsPlatformProducts: boolean;
    commissionEligible: boolean;
  },
) {
  if (status === "approved") {
    return {
      latest_payment_session_id: sessionId,
      status: "paid",
      payment_status: "confirmed",
      payment_method: "Cartao Mercado Pago",
      commercial_flow_type: ownerContext.commercialFlowType,
      revenue_owner_type: ownerContext.revenueOwnerType,
      contains_platform_products: ownerContext.containsPlatformProducts,
      commission_eligible: ownerContext.commissionEligible,
      metadata: {
        ...currentMetadata,
        payment_gateway_confirmed_at: new Date().toISOString(),
        latest_payment_session_id: sessionId,
        latest_provider_payment_id: providerPaymentId,
        latest_commercial_flow_type: ownerContext.commercialFlowType,
        latest_revenue_owner_type: ownerContext.revenueOwnerType,
        latest_commission_eligible: ownerContext.commissionEligible,
      },
    };
  }

  if (status === "rejected" || status === "cancelled" || status === "expired" || status === "error") {
    return {
      latest_payment_session_id: sessionId,
      payment_status: "failed",
      payment_method: "Cartao Mercado Pago",
      commercial_flow_type: ownerContext.commercialFlowType,
      revenue_owner_type: ownerContext.revenueOwnerType,
      contains_platform_products: ownerContext.containsPlatformProducts,
      commission_eligible: ownerContext.commissionEligible,
      metadata: {
        ...currentMetadata,
        payment_gateway_failed_at: new Date().toISOString(),
        latest_payment_session_id: sessionId,
        latest_provider_payment_id: providerPaymentId,
        latest_commercial_flow_type: ownerContext.commercialFlowType,
        latest_revenue_owner_type: ownerContext.revenueOwnerType,
        latest_commission_eligible: ownerContext.commissionEligible,
      },
    };
  }

  return {
    latest_payment_session_id: sessionId,
    status: "pending_payment",
    payment_status: "pending",
    payment_method: "Cartao Mercado Pago",
    commercial_flow_type: ownerContext.commercialFlowType,
    revenue_owner_type: ownerContext.revenueOwnerType,
    contains_platform_products: ownerContext.containsPlatformProducts,
    commission_eligible: ownerContext.commissionEligible,
    metadata: {
      ...currentMetadata,
      latest_payment_session_id: sessionId,
      latest_provider_payment_id: providerPaymentId,
      latest_commercial_flow_type: ownerContext.commercialFlowType,
      latest_revenue_owner_type: ownerContext.revenueOwnerType,
      latest_commission_eligible: ownerContext.commissionEligible,
    },
  };
}

function normalizeInstallments(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? "1"), 10);

  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 36) : 1;
}

function normalizeEmail(value: string | null) {
  const email = value?.trim().toLowerCase();

  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeCommercialFlowType(value: string | null) {
  if (value === "connectyhub_resale" || value === "connectyhub_direct" || value === "external_marketplace") return value;
  return "client_direct";
}

function normalizeRevenueOwnerType(value: string | null) {
  if (value === "connectyhub" || value === "split" || value === "external_provider") return value;
  return "client";
}

function readStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;

  return value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));
}

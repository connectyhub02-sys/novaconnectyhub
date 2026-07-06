import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapSalesCatalogPaymentSession,
  type SalesCatalogPaymentSessionRow,
} from "@/lib/client-os/sales-catalog";
import {
  buildMercadoPagoWebhookUrl,
  buildSalesCatalogCheckoutUrl,
  createMercadoPagoPixPayment,
  ensureMercadoPagoAccessToken,
  extractMercadoPagoPixData,
  normalizeCurrencyAmount,
} from "./mercado-pago";

type JsonRecord = Record<string, unknown>;

type OrderRow = {
  id: string;
  organization_id: string;
  customer_name: string | null;
  customer_document: string | null;
  customer_email: string | null;
  destination_cep: string | null;
  subtotal: string | null;
  shipping_total: string | null;
  total: string | null;
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

export async function createSalesCatalogPixPaymentSession(input: {
  client: SupabaseClient;
  organizationId: string;
  orderId: string;
  amount?: string | number | null;
  payerEmail?: string | null;
  source: "dashboard" | "whatsapp_agent" | "checkout";
  actorId?: string | null;
}) {
  const { data: order, error: orderError } = await input.client
    .from("sales_catalog_orders")
    .select("id, organization_id, customer_name, customer_document, customer_email, destination_cep, subtotal, shipping_total, total, metadata")
    .eq("id", input.orderId)
    .eq("organization_id", input.organizationId)
    .maybeSingle<OrderRow>();

  if (orderError) {
    throw new Error(`Nao foi possivel carregar o pedido para pagamento: ${orderError.message}`);
  }

  if (!order) {
    throw new Error("Pedido nao encontrado para gerar pagamento.");
  }

  const { data: itemRows } = await input.client
    .from("sales_catalog_order_items")
    .select("id, title, quantity, unit_price, sale_price, total, sku_code")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });
  const items = (itemRows ?? []) as OrderItemRow[];
  const amount = normalizeCurrencyAmount(input.amount)
    ?? normalizeCurrencyAmount(order.total)
    ?? normalizeCurrencyAmount(order.subtotal);

  if (!amount) {
    throw new Error("Informe o total do pedido antes de gerar Pix.");
  }

  const integration = await ensureMercadoPagoAccessToken({
    client: input.client,
    organizationId: input.organizationId,
  });
  const sessionId = randomUUID();
  const idempotencyKey = randomUUID();
  const externalReference = `sales_catalog_order:${order.id}:${sessionId}`;
  const checkoutUrl = buildSalesCatalogCheckoutUrl(sessionId);
  const payerEmail = normalizePayerEmail(input.payerEmail ?? order.customer_email, order.id);
  const description = buildPaymentDescription(items, order.id);
  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await input.client
    .from("sales_catalog_payment_sessions")
    .insert({
      id: sessionId,
      organization_id: input.organizationId,
      order_id: order.id,
      integration_id: integration.id,
      provider: "mercado_pago",
      method: "pix",
      status: "created",
      amount,
      currency: "BRL",
      payer_email: payerEmail,
      checkout_url: checkoutUrl,
      idempotency_key: idempotencyKey,
      external_reference: externalReference,
      metadata: {
        created_from: input.source,
        actor_id: input.actorId ?? null,
        order_item_count: items.length,
      },
      created_at: now,
      updated_at: now,
    })
    .select("id, organization_id, order_id, integration_id, provider, method, status, amount, currency, payer_email, provider_payment_id, provider_status, provider_status_detail, checkout_url, pix_qr_code, pix_qr_code_base64, pix_ticket_url, external_reference, expires_at, paid_at, failure_reason, metadata, created_at, updated_at")
    .single<SalesCatalogPaymentSessionRow>();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Nao foi possivel iniciar a sessao de pagamento.");
  }

  try {
    const pix = await createMercadoPagoPixPayment({
      accessToken: integration.accessToken,
      amount,
      description,
      externalReference,
      payerEmail,
      payerName: order.customer_name,
      payerDocument: order.customer_document,
      payerZipCode: order.destination_cep,
      notificationUrl: buildMercadoPagoWebhookUrl(),
      idempotencyKey,
    });
    const pixData = extractMercadoPagoPixData(pix.payment);
    const { data: updated, error: updateError } = await input.client
      .from("sales_catalog_payment_sessions")
      .update({
        status: pixData.status,
        provider_payment_id: pixData.providerPaymentId,
        provider_status: pixData.providerStatus,
        provider_status_detail: pixData.providerStatusDetail,
        pix_qr_code: pixData.pixQrCode,
        pix_qr_code_base64: pixData.pixQrCodeBase64,
        pix_ticket_url: pixData.pixTicketUrl,
        paid_at: pixData.paidAt,
        metadata: {
          ...readRecord(inserted.metadata),
          mercado_pago_payment_id: pixData.providerPaymentId,
          mercado_pago_status: pixData.providerStatus,
        },
      })
      .eq("id", sessionId)
      .eq("organization_id", input.organizationId)
      .select("id, organization_id, order_id, integration_id, provider, method, status, amount, currency, payer_email, provider_payment_id, provider_status, provider_status_detail, checkout_url, pix_qr_code, pix_qr_code_base64, pix_ticket_url, external_reference, expires_at, paid_at, failure_reason, metadata, created_at, updated_at")
      .single<SalesCatalogPaymentSessionRow>();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Pix gerado, mas nao foi possivel atualizar a sessao.");
    }

    await input.client
      .from("sales_catalog_orders")
      .update({
        latest_payment_session_id: sessionId,
        payment_method: "Pix Mercado Pago",
        payment_status: pixData.status === "approved" ? "confirmed" : "pending",
        status: pixData.status === "approved" ? "paid" : "pending_payment",
        metadata: {
          ...readRecord(order.metadata),
          latest_checkout_url: checkoutUrl,
          latest_payment_session_id: sessionId,
          latest_payment_provider: "mercado_pago",
          latest_payment_method: "pix",
          latest_provider_payment_id: pixData.providerPaymentId,
        },
      })
      .eq("id", order.id)
      .eq("organization_id", input.organizationId);

    await input.client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: input.organizationId,
      source_type: "sales_catalog_payment_session",
      source_id: sessionId,
      event_type: "sales_catalog.payment_session_created",
      title: "Pix Mercado Pago gerado",
      summary: `Sessao de pagamento criada para pedido ${order.id.slice(0, 8)}.`,
      confidence: 1,
      visibility: "organization",
      tags: ["sales_catalog", "sales_catalog_order", "payment", "mercado_pago", "whatsapp_agent"],
      payload: {
        order_id: order.id,
        payment_session_id: sessionId,
        provider_payment_id: pixData.providerPaymentId,
        checkout_url: checkoutUrl,
        amount,
        source: input.source,
      },
    });

    return {
      session: mapSalesCatalogPaymentSession(updated),
      checkoutUrl,
      pixQrCode: pixData.pixQrCode,
      pixTicketUrl: pixData.pixTicketUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar Pix Mercado Pago.";

    await input.client
      .from("sales_catalog_payment_sessions")
      .update({
        status: "error",
        failure_reason: message,
      })
      .eq("id", sessionId)
      .eq("organization_id", input.organizationId);

    throw error;
  }
}

function buildPaymentDescription(items: OrderItemRow[], orderId: string) {
  const titles = items.length > 0
    ? items.slice(0, 4).map((item) => {
        const quantity = item.quantity ?? 1;
        const sku = item.sku_code ? ` ${item.sku_code}` : "";
        return `${quantity}x ${item.title}${sku}`;
      })
    : [`Pedido ${orderId.slice(0, 8)}`];

  return titles.join(", ").slice(0, 220);
}

function normalizePayerEmail(email: string | null | undefined, orderId: string) {
  const normalized = email?.trim().toLowerCase();
  if (normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return normalized;
  }

  const fallback = process.env.MERCADO_PAGO_DEFAULT_PAYER_EMAIL?.trim();
  if (fallback && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fallback)) {
    return fallback.toLowerCase();
  }

  return `checkout+${orderId.replace(/-/g, "").slice(0, 18)}@connectyhub.com.br`;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

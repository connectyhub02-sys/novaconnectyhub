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
import {
  buildPagBankWebhookUrl,
  createPagBankCardOrder,
  ensurePagBankAccessToken,
  extractPagBankCardData,
  loadPagBankPlatformBillingConfig,
  type PagBankCardPaymentData,
  type PagBankCardPaymentMethodType,
} from "@/lib/sales-catalog/pagbank";
import { getOrganizationSalesCatalogSettings } from "@/lib/client-os/sales-catalog";
import { resolveSalesCatalogOrderPaymentOwner } from "@/lib/platform-product-sales";
import { applySalesCatalogCheckoutOrderBumps } from "@/lib/sales-catalog/checkout-order-bumps";
import { requiresSalesCatalogShippingBeforePayment } from "@/lib/sales-catalog/checkout-guards";
import { handleSalesCatalogPaymentStatusChange } from "@/lib/sales-catalog/post-payment";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type PaymentSessionRow = {
  id: string;
  organization_id: string;
  order_id: string;
  integration_id: string | null;
  provider: string | null;
  status: string | null;
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
  lead_id: string | null;
  conversation_id: string | null;
  status: string | null;
  payment_status: string | null;
  customer_name: string | null;
  customer_document: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  destination_cep: string | null;
  destination_address: string | null;
  shipping_total: string | null;
  shipping_method: string | null;
  total: string | null;
  subtotal: string | null;
  latest_payment_session_id: string | null;
  metadata: JsonRecord | null;
};

type OrderItemRow = {
  id: string;
  title: string;
  quantity: number | null;
  unit_price: string | number | null;
  sale_price: string | number | null;
  total: string | number | null;
  sku_code: string | null;
  fulfillment?: unknown;
  metadata?: JsonRecord | null;
};

type ActiveCardSessionRow = {
  id: string;
  checkout_url: string | null;
  status: string | null;
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
    .select("id, organization_id, order_id, integration_id, provider, status, amount, currency, payer_email, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata")
    .eq("id", sessionId)
    .maybeSingle<PaymentSessionRow>();

  if (sessionError || !sourceSession) {
    return NextResponse.json({ error: "Sessao de pagamento nao encontrada." }, { status: 404 });
  }

  if (isFinalPaymentSessionStatus(sourceSession.status)) {
    return NextResponse.json({ error: "Este pagamento ja foi finalizado." }, { status: 400 });
  }

  if (sourceSession.provider === "pagbank") {
    return processPagBankPublicCardPayment({
      request,
      body,
      formData,
      client,
      sourceSession,
    });
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
  const selectedOrderBumpIds = readStringList(body.selectedOrderBumpIds, []);
  const frontendAmount = normalizeCurrencyAmount(readString(formData.transaction_amount) ?? readNumber(formData.transaction_amount));
  const sessionAmount = normalizeCurrencyAmount(sourceSession.amount);

  if (!token || !paymentMethodId || !payerEmail) {
    return NextResponse.json({ error: "Dados de cartao incompletos." }, { status: 400 });
  }

  const { data: order, error: orderError } = await client
    .from("sales_catalog_orders")
    .select("id, lead_id, conversation_id, status, payment_status, customer_name, customer_document, customer_email, customer_phone, destination_cep, destination_address, shipping_total, shipping_method, total, subtotal, latest_payment_session_id, metadata")
    .eq("id", sourceSession.order_id)
    .eq("organization_id", sourceSession.organization_id)
    .maybeSingle<OrderRow>();

  if (orderError || !order) {
    return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
  }

  if (isClosedOrder(order)) {
    return NextResponse.json({ error: "Este pedido ja foi finalizado." }, { status: 400 });
  }

  const { data: itemRows } = await client
    .from("sales_catalog_order_items")
    .select("id, title, quantity, unit_price, sale_price, total, sku_code, fulfillment, metadata")
    .eq("order_id", order.id)
    .eq("organization_id", sourceSession.organization_id)
    .order("created_at", { ascending: true });
  let items = (itemRows ?? []) as OrderItemRow[];
  let cardSessionId: string | null = null;

  try {
    const activeCardSession = await findActiveCardSession({
      client,
      organizationId: sourceSession.organization_id,
      orderId: order.id,
    });

    if (activeCardSession) {
      return NextResponse.json({
        error: "Ja existe uma tentativa de cartao em processamento para este pedido.",
        sessionId: activeCardSession.id,
        checkoutUrl: activeCardSession.checkout_url,
      }, { status: 409 });
    }

    const orderBumpApplication = await applySalesCatalogCheckoutOrderBumps({
      client,
      organizationId: sourceSession.organization_id,
      orderId: order.id,
      selectedProductIds: selectedOrderBumpIds,
    });
    items = orderBumpApplication.items.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      sale_price: item.sale_price,
      total: item.total,
      sku_code: item.sku_code,
      fulfillment: item.fulfillment,
    }));

    if (requiresSalesCatalogShippingBeforePayment(orderBumpApplication.order, items)) {
      return NextResponse.json({
        error: "Confirme frete, retirada ou entrega antes de pagar este pedido.",
      }, { status: 400 });
    }

    const amount = orderBumpApplication.totalAmount
      ?? sessionAmount
      ?? frontendAmount
      ?? normalizeCurrencyAmount(order.total)
      ?? normalizeCurrencyAmount(order.subtotal);

    if (!amount) {
      return NextResponse.json({ error: "Informe o total do pedido antes de pagar." }, { status: 400 });
    }

    if (frontendAmount && Math.abs(frontendAmount - amount) > 0.009) {
      return NextResponse.json({ error: "Valor recebido nao confere com o pedido atualizado." }, { status: 400 });
    }

    const sourceMetadata = readRecord(sourceSession.metadata) ?? {};
    const orderMetadata = readRecord(order.metadata) ?? {};
    const checkoutAgentId = resolveCheckoutAgentId(sourceMetadata, orderMetadata);
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
          agent_id: checkoutAgentId,
          selected_order_bump_product_ids: selectedOrderBumpIds,
          applied_order_bump_product_ids: orderBumpApplication.appliedBumps.map((item) => item.productId),
          added_order_bump_product_ids: orderBumpApplication.addedBumps.map((item) => item.productId),
          payment_method_id: paymentMethodId,
          installments,
          mercado_pago_device_session_sent: Boolean(deviceSessionId),
          mercado_pago_three_d_secure_mode: "optional",
          mercado_pago_three_ds_challenge_required: false,
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
          agent_id: checkoutAgentId,
          payment_method_id: paymentMethodId,
          installments,
          mercado_pago_device_session_sent: Boolean(deviceSessionId),
          mercado_pago_three_d_secure_mode: "optional",
          mercado_pago_three_ds_challenge_required: Boolean(paymentData.threeDSChallenge),
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
      .update(buildOrderPatch(paymentData.status, cardSessionId, paymentData.providerPaymentId, readRecord(orderBumpApplication.order.metadata) ?? readRecord(order.metadata) ?? {}, {
        commercialFlowType,
        revenueOwnerType,
        containsPlatformProducts: connectyHubOwned,
        commissionEligible,
      }))
      .eq("id", order.id)
      .eq("organization_id", sourceSession.organization_id);

    const postPayment = await handleSalesCatalogPaymentStatusChange({
      client,
      organizationId: sourceSession.organization_id,
      orderId: order.id,
      paymentSessionId: cardSessionId,
      providerPaymentId: paymentData.providerPaymentId,
      paymentMethodLabel: "Cartao Mercado Pago",
      status: paymentData.status,
      source: "checkout_card",
    });

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
      tags: ["sales_catalog", "payment", "mercado_pago", "card", "checkout", "lead_tracking"],
      payload: {
        order_id: order.id,
        payment_session_id: cardSessionId,
        source_payment_session_id: sourceSession.id,
        provider_payment_id: paymentData.providerPaymentId,
        provider_status: paymentData.providerStatus,
        status: paymentData.status,
        payment_method: "card",
        payment_method_label: "Cartao Mercado Pago",
        lead_id: order.lead_id,
        conversation_id: order.conversation_id,
        agent_id: checkoutAgentId,
        lead_phone: order.customer_phone,
        items: summarizePaymentItems(items),
        selected_order_bump_product_ids: selectedOrderBumpIds,
        applied_order_bump_product_ids: orderBumpApplication.appliedBumps.map((item) => item.productId),
        added_order_bump_product_ids: orderBumpApplication.addedBumps.map((item) => item.productId),
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
      threeDSChallenge: paymentData.threeDSChallenge,
      deviceSessionSent: Boolean(deviceSessionId),
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

async function processPagBankPublicCardPayment(input: {
  request: NextRequest;
  body: JsonRecord;
  formData: JsonRecord;
  client: ReturnType<typeof createServiceClient>;
  sourceSession: PaymentSessionRow;
}) {
  const { body, client, formData, sourceSession } = input;
  const encryptedCard = readString(formData.encrypted_card) ?? readString(formData.encryptedCard);
  const securityCode = readString(formData.security_code) ?? readString(formData.securityCode);
  const holderName = readString(formData.holder_name) ?? readString(formData.holderName);
  const holderTaxId = readString(formData.holder_tax_id)?.replace(/\D/g, "")
    ?? readString(formData.holderTaxId)?.replace(/\D/g, "")
    ?? null;
  const paymentMethodType = normalizePagBankCardPaymentMethodType(formData.payment_method_type);
  const installments = normalizePagBankInstallments(formData.installments);
  const payer = readRecord(formData.payer) ?? {};
  const payerIdentification = readRecord(payer.identification) ?? {};
  const payerEmail = normalizeEmail(readString(payer.email) ?? sourceSession.payer_email);
  const payerPhone = readString(payer.phone);
  const selectedOrderBumpIds = readStringList(body.selectedOrderBumpIds, []);
  const frontendAmount = normalizeCurrencyAmount(readString(formData.transaction_amount) ?? readNumber(formData.transaction_amount));
  const sessionAmount = normalizeCurrencyAmount(sourceSession.amount);

  if (!encryptedCard || !securityCode || !payerEmail || !holderName || !holderTaxId) {
    return NextResponse.json({ error: "Dados de cartao PagBank incompletos." }, { status: 400 });
  }

  const { data: order, error: orderError } = await client
    .from("sales_catalog_orders")
    .select("id, lead_id, conversation_id, status, payment_status, customer_name, customer_document, customer_email, customer_phone, destination_cep, destination_address, shipping_total, shipping_method, total, subtotal, latest_payment_session_id, metadata")
    .eq("id", sourceSession.order_id)
    .eq("organization_id", sourceSession.organization_id)
    .maybeSingle<OrderRow>();

  if (orderError || !order) {
    return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
  }

  if (isClosedOrder(order)) {
    return NextResponse.json({ error: "Este pedido ja foi finalizado." }, { status: 400 });
  }

  const { data: itemRows } = await client
    .from("sales_catalog_order_items")
    .select("id, title, quantity, unit_price, sale_price, total, sku_code, fulfillment, metadata")
    .eq("order_id", order.id)
    .eq("organization_id", sourceSession.organization_id)
    .order("created_at", { ascending: true });
  let items = (itemRows ?? []) as OrderItemRow[];
  let cardSessionId: string | null = null;

  try {
    if (hasRecurringSalesCatalogOrderItem(readRecord(order.metadata) ?? {}, items)) {
      return NextResponse.json({
        error: "Produto recorrente precisa do fluxo de cobranca recorrente antes de pagar por cartao.",
      }, { status: 400 });
    }

    const activeCardSession = await findActiveCardSession({
      client,
      organizationId: sourceSession.organization_id,
      orderId: order.id,
    });

    if (activeCardSession) {
      return NextResponse.json({
        error: "Ja existe uma tentativa de cartao em processamento para este pedido.",
        sessionId: activeCardSession.id,
        checkoutUrl: activeCardSession.checkout_url,
      }, { status: 409 });
    }

    const orderBumpApplication = await applySalesCatalogCheckoutOrderBumps({
      client,
      organizationId: sourceSession.organization_id,
      orderId: order.id,
      selectedProductIds: selectedOrderBumpIds,
    });
    items = orderBumpApplication.items.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      sale_price: item.sale_price,
      total: item.total,
      sku_code: item.sku_code,
      fulfillment: item.fulfillment,
      metadata: item.metadata,
    }));

    if (hasRecurringSalesCatalogOrderItem(readRecord(orderBumpApplication.order.metadata) ?? {}, items)) {
      return NextResponse.json({
        error: "Produto recorrente precisa do fluxo de cobranca recorrente antes de pagar por cartao.",
      }, { status: 400 });
    }

    if (requiresSalesCatalogShippingBeforePayment(orderBumpApplication.order, items)) {
      return NextResponse.json({
        error: "Confirme frete, retirada ou entrega antes de pagar este pedido.",
      }, { status: 400 });
    }

    const amount = orderBumpApplication.totalAmount
      ?? sessionAmount
      ?? frontendAmount
      ?? normalizeCurrencyAmount(order.total)
      ?? normalizeCurrencyAmount(order.subtotal);

    if (!amount) {
      return NextResponse.json({ error: "Informe o total do pedido antes de pagar." }, { status: 400 });
    }

    if (frontendAmount && Math.abs(frontendAmount - amount) > 0.009) {
      return NextResponse.json({ error: "Valor recebido nao confere com o pedido atualizado." }, { status: 400 });
    }

    const sourceMetadata = readRecord(sourceSession.metadata) ?? {};
    const orderMetadata = readRecord(order.metadata) ?? {};
    const checkoutAgentId = resolveCheckoutAgentId(sourceMetadata, orderMetadata);
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
    const pagBankSettings = connectyHubOwned
      ? null
      : await getOrganizationSalesCatalogSettings(client, sourceSession.organization_id).catch(() => null);
    const requiredMethod = paymentMethodType === "DEBIT_CARD" ? "debit_card" : "credit_card";

    if (!connectyHubOwned && !pagBankSettings?.pagBank.enabledMethods.includes(requiredMethod)) {
      return NextResponse.json({
        error: paymentMethodType === "DEBIT_CARD"
          ? "Cartao de debito PagBank esta desativado nesta loja."
          : "Cartao de credito PagBank esta desativado nesta loja.",
      }, { status: 403 });
    }

    if (!connectyHubOwned && paymentMethodType !== "DEBIT_CARD" && installments > (pagBankSettings?.pagBank.maxInstallments ?? 1)) {
      return NextResponse.json({
        error: `Esta loja permite no maximo ${pagBankSettings?.pagBank.maxInstallments ?? 1} parcela(s).`,
      }, { status: 400 });
    }

    const sellerIntegration = connectyHubOwned
      ? null
      : await ensurePagBankAccessToken({
          client,
          organizationId: sourceSession.organization_id,
        });
    const platformBilling = connectyHubOwned
      ? await loadPagBankPlatformBillingConfig({ client })
      : null;
    const accessToken = platformBilling?.accessToken ?? sellerIntegration?.accessToken;
    const mode = connectyHubOwned ? platformBilling?.mode ?? "production" : sellerIntegration?.mode ?? "production";
    const apiBaseUrl = connectyHubOwned ? platformBilling?.apiBaseUrl ?? null : null;

    if (!accessToken) {
      throw new Error(connectyHubOwned
        ? "Nao foi possivel localizar a conta PagBank da ConnectyHub para este pagamento."
        : "Nao foi possivel localizar a conta PagBank da loja para este pagamento.");
    }

    cardSessionId = randomUUID();
    const idempotencyKey = randomUUID();
    const externalReference = `sales_catalog_order:${order.id}:${cardSessionId}`;
    const checkoutUrl = buildSalesCatalogCheckoutUrl(cardSessionId);
    const description = buildCardPaymentDescription(items, order.id);
    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await client
      .from("sales_catalog_payment_sessions")
      .insert({
        id: cardSessionId,
        organization_id: sourceSession.organization_id,
        order_id: order.id,
        integration_id: sellerIntegration?.id ?? null,
        provider: "pagbank",
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
          created_from: "checkout_pagbank_card",
          source_payment_session_id: sourceSession.id,
          agent_id: checkoutAgentId,
          selected_order_bump_product_ids: selectedOrderBumpIds,
          applied_order_bump_product_ids: orderBumpApplication.appliedBumps.map((item) => item.productId),
          added_order_bump_product_ids: orderBumpApplication.addedBumps.map((item) => item.productId),
          payment_method_id: "pagbank_card",
          installments,
          pagbank_three_d_secure_mode: "required",
          pagbank_three_d_secure_status: readString(formData.authentication_status),
          pagbank_three_d_secure_flow_status: readString(formData.authentication_flow_status),
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
      throw new Error(insertError?.message ?? "Nao foi possivel iniciar a sessao de cartao PagBank.");
    }

    const orderResult = await createPagBankCardOrder({
      accessToken,
      mode,
      apiBaseUrl,
      amount,
      description,
      externalReference,
      payerEmail,
      payerName: holderName ?? order.customer_name,
      payerDocument: holderTaxId ?? order.customer_document ?? readString(payerIdentification.number),
      payerPhone: payerPhone ?? order.customer_phone,
      notificationUrl: buildPagBankWebhookUrl(),
      idempotencyKey,
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        skuCode: item.sku_code,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        salePrice: item.sale_price,
        total: item.total,
      })),
      encryptedCard,
      securityCode,
      holderName,
      holderTaxId,
      installments,
      paymentMethodType,
      authenticationMethodId: readString(formData.authentication_method_id),
      authenticationStatus: readString(formData.authentication_status),
      storeCard: false,
      recurringType: null,
      softDescriptor: platformBilling?.softDescriptor ?? null,
    });
    const paymentData = extractPagBankCardData(orderResult.order);
    const providerPaymentId = paymentData.providerOrderId ?? paymentData.providerPaymentId;
    const paymentStatus = normalizePaymentSessionStatus(paymentData.status);
    const { error: updateError } = await client
      .from("sales_catalog_payment_sessions")
      .update({
        status: paymentStatus,
        provider_payment_id: providerPaymentId,
        provider_status: paymentData.providerStatus,
        provider_status_detail: paymentData.providerStatusDetail,
        paid_at: paymentData.paidAt,
        failure_reason: paymentStatus === "rejected" ? paymentData.providerStatusDetail : null,
        metadata: {
          created_from: "checkout_pagbank_card",
          source_payment_session_id: sourceSession.id,
          agent_id: checkoutAgentId,
          payment_method_id: "pagbank_card",
          installments,
          pagbank_order_id: paymentData.providerOrderId,
          pagbank_charge_id: paymentData.providerPaymentId,
          pagbank_status: paymentData.providerStatus,
          pagbank_payment: buildPagBankCardSessionPaymentMetadata(paymentData),
          payment_owner: connectyHubOwned ? "connectyhub" : "seller",
          commercial_flow_type: commercialFlowType,
          revenue_owner_type: revenueOwnerType,
          commission_eligible: commissionEligible,
          payment_receiver: connectyHubOwned ? "connectyhub" : "seller",
          platform_product_marketplace: connectyHubOwned,
          platform_product_ids: platformProductIds,
          platform_catalog_item_ids: platformCatalogItemIds,
        },
      })
      .eq("id", cardSessionId)
      .eq("organization_id", sourceSession.organization_id);

    if (updateError) {
      throw new Error(`Cartao processado, mas nao foi possivel atualizar a sessao: ${updateError.message}`);
    }

    await client
      .from("sales_catalog_orders")
      .update(buildOrderPatch(paymentStatus, cardSessionId, providerPaymentId, readRecord(orderBumpApplication.order.metadata) ?? readRecord(order.metadata) ?? {}, {
        commercialFlowType,
        revenueOwnerType,
        containsPlatformProducts: connectyHubOwned,
        commissionEligible,
        paymentMethodLabel: "Cartao PagBank",
      }))
      .eq("id", order.id)
      .eq("organization_id", sourceSession.organization_id);

    const postPayment = await handleSalesCatalogPaymentStatusChange({
      client,
      organizationId: sourceSession.organization_id,
      orderId: order.id,
      paymentSessionId: cardSessionId,
      providerPaymentId,
      paymentMethodLabel: "Cartao PagBank",
      status: paymentStatus,
      source: "checkout_card",
    });

    await client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: sourceSession.organization_id,
      source_type: "sales_catalog_payment_session",
      source_id: cardSessionId,
      event_type: "sales_catalog.card_payment_processed",
      title: "Pagamento com cartao PagBank processado",
      summary: `Pagamento ${providerPaymentId ?? cardSessionId.slice(0, 8)} atualizado para ${paymentData.providerStatus ?? paymentStatus}.`,
      confidence: 1,
      visibility: "organization",
      tags: ["sales_catalog", "payment", "pagbank", "card", "checkout", "lead_tracking"],
      payload: {
        order_id: order.id,
        payment_session_id: cardSessionId,
        source_payment_session_id: sourceSession.id,
        provider_payment_id: providerPaymentId,
        provider_status: paymentData.providerStatus,
        status: paymentStatus,
        payment_method: "card",
        payment_method_label: "Cartao PagBank",
        lead_id: order.lead_id,
        conversation_id: order.conversation_id,
        agent_id: checkoutAgentId,
        lead_phone: order.customer_phone,
        items: summarizePaymentItems(items),
        selected_order_bump_product_ids: selectedOrderBumpIds,
        applied_order_bump_product_ids: orderBumpApplication.appliedBumps.map((item) => item.productId),
        added_order_bump_product_ids: orderBumpApplication.addedBumps.map((item) => item.productId),
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
      status: paymentStatus,
      providerStatus: paymentData.providerStatus,
      providerStatusDetail: paymentData.providerStatusDetail,
      providerPaymentId,
    });
  } catch (error) {
    if (cardSessionId) {
      await client
        .from("sales_catalog_payment_sessions")
        .update({
          status: "error",
          failure_reason: error instanceof Error ? error.message : "Nao foi possivel processar o cartao PagBank.",
        })
        .eq("id", cardSessionId)
        .eq("organization_id", sourceSession.organization_id);
    }

    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel processar o cartao PagBank.",
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

async function findActiveCardSession(input: {
  client: ReturnType<typeof createServiceClient>;
  organizationId: string;
  orderId: string;
}) {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await input.client
    .from("sales_catalog_payment_sessions")
    .select("id, checkout_url, status")
    .eq("organization_id", input.organizationId)
    .eq("order_id", input.orderId)
    .eq("method", "card")
    .in("status", ["created", "pending"])
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ActiveCardSessionRow>();

  return data ?? null;
}

function isFinalPaymentSessionStatus(status: string | null) {
  return status === "approved" || status === "refunded";
}

function isClosedOrder(order: Pick<OrderRow, "status" | "payment_status">) {
  return order.status === "paid"
    || order.status === "cancelled"
    || order.payment_status === "confirmed"
    || order.payment_status === "refunded";
}

function summarizePaymentItems(items: OrderItemRow[]) {
  return items.map((item) => ({
    order_item_id: item.id,
    title: item.title,
    quantity: item.quantity ?? 1,
    sku_code: item.sku_code,
    unit_price: item.unit_price,
    sale_price: item.sale_price,
    total: item.total,
  }));
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
    paymentMethodLabel?: string;
  },
) {
  const paymentMethodLabel = ownerContext.paymentMethodLabel ?? "Cartao Mercado Pago";

  if (status === "approved") {
    return {
      latest_payment_session_id: sessionId,
      status: "paid",
      payment_status: "confirmed",
      payment_method: paymentMethodLabel,
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
      payment_method: paymentMethodLabel,
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
    payment_method: paymentMethodLabel,
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

function buildPagBankCardSessionPaymentMetadata(paymentData: PagBankCardPaymentData): JsonRecord {
  return {
    id: paymentData.providerOrderId ?? paymentData.providerPaymentId,
    charge_id: paymentData.providerPaymentId,
    status: paymentData.providerStatus,
    status_detail: paymentData.providerStatusDetail,
    payment_method_type: paymentData.paymentMethodType,
    installments: paymentData.installments,
    authentication_method_id: paymentData.authenticationMethodId,
    authentication_status: paymentData.authenticationStatus,
    payment_response_reference: paymentData.paymentResponseReference,
    card: {
      token_returned: Boolean(paymentData.cardToken),
      brand: paymentData.cardBrand,
      first_digits: paymentData.cardFirstDigits,
      last_digits: paymentData.cardLastDigits,
      exp_month: paymentData.cardExpMonth,
      exp_year: paymentData.cardExpYear,
    },
  };
}

function normalizePagBankCardPaymentMethodType(value: unknown): PagBankCardPaymentMethodType {
  return readString(value)?.toUpperCase() === "DEBIT_CARD" ? "DEBIT_CARD" : "CREDIT_CARD";
}

function normalizePagBankInstallments(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? "1"), 10);

  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 12) : 1;
}

function normalizePaymentSessionStatus(value: string) {
  if (value === "approved") return "approved";
  if (value === "pending") return "pending";
  if (value === "rejected") return "rejected";
  if (value === "refunded") return "refunded";
  if (value === "cancelled" || value === "canceled" || value === "expired") return "cancelled";
  if (value === "error") return "error";

  return "pending";
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

function resolveCheckoutAgentId(...metadataRecords: JsonRecord[]) {
  for (const metadata of metadataRecords) {
    const agentId = readString(metadata.agent_id)
      ?? readString(metadata.whatsapp_agent_id)
      ?? readString(metadata.producer_agent_id)
      ?? readString(metadata.created_by_agent_id)
      ?? readString(metadata.latest_agent_id);

    if (agentId) {
      return agentId;
    }
  }

  return null;
}

function hasRecurringSalesCatalogOrderItem(orderMetadata: JsonRecord, items: OrderItemRow[]) {
  if (readString(orderMetadata.billing_cycle) === "recurring") {
    return true;
  }

  const orderBillingCycles = Array.isArray(orderMetadata.billing_cycles)
    ? orderMetadata.billing_cycles
    : [];

  if (orderBillingCycles.some((cycle) => readString(cycle) === "recurring")) {
    return true;
  }

  return items.some((item) => {
    const metadata = readRecord(item.metadata) ?? {};

    return readString(metadata.billing_cycle) === "recurring"
      || readString(metadata.billingCycle) === "recurring";
  });
}

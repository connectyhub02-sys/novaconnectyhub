import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrganizationSalesCatalogSettings,
  mapSalesCatalogPaymentSession,
  type SalesCatalogPaymentSessionRow,
} from "@/lib/client-os/sales-catalog";
import { resolveSalesCatalogOrderPaymentOwner } from "@/lib/platform-product-sales";
import { requiresSalesCatalogShippingBeforePayment } from "@/lib/sales-catalog/checkout-guards";
import {
  buildMercadoPagoAdditionalInfo,
  buildMercadoPagoWebhookUrl,
  buildSalesCatalogCheckoutUrl,
  createMercadoPagoPixPayment,
  ensureMercadoPagoAccessToken,
  extractMercadoPagoPixData,
  normalizeCurrencyAmount,
} from "./mercado-pago";
import {
  buildPagBankWebhookUrl,
  createPagBankPixOrder,
  ensurePagBankAccessToken,
  extractPagBankPixData,
  loadPagBankPlatformBillingConfig,
} from "./pagbank";
import {
  buildAsaasCheckoutUrl,
  createAsaasCheckout,
  createAsaasPixPayment,
  ensureAsaasAccessToken,
  extractAsaasPaymentData,
} from "./asaas";
import type { SalesCatalogAsaasSettings, SalesCatalogPagBankSettings } from "./shared";
import {
  buildTrackedLinkUrl,
  createTrackedLinkSlug,
  createTrackedLinkTag,
} from "@/lib/tracking/tracked-links";

type JsonRecord = Record<string, unknown>;
type PaymentGatewayProvider = "mercado_pago" | "pagbank" | "asaas";
type PaymentGatewayIntegration =
  | Awaited<ReturnType<typeof ensureMercadoPagoAccessToken>>
  | Awaited<ReturnType<typeof ensurePagBankAccessToken>>
  | Awaited<ReturnType<typeof ensureAsaasAccessToken>>;
type PaymentGatewayPixData =
  | ReturnType<typeof extractMercadoPagoPixData>
  | ReturnType<typeof extractPagBankPixData>
  | ReturnType<typeof extractAsaasPaymentData>;

type OrderRow = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  conversation_id: string | null;
  customer_name: string | null;
  customer_document: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  destination_cep: string | null;
  destination_address: string | null;
  subtotal: string | null;
  shipping_total: string | null;
  shipping_method: string | null;
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
  fulfillment?: unknown;
  metadata?: JsonRecord | null;
};

type DeferredSalesCatalogPaymentReason =
  | "shipping_required"
  | "customer_name_required"
  | "customer_email_required"
  | "customer_document_required"
  | "lead_details_required";

const paymentSessionSelect = "id, organization_id, order_id, integration_id, provider, method, status, amount, currency, payer_email, provider_payment_id, provider_status, provider_status_detail, checkout_url, pix_qr_code, pix_qr_code_base64, pix_ticket_url, external_reference, expires_at, paid_at, failure_reason, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata, created_at, updated_at";

export async function createSalesCatalogPixPaymentSession(input: {
  client: SupabaseClient;
  organizationId: string;
  orderId: string;
  amount?: string | number | null;
  payerEmail?: string | null;
  preferredMethod?: "pix" | "card" | null;
  source: "dashboard" | "whatsapp_agent" | "checkout";
  actorId?: string | null;
}) {
  const { data: order, error: orderError } = await input.client
    .from("sales_catalog_orders")
    .select("id, organization_id, lead_id, conversation_id, customer_name, customer_document, customer_email, customer_phone, destination_cep, destination_address, subtotal, shipping_total, total, shipping_method, metadata")
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
    .select("id, title, quantity, unit_price, sale_price, total, sku_code, fulfillment, metadata")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });
  const items = (itemRows ?? []) as OrderItemRow[];
  const amount = normalizeCurrencyAmount(input.amount)
    ?? normalizeCurrencyAmount(order.total)
    ?? normalizeCurrencyAmount(order.subtotal);
  const orderMetadata = readRecord(order.metadata);
  const agentId = resolveOrderAgentId(orderMetadata);
  const preferredMethod = input.preferredMethod === "card" ? "card" : "pix";
  const sessionMethod = preferredMethod === "card" ? "card" : "pix";

  if (!amount) {
    throw new Error("Informe o total do pedido antes de gerar Pix.");
  }

  const needsShippingBeforePayment = requiresSalesCatalogShippingBeforePayment(order, items);
  const needsCustomerNameBeforePayment = input.source === "whatsapp_agent" && !hasSalesCatalogOrderCustomerName(order);
  const needsCustomerEmailBeforePayment = input.source === "whatsapp_agent" && !hasSalesCatalogOrderCustomerEmail(order, input.payerEmail);

  if (needsShippingBeforePayment || needsCustomerNameBeforePayment || needsCustomerEmailBeforePayment) {
    const missingCount = [needsShippingBeforePayment, needsCustomerNameBeforePayment, needsCustomerEmailBeforePayment].filter(Boolean).length;
    const reason: DeferredSalesCatalogPaymentReason = missingCount > 1
      ? "lead_details_required"
      : needsShippingBeforePayment
        ? "shipping_required"
        : needsCustomerNameBeforePayment
          ? "customer_name_required"
          : "customer_email_required";
    return createDeferredSalesCatalogCheckoutSession({
      ...input,
      order,
      items,
      amount,
      preferredMethod,
      reason,
      reasonLabel: formatDeferredSalesCatalogPaymentReason(reason),
    });
  }

  if (hasRecurringSalesCatalogOrderItem(orderMetadata, items)) {
    throw new Error("Produto recorrente precisa do fluxo de cobranca recorrente antes de gerar Pix unico.");
  }

  const paymentOwner = await resolveSalesCatalogOrderPaymentOwner({
    client: input.client,
    organizationId: input.organizationId,
    orderId: order.id,
  });
  const connectyHubOwned = paymentOwner.owner === "connectyhub";
  const paymentProvider = await resolvePaymentGatewayProvider({
    client: input.client,
    organizationId: input.organizationId,
    connectyHubOwned,
  });
  const paymentProviderLabel = formatPaymentGatewayProviderLabel(paymentProvider);
  const paymentProviderTag = formatPaymentGatewayProviderTag(paymentProvider);
  const paymentMethodLabel = formatPaymentMethodLabel(paymentProvider, sessionMethod);

  if (paymentProvider === "asaas" && input.source === "whatsapp_agent" && !hasSalesCatalogOrderCustomerDocument(order)) {
    return createDeferredSalesCatalogCheckoutSession({
      ...input,
      order,
      items,
      amount,
      preferredMethod,
      reason: "customer_document_required",
      reasonLabel: formatDeferredSalesCatalogPaymentReason("customer_document_required"),
    });
  }

  const catalogSettings = (paymentProvider === "pagbank" || paymentProvider === "asaas") && !connectyHubOwned
    ? await getOrganizationSalesCatalogSettings(input.client, input.organizationId).catch(() => null)
    : null;
  const pagBankSettings = catalogSettings?.pagBank ?? null;
  const asaasSettings = catalogSettings?.asaas ?? null;
  let integration: PaymentGatewayIntegration | null = null;
  let platformBilling: Awaited<ReturnType<typeof loadPagBankPlatformBillingConfig>> | null = null;
  let providerSetupError: string | null = null;

  if (paymentProvider === "pagbank" && pagBankSettings && preferredMethod === "pix" && !pagBankSettings.enabledMethods.includes("pix")) {
    throw new Error("Pix PagBank esta desativado nas configuracoes do catalogo.");
  }

  if (
    paymentProvider === "pagbank"
    && pagBankSettings
    && preferredMethod === "card"
    && !pagBankSettings.enabledMethods.some((method) => method === "credit_card" || method === "debit_card")
  ) {
    throw new Error("Cartao PagBank esta desativado nas configuracoes do catalogo.");
  }

  if (paymentProvider === "asaas" && asaasSettings && preferredMethod === "pix" && !asaasSettings.enabledMethods.includes("pix")) {
    throw new Error("Pix Asaas esta desativado nas configuracoes do catalogo.");
  }

  if (
    paymentProvider === "asaas"
    && asaasSettings
    && preferredMethod === "card"
    && !asaasSettings.enabledMethods.includes("credit_card")
  ) {
    throw new Error("Cartao de credito Asaas esta desativado nas configuracoes do catalogo.");
  }

  try {
    if (connectyHubOwned) {
      platformBilling = await loadPagBankPlatformBillingConfig({ client: input.client });
    } else if (paymentProvider === "asaas") {
      integration = await ensureAsaasAccessToken({
        client: input.client,
        organizationId: input.organizationId,
      });
    } else if (paymentProvider === "pagbank") {
      integration = await ensurePagBankAccessToken({
        client: input.client,
        organizationId: input.organizationId,
      });
    } else {
      integration = await ensureMercadoPagoAccessToken({
        client: input.client,
        organizationId: input.organizationId,
      });
    }
  } catch (error) {
    providerSetupError = error instanceof Error
      ? error.message
      : `Nao foi possivel preparar o ${paymentProviderLabel} para este checkout.`;
  }

  const accessToken = platformBilling?.accessToken ?? integration?.accessToken;
  const missingAccessTokenMessage = connectyHubOwned
    ? "Nao foi possivel localizar a conta PagBank da ConnectyHub para este pagamento."
    : `Nao foi possivel localizar a conta ${paymentProviderLabel} para este pagamento.`;

  const sessionId = randomUUID();
  const idempotencyKey = randomUUID();
  const externalReference = `sales_catalog_order:${order.id}:${sessionId}`;
  const checkoutUrl = buildSalesCatalogCheckoutUrl(sessionId);
  const payerEmail = normalizePayerEmail(input.payerEmail ?? order.customer_email, order.id);
  const description = buildPaymentDescription(items, order.id);
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
  const gatewayItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    skuCode: item.sku_code,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    salePrice: item.sale_price,
    total: item.total,
  }));
  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await input.client
    .from("sales_catalog_payment_sessions")
    .insert({
      id: sessionId,
      organization_id: input.organizationId,
      order_id: order.id,
      integration_id: integration?.id ?? null,
      provider: paymentProvider,
      method: sessionMethod,
      status: accessToken ? "created" : "error",
      amount,
      currency: "BRL",
      provider_status: accessToken ? null : "gateway_unavailable",
      provider_status_detail: accessToken ? null : "missing_access_token",
      failure_reason: accessToken ? null : providerSetupError ?? missingAccessTokenMessage,
      payment_owner_type: paymentOwner.owner === "connectyhub" ? "connectyhub" : "client",
      commercial_flow_type: paymentOwner.commercialFlowType,
      revenue_owner_type: paymentOwner.revenueOwnerType,
      payer_email: payerEmail,
      checkout_url: checkoutUrl,
      idempotency_key: idempotencyKey,
      external_reference: externalReference,
      commission_context: {
        eligible: paymentOwner.commissionEligible,
        platform_product_ids: paymentOwner.platformProductIds,
        catalog_item_ids: paymentOwner.catalogItemIds,
      },
      metadata: {
        created_from: input.source,
        actor_id: input.actorId ?? null,
        agent_id: agentId,
        order_item_count: items.length,
        payment_owner: paymentOwner.owner,
        payment_gateway: paymentProvider,
        payment_gateway_label: paymentProviderLabel,
        payment_gateway_mode: connectyHubOwned ? platformBilling?.mode ?? null : getPaymentIntegrationMode(integration),
        preferred_payment_method: preferredMethod,
        pagbank_settings: pagBankSettings ? serializePagBankSessionSettings(pagBankSettings) : null,
        asaas_settings: asaasSettings ? serializeAsaasSessionSettings(asaasSettings) : null,
        commercial_flow_type: paymentOwner.commercialFlowType,
        revenue_owner_type: paymentOwner.revenueOwnerType,
        commission_eligible: paymentOwner.commissionEligible,
        payment_receiver: connectyHubOwned ? "connectyhub" : "seller",
        platform_product_marketplace: connectyHubOwned,
        platform_product_ids: paymentOwner.platformProductIds,
        platform_catalog_item_ids: paymentOwner.catalogItemIds,
        gateway_available: Boolean(accessToken),
        gateway_setup_error: accessToken ? null : providerSetupError ?? missingAccessTokenMessage,
      },
      created_at: now,
      updated_at: now,
    })
    .select(paymentSessionSelect)
    .single<SalesCatalogPaymentSessionRow>();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Nao foi possivel iniciar a sessao de pagamento.");
  }

  const checkoutTracking = await createPaymentSessionTrackedLink({
    client: input.client,
    organizationId: input.organizationId,
    order,
    items,
    sessionId,
    checkoutUrl,
    amount,
    source: input.source,
    actorId: input.actorId ?? null,
    itemCount: items.length,
  }).catch(() => null);

  if (!accessToken) {
    const failureReason = providerSetupError ?? missingAccessTokenMessage;
    const { data: unavailable, error: unavailableError } = await input.client
      .from("sales_catalog_payment_sessions")
      .update({
        status: "error",
        failure_reason: failureReason,
        provider_status: "gateway_unavailable",
        provider_status_detail: "missing_access_token",
        metadata: buildPaymentSessionMetadata({
          sessionMetadata: inserted.metadata,
          checkoutTracking,
          paymentOwner,
          connectyHubOwned,
          paymentProvider,
          gatewayAvailable: false,
          gatewayError: failureReason,
        }),
      })
      .eq("id", sessionId)
      .eq("organization_id", input.organizationId)
      .select(paymentSessionSelect)
      .single<SalesCatalogPaymentSessionRow>();

    if (unavailableError || !unavailable) {
      throw new Error(unavailableError?.message ?? "Checkout criado, mas nao foi possivel marcar o gateway como indisponivel.");
    }

    await persistCheckoutOrderReference({
      client: input.client,
      organizationId: input.organizationId,
      order,
      sessionId,
      checkoutUrl,
      checkoutTracking,
      paymentOwner,
      connectyHubOwned,
      paymentProvider,
      paymentMethodType: sessionMethod,
      paymentStatus: "pending",
      orderStatus: "pending_payment",
      failureReason,
    });

    await input.client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: input.organizationId,
      source_type: "sales_catalog_payment_session",
      source_id: sessionId,
      event_type: "sales_catalog.payment_session_gateway_unavailable",
      title: "Checkout criado com gateway indisponivel",
      summary: failureReason,
      confidence: 0.86,
      visibility: "organization",
      tags: ["sales_catalog", "sales_catalog_order", "payment", paymentProviderTag, "checkout", "lead_tracking"],
      payload: {
        order_id: order.id,
        payment_session_id: sessionId,
        checkout_url: checkoutUrl,
        tracking_url: checkoutTracking?.trackingUrl ?? null,
        tracking_link_id: checkoutTracking?.id ?? null,
        tracking_tag: checkoutTracking?.tag ?? null,
        amount,
        items: summarizePaymentItems(items),
        lead_id: order.lead_id,
        conversation_id: order.conversation_id,
        agent_id: agentId,
        lead_phone: order.customer_phone,
        source: input.source,
        gateway_error: failureReason,
        payment_gateway: paymentProvider,
        payment_owner: paymentOwner.owner,
        commercial_flow_type: paymentOwner.commercialFlowType,
        revenue_owner_type: paymentOwner.revenueOwnerType,
        commission_eligible: paymentOwner.commissionEligible,
        platform_product_marketplace: connectyHubOwned,
      },
    });

    return {
      session: mapSalesCatalogPaymentSession(unavailable),
      checkoutUrl,
      trackingUrl: checkoutTracking?.trackingUrl ?? null,
      trackingLinkId: checkoutTracking?.id ?? null,
      trackingTag: checkoutTracking?.tag ?? null,
      pixQrCode: null,
      pixTicketUrl: null,
      gatewayUnavailable: true,
      paymentDeferred: false,
      paymentDeferredReason: null,
      };
  }

  if (preferredMethod === "card") {
    try {
      let cardCheckoutUrl = checkoutUrl;
      let cardCheckoutTracking = checkoutTracking;
      let providerPaymentId: string | null = null;
      let providerStatus: string | null = null;
      let providerStatusDetail: string | null = null;
      let cardMetadata: JsonRecord = {
        preferred_payment_method: "card",
        checkout_ready_for_card: true,
      };

      if (paymentProvider === "asaas" && !connectyHubOwned) {
        const asaasCheckout = await createAsaasCheckout({
          accessToken,
          mode: getPaymentIntegrationMode(integration),
          amount,
          description,
          externalReference,
          payerEmail,
          payerName: order.customer_name,
          payerDocument: order.customer_document,
          payerPhone: order.customer_phone,
          payerZipCode: order.destination_cep,
          payerAddress: order.destination_address,
          billingTypes: ["CREDIT_CARD"],
          minutesToExpire: asaasSettings?.checkoutExpirationMinutes ?? null,
          maxInstallmentCount: asaasSettings?.maxInstallments ?? null,
          successUrl: checkoutUrl,
          cancelUrl: checkoutUrl,
          expiredUrl: checkoutUrl,
          idempotencyKey,
          items: gatewayItems,
        });
        const asaasCheckoutUrl = buildAsaasCheckoutUrl(asaasCheckout);

        if (!asaasCheckoutUrl) {
          throw new Error("Asaas criou o checkout, mas nao retornou URL de pagamento.");
        }

        cardCheckoutUrl = asaasCheckoutUrl;
        providerPaymentId = asaasCheckout.id ?? null;
        providerStatus = asaasCheckout.status ?? "created";
        providerStatusDetail = "asaas_checkout";
        cardMetadata = {
          ...cardMetadata,
          asaas_checkout_id: asaasCheckout.id ?? null,
          asaas_checkout_url: asaasCheckoutUrl,
          asaas_checkout_status: asaasCheckout.status ?? null,
        };
        cardCheckoutTracking = await createPaymentSessionTrackedLink({
          client: input.client,
          organizationId: input.organizationId,
          order,
          items,
          sessionId,
          checkoutUrl: cardCheckoutUrl,
          amount,
          source: input.source,
          actorId: input.actorId ?? null,
          itemCount: items.length,
        }).catch(() => checkoutTracking);
      }

      const { data: checkoutOnly, error: checkoutOnlyError } = await input.client
        .from("sales_catalog_payment_sessions")
        .update({
          checkout_url: cardCheckoutUrl,
          provider_payment_id: providerPaymentId,
          provider_status: providerStatus,
          provider_status_detail: providerStatusDetail,
          metadata: buildPaymentSessionMetadata({
            sessionMetadata: inserted.metadata,
            checkoutTracking: cardCheckoutTracking,
            paymentOwner,
            connectyHubOwned,
            paymentProvider,
            gatewayAvailable: true,
            providerPaymentId,
            providerStatus,
            extra: cardMetadata,
          }),
        })
        .eq("id", sessionId)
        .eq("organization_id", input.organizationId)
        .select(paymentSessionSelect)
        .single<SalesCatalogPaymentSessionRow>();

      if (checkoutOnlyError || !checkoutOnly) {
        throw new Error(checkoutOnlyError?.message ?? "Checkout criado, mas nao foi possivel preparar o cartao.");
      }

      await persistCheckoutOrderReference({
        client: input.client,
        organizationId: input.organizationId,
        order,
        sessionId,
        checkoutUrl: cardCheckoutUrl,
        checkoutTracking: cardCheckoutTracking,
        paymentOwner,
        connectyHubOwned,
        paymentProvider,
        paymentMethodType: "card",
        paymentStatus: "pending",
        orderStatus: "pending_payment",
        paymentMethod: `Checkout ${paymentProviderLabel}`,
        providerPaymentId,
      });

      await input.client.from("intelligence_events").insert({
        scope: "organization",
        organization_id: input.organizationId,
        source_type: "sales_catalog_payment_session",
        source_id: sessionId,
        event_type: "sales_catalog.card_checkout_created",
        title: `Checkout de cartao ${paymentProviderLabel} criado`,
        summary: `Checkout criado para pedido ${order.id.slice(0, 8)} sem gerar Pix automatico.`,
        confidence: 1,
        visibility: "organization",
        tags: ["sales_catalog", "sales_catalog_order", "payment", paymentProviderTag, "checkout", "whatsapp_agent", "lead_tracking"],
        payload: {
          order_id: order.id,
          payment_session_id: sessionId,
          provider_payment_id: providerPaymentId,
          checkout_url: cardCheckoutUrl,
          tracking_url: cardCheckoutTracking?.trackingUrl ?? null,
          tracking_link_id: cardCheckoutTracking?.id ?? null,
          tracking_tag: cardCheckoutTracking?.tag ?? null,
          amount,
          items: summarizePaymentItems(items),
          lead_id: order.lead_id,
          conversation_id: order.conversation_id,
          agent_id: agentId,
          lead_phone: order.customer_phone,
          source: input.source,
          payment_gateway: paymentProvider,
          payment_owner: paymentOwner.owner,
        },
      });

      return {
        session: mapSalesCatalogPaymentSession(checkoutOnly),
        checkoutUrl: cardCheckoutUrl,
        trackingUrl: cardCheckoutTracking?.trackingUrl ?? null,
        trackingLinkId: cardCheckoutTracking?.id ?? null,
        trackingTag: cardCheckoutTracking?.tag ?? null,
        pixQrCode: null,
        pixTicketUrl: null,
        gatewayUnavailable: false,
        paymentDeferred: false,
        paymentDeferredReason: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : `Erro ao criar checkout ${paymentProviderLabel}.`;

      const { data: failed } = await input.client
        .from("sales_catalog_payment_sessions")
        .update({
          status: "error",
          failure_reason: message,
          provider_status: "gateway_error",
          metadata: buildPaymentSessionMetadata({
            sessionMetadata: inserted.metadata,
            checkoutTracking,
            paymentOwner,
            connectyHubOwned,
            paymentProvider,
            gatewayAvailable: false,
            gatewayError: message,
          }),
        })
        .eq("id", sessionId)
        .eq("organization_id", input.organizationId)
        .select(paymentSessionSelect)
        .maybeSingle<SalesCatalogPaymentSessionRow>();

      await persistCheckoutOrderReference({
        client: input.client,
        organizationId: input.organizationId,
        order,
        sessionId,
        checkoutUrl,
        checkoutTracking,
        paymentOwner,
        connectyHubOwned,
        paymentProvider,
        paymentMethodType: "card",
        paymentStatus: "pending",
        orderStatus: "pending_payment",
        failureReason: message,
      });

      await input.client.from("intelligence_events").insert({
        scope: "organization",
        organization_id: input.organizationId,
        source_type: "sales_catalog_payment_session",
        source_id: sessionId,
        event_type: "sales_catalog.payment_session_provider_failed",
        title: "Checkout de cartao com falha no gateway",
        summary: message,
        confidence: 0.82,
        visibility: "organization",
        tags: ["sales_catalog", "sales_catalog_order", "payment", paymentProviderTag, "checkout", "lead_tracking"],
        payload: {
          order_id: order.id,
          payment_session_id: sessionId,
          checkout_url: checkoutUrl,
          tracking_url: checkoutTracking?.trackingUrl ?? null,
          tracking_link_id: checkoutTracking?.id ?? null,
          tracking_tag: checkoutTracking?.tag ?? null,
          amount,
          items: summarizePaymentItems(items),
          lead_id: order.lead_id,
          conversation_id: order.conversation_id,
          agent_id: agentId,
          lead_phone: order.customer_phone,
          source: input.source,
          gateway_error: message,
          payment_gateway: paymentProvider,
          payment_owner: paymentOwner.owner,
        },
      });

      return {
        session: mapSalesCatalogPaymentSession(failed ?? inserted),
        checkoutUrl,
        trackingUrl: checkoutTracking?.trackingUrl ?? null,
        trackingLinkId: checkoutTracking?.id ?? null,
        trackingTag: checkoutTracking?.tag ?? null,
        pixQrCode: null,
        pixTicketUrl: null,
        gatewayUnavailable: true,
        paymentDeferred: false,
        paymentDeferredReason: null,
      };
    }
  }

  try {
    let pixData: PaymentGatewayPixData;

    if (paymentProvider === "asaas" && !connectyHubOwned) {
      const asaasPix = await createAsaasPixPayment({
        accessToken,
        mode: getPaymentIntegrationMode(integration),
        amount,
        description,
        externalReference,
        payerEmail,
        payerName: order.customer_name,
        payerDocument: order.customer_document,
        payerPhone: order.customer_phone,
        payerZipCode: order.destination_cep,
        payerAddress: order.destination_address,
        dueDate: resolveAsaasPaymentDueDate(asaasSettings?.pixExpirationDays ?? null),
        idempotencyKey,
        items: gatewayItems,
      });
      pixData = extractAsaasPaymentData(asaasPix.payment, asaasPix.pixQrCode);
    } else if (paymentProvider === "pagbank") {
      pixData = extractPagBankPixData((await createPagBankPixOrder({
          accessToken,
          mode: connectyHubOwned ? platformBilling?.mode ?? "production" : getPaymentIntegrationMode(integration),
          apiBaseUrl: connectyHubOwned ? platformBilling?.apiBaseUrl ?? null : null,
          amount,
          description,
          externalReference,
          payerEmail,
          payerName: order.customer_name,
          payerDocument: order.customer_document,
          payerPhone: order.customer_phone,
          notificationUrl: buildPagBankWebhookUrl(),
          idempotencyKey,
          pixExpirationMinutes: pagBankSettings?.pixExpirationMinutes ?? null,
          items: gatewayItems,
        })).order);
    } else {
      pixData = extractMercadoPagoPixData((await createMercadoPagoPixPayment({
          accessToken,
          amount,
          description,
          externalReference,
          payerEmail,
          payerName: order.customer_name,
          payerDocument: order.customer_document,
          payerZipCode: order.destination_cep,
          notificationUrl: buildMercadoPagoWebhookUrl(),
          idempotencyKey,
          additionalInfo,
        })).payment);
    }

    const providerMetadata = buildProviderPaymentMetadata(paymentProvider, pixData);
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
        metadata: buildPaymentSessionMetadata({
          sessionMetadata: inserted.metadata,
          checkoutTracking,
          paymentOwner,
          connectyHubOwned,
          paymentProvider,
          gatewayAvailable: true,
          providerPaymentId: pixData.providerPaymentId,
          providerStatus: pixData.providerStatus,
          extra: providerMetadata,
        }),
      })
      .eq("id", sessionId)
      .eq("organization_id", input.organizationId)
      .select(paymentSessionSelect)
      .single<SalesCatalogPaymentSessionRow>();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Pix gerado, mas nao foi possivel atualizar a sessao.");
    }

    await persistCheckoutOrderReference({
      client: input.client,
      organizationId: input.organizationId,
      order,
      sessionId,
      checkoutUrl,
      checkoutTracking,
      paymentOwner,
      connectyHubOwned,
      paymentProvider,
      paymentMethodType: "pix",
      paymentStatus: pixData.status === "approved" ? "confirmed" : "pending",
      orderStatus: pixData.status === "approved" ? "paid" : "pending_payment",
      providerPaymentId: pixData.providerPaymentId,
    });

    await input.client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: input.organizationId,
      source_type: "sales_catalog_payment_session",
      source_id: sessionId,
      event_type: "sales_catalog.payment_session_created",
      title: `${paymentMethodLabel} gerado`,
      summary: `Sessao de pagamento criada para pedido ${order.id.slice(0, 8)}.`,
      confidence: 1,
      visibility: "organization",
      tags: ["sales_catalog", "sales_catalog_order", "payment", paymentProviderTag, "whatsapp_agent", "lead_tracking"],
      payload: {
        order_id: order.id,
        payment_session_id: sessionId,
        provider_payment_id: pixData.providerPaymentId,
        payment_gateway: paymentProvider,
        checkout_url: checkoutUrl,
        tracking_url: checkoutTracking?.trackingUrl ?? null,
        tracking_link_id: checkoutTracking?.id ?? null,
        tracking_tag: checkoutTracking?.tag ?? null,
        amount,
        items: summarizePaymentItems(items),
        lead_id: order.lead_id,
        conversation_id: order.conversation_id,
        agent_id: agentId,
        lead_phone: order.customer_phone,
        source: input.source,
        payment_owner: paymentOwner.owner,
        commercial_flow_type: paymentOwner.commercialFlowType,
        revenue_owner_type: paymentOwner.revenueOwnerType,
        commission_eligible: paymentOwner.commissionEligible,
        platform_product_marketplace: connectyHubOwned,
      },
    });

    return {
      session: mapSalesCatalogPaymentSession(updated),
      checkoutUrl,
      trackingUrl: checkoutTracking?.trackingUrl ?? null,
      trackingLinkId: checkoutTracking?.id ?? null,
      trackingTag: checkoutTracking?.tag ?? null,
      pixQrCode: pixData.pixQrCode,
      pixTicketUrl: pixData.pixTicketUrl,
      gatewayUnavailable: false,
      paymentDeferred: false,
      paymentDeferredReason: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : `Erro ao gerar ${paymentMethodLabel}.`;

    const { data: failed } = await input.client
      .from("sales_catalog_payment_sessions")
      .update({
        status: "error",
        failure_reason: message,
        provider_status: "gateway_error",
        metadata: buildPaymentSessionMetadata({
          sessionMetadata: inserted.metadata,
          checkoutTracking,
          paymentOwner,
          connectyHubOwned,
          paymentProvider,
          gatewayAvailable: false,
          gatewayError: message,
        }),
      })
      .eq("id", sessionId)
      .eq("organization_id", input.organizationId)
      .select(paymentSessionSelect)
      .maybeSingle<SalesCatalogPaymentSessionRow>();

    await persistCheckoutOrderReference({
      client: input.client,
      organizationId: input.organizationId,
      order,
      sessionId,
      checkoutUrl,
      checkoutTracking,
      paymentOwner,
      connectyHubOwned,
      paymentProvider,
      paymentMethodType: sessionMethod,
      paymentStatus: "pending",
      orderStatus: "pending_payment",
      failureReason: message,
    });

    await input.client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: input.organizationId,
      source_type: "sales_catalog_payment_session",
      source_id: sessionId,
      event_type: "sales_catalog.payment_session_provider_failed",
      title: "Checkout criado com falha no gateway",
      summary: message,
      confidence: 0.82,
      visibility: "organization",
      tags: ["sales_catalog", "sales_catalog_order", "payment", paymentProviderTag, "checkout", "lead_tracking"],
      payload: {
        order_id: order.id,
        payment_session_id: sessionId,
        checkout_url: checkoutUrl,
        tracking_url: checkoutTracking?.trackingUrl ?? null,
        tracking_link_id: checkoutTracking?.id ?? null,
        tracking_tag: checkoutTracking?.tag ?? null,
        amount,
        items: summarizePaymentItems(items),
        lead_id: order.lead_id,
        conversation_id: order.conversation_id,
        agent_id: agentId,
        lead_phone: order.customer_phone,
        source: input.source,
        gateway_error: message,
        payment_gateway: paymentProvider,
        payment_owner: paymentOwner.owner,
        commercial_flow_type: paymentOwner.commercialFlowType,
        revenue_owner_type: paymentOwner.revenueOwnerType,
        commission_eligible: paymentOwner.commissionEligible,
        platform_product_marketplace: connectyHubOwned,
      },
    });

    return {
      session: mapSalesCatalogPaymentSession(failed ?? inserted),
      checkoutUrl,
      trackingUrl: checkoutTracking?.trackingUrl ?? null,
      trackingLinkId: checkoutTracking?.id ?? null,
      trackingTag: checkoutTracking?.tag ?? null,
      pixQrCode: null,
      pixTicketUrl: null,
      gatewayUnavailable: true,
      paymentDeferred: false,
      paymentDeferredReason: null,
    };
  }
}

async function createDeferredSalesCatalogCheckoutSession(input: {
  client: SupabaseClient;
  organizationId: string;
  orderId: string;
  amount: string | number;
  payerEmail?: string | null;
  source: "dashboard" | "whatsapp_agent" | "checkout";
  actorId?: string | null;
  order: OrderRow;
  items: OrderItemRow[];
  preferredMethod: "pix" | "card";
  reason: DeferredSalesCatalogPaymentReason;
  reasonLabel: string;
}) {
  const paymentOwner = await resolveSalesCatalogOrderPaymentOwner({
    client: input.client,
    organizationId: input.organizationId,
    orderId: input.order.id,
  });
  const connectyHubOwned = paymentOwner.owner === "connectyhub";
  const paymentProvider = await resolvePaymentGatewayProvider({
    client: input.client,
    organizationId: input.organizationId,
    connectyHubOwned,
  });
  const paymentProviderLabel = formatPaymentGatewayProviderLabel(paymentProvider);
  const paymentProviderTag = formatPaymentGatewayProviderTag(paymentProvider);
  const sessionId = randomUUID();
  const idempotencyKey = randomUUID();
  const externalReference = `sales_catalog_order:${input.order.id}:${sessionId}`;
  const checkoutUrl = buildSalesCatalogCheckoutUrl(sessionId);
  const payerEmail = normalizePayerEmail(input.payerEmail ?? input.order.customer_email, input.order.id);
  const orderMetadata = readRecord(input.order.metadata);
  const agentId = resolveOrderAgentId(orderMetadata);
  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await input.client
    .from("sales_catalog_payment_sessions")
    .insert({
      id: sessionId,
      organization_id: input.organizationId,
      order_id: input.order.id,
      integration_id: null,
      provider: paymentProvider,
      method: input.preferredMethod === "card" ? "card" : "pix",
      status: "created",
      amount: input.amount,
      currency: "BRL",
      provider_status: "payment_deferred",
      provider_status_detail: input.reason,
      failure_reason: null,
      payment_owner_type: paymentOwner.owner === "connectyhub" ? "connectyhub" : "client",
      commercial_flow_type: paymentOwner.commercialFlowType,
      revenue_owner_type: paymentOwner.revenueOwnerType,
      payer_email: payerEmail,
      checkout_url: checkoutUrl,
      idempotency_key: idempotencyKey,
      external_reference: externalReference,
      commission_context: {
        eligible: paymentOwner.commissionEligible,
        platform_product_ids: paymentOwner.platformProductIds,
        catalog_item_ids: paymentOwner.catalogItemIds,
      },
      metadata: {
        created_from: input.source,
        actor_id: input.actorId ?? null,
        agent_id: agentId,
        order_item_count: input.items.length,
        payment_owner: paymentOwner.owner,
        payment_gateway: paymentProvider,
        payment_gateway_label: paymentProviderLabel,
        commercial_flow_type: paymentOwner.commercialFlowType,
        revenue_owner_type: paymentOwner.revenueOwnerType,
        commission_eligible: paymentOwner.commissionEligible,
        payment_receiver: connectyHubOwned ? "connectyhub" : "seller",
        platform_product_marketplace: connectyHubOwned,
        platform_product_ids: paymentOwner.platformProductIds,
        platform_catalog_item_ids: paymentOwner.catalogItemIds,
        gateway_available: true,
        payment_deferred: true,
        payment_deferred_reason: input.reason,
        payment_deferred_label: input.reasonLabel,
        preferred_payment_method: input.preferredMethod,
      },
      created_at: now,
      updated_at: now,
    })
    .select(paymentSessionSelect)
    .single<SalesCatalogPaymentSessionRow>();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Nao foi possivel iniciar o checkout pendente.");
  }

  const checkoutTracking = await createPaymentSessionTrackedLink({
    client: input.client,
    organizationId: input.organizationId,
    order: input.order,
    items: input.items,
    sessionId,
    checkoutUrl,
    amount: input.amount,
    source: input.source,
    actorId: input.actorId ?? null,
    itemCount: input.items.length,
  }).catch(() => null);

  const { data: updated, error: updateError } = await input.client
    .from("sales_catalog_payment_sessions")
    .update({
      metadata: buildPaymentSessionMetadata({
        sessionMetadata: inserted.metadata,
        checkoutTracking,
        paymentOwner,
        connectyHubOwned,
        paymentProvider,
        gatewayAvailable: true,
        providerStatus: "payment_deferred",
        extra: {
          payment_deferred: true,
          payment_deferred_reason: input.reason,
          payment_deferred_label: input.reasonLabel,
        },
      }),
    })
    .eq("id", sessionId)
    .eq("organization_id", input.organizationId)
    .select(paymentSessionSelect)
    .single<SalesCatalogPaymentSessionRow>();

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? "Checkout criado, mas nao foi possivel atualizar rastreio.");
  }

  await persistCheckoutOrderReference({
    client: input.client,
    organizationId: input.organizationId,
    order: input.order,
    sessionId,
    checkoutUrl,
    checkoutTracking,
    paymentOwner,
    connectyHubOwned,
    paymentProvider,
    paymentMethodType: input.preferredMethod,
    paymentStatus: "pending",
    orderStatus: "pending_payment",
    paymentMethod: "Checkout pendente",
    paymentDeferredReason: input.reason,
  });

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.organizationId,
    source_type: "sales_catalog_payment_session",
    source_id: sessionId,
    event_type: "sales_catalog.payment_session_deferred",
    title: `Checkout aguardando dados: ${input.reasonLabel}`,
    summary: formatDeferredSalesCatalogPaymentSummary(input.reason),
    confidence: 0.92,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "payment", paymentProviderTag, "checkout", "lead_tracking", input.reason],
    payload: {
      order_id: input.order.id,
      payment_session_id: sessionId,
      checkout_url: checkoutUrl,
      tracking_url: checkoutTracking?.trackingUrl ?? null,
      tracking_link_id: checkoutTracking?.id ?? null,
      tracking_tag: checkoutTracking?.tag ?? null,
      amount: input.amount,
      items: summarizePaymentItems(input.items),
      lead_id: input.order.lead_id,
      conversation_id: input.order.conversation_id,
      agent_id: agentId,
      lead_phone: input.order.customer_phone,
      source: input.source,
      payment_deferred_reason: input.reason,
      payment_gateway: paymentProvider,
      payment_owner: paymentOwner.owner,
      commercial_flow_type: paymentOwner.commercialFlowType,
      revenue_owner_type: paymentOwner.revenueOwnerType,
      commission_eligible: paymentOwner.commissionEligible,
      platform_product_marketplace: connectyHubOwned,
    },
  });

  return {
    session: mapSalesCatalogPaymentSession(updated),
    checkoutUrl,
    trackingUrl: checkoutTracking?.trackingUrl ?? null,
    trackingLinkId: checkoutTracking?.id ?? null,
    trackingTag: checkoutTracking?.tag ?? null,
    pixQrCode: null,
    pixTicketUrl: null,
    gatewayUnavailable: false,
    paymentDeferred: true,
    paymentDeferredReason: input.reason,
  };
}

function hasSalesCatalogOrderCustomerName(order: OrderRow) {
  return Boolean(order.customer_name?.trim());
}

function hasSalesCatalogOrderCustomerEmail(order: OrderRow, payerEmail?: string | null) {
  return Boolean(normalizeEmail(order.customer_email ?? payerEmail));
}

function hasSalesCatalogOrderCustomerDocument(order: OrderRow) {
  const digits = order.customer_document?.replace(/\D/g, "") ?? "";

  return digits.length === 11 || digits.length === 14;
}

function formatDeferredSalesCatalogPaymentReason(reason: DeferredSalesCatalogPaymentReason) {
  if (reason === "customer_name_required") {
    return "Nome do cliente pendente";
  }

  if (reason === "customer_email_required") {
    return "E-mail do cliente pendente";
  }

  if (reason === "customer_document_required") {
    return "CPF ou CNPJ do cliente pendente";
  }

  if (reason === "lead_details_required") {
    return "Dados do cliente pendentes";
  }

  return "Frete pendente";
}

function formatDeferredSalesCatalogPaymentSummary(reason: DeferredSalesCatalogPaymentReason) {
  if (reason === "customer_name_required") {
    return "Pagamento adiado ate confirmar o nome do cliente.";
  }

  if (reason === "customer_email_required") {
    return "Pagamento adiado ate confirmar o e-mail do cliente.";
  }

  if (reason === "customer_document_required") {
    return "Pagamento adiado ate confirmar CPF ou CNPJ do cliente.";
  }

  if (reason === "lead_details_required") {
    return "Pagamento adiado ate confirmar dados obrigatorios do cliente.";
  }

  return "Pagamento adiado ate confirmar frete, retirada ou entrega.";
}

async function persistCheckoutOrderReference(input: {
  client: SupabaseClient;
  organizationId: string;
  order: OrderRow;
  sessionId: string;
  checkoutUrl: string;
  checkoutTracking: Awaited<ReturnType<typeof createPaymentSessionTrackedLink>> | null;
  paymentOwner: Awaited<ReturnType<typeof resolveSalesCatalogOrderPaymentOwner>>;
  connectyHubOwned: boolean;
  paymentProvider: PaymentGatewayProvider;
  paymentMethodType?: "pix" | "card";
  paymentStatus: "pending" | "confirmed";
  orderStatus: "pending_payment" | "paid";
  paymentMethod?: string;
  providerPaymentId?: string | null;
  failureReason?: string | null;
  paymentDeferredReason?: string | null;
}) {
  await input.client
    .from("sales_catalog_orders")
    .update({
      latest_payment_session_id: input.sessionId,
      payment_method: input.paymentMethod ?? formatPaymentMethodLabel(input.paymentProvider, input.paymentMethodType ?? "pix"),
      payment_status: input.paymentStatus,
      status: input.orderStatus,
      metadata: {
        ...readRecord(input.order.metadata),
        agent_id: resolveOrderAgentId(readRecord(input.order.metadata)),
        latest_agent_id: resolveOrderAgentId(readRecord(input.order.metadata)),
        latest_checkout_url: input.checkoutUrl,
        latest_checkout_tracking_url: input.checkoutTracking?.trackingUrl ?? null,
        latest_checkout_tracking_link_id: input.checkoutTracking?.id ?? null,
        latest_checkout_tracking_tag: input.checkoutTracking?.tag ?? null,
        latest_payment_session_id: input.sessionId,
        latest_payment_provider: input.paymentProvider,
        latest_payment_method: input.paymentMethodType ?? "pix",
        latest_provider_payment_id: input.providerPaymentId ?? null,
        latest_payment_failure_reason: input.failureReason ?? null,
        latest_payment_deferred_reason: input.paymentDeferredReason ?? null,
        latest_payment_owner: input.paymentOwner.owner,
        latest_commercial_flow_type: input.paymentOwner.commercialFlowType,
        latest_revenue_owner_type: input.paymentOwner.revenueOwnerType,
        latest_commission_eligible: input.paymentOwner.commissionEligible,
        platform_product_marketplace: input.connectyHubOwned,
        platform_product_ids: input.paymentOwner.platformProductIds,
      },
      commercial_flow_type: input.paymentOwner.commercialFlowType,
      revenue_owner_type: input.paymentOwner.revenueOwnerType,
      contains_platform_products: input.connectyHubOwned,
      commission_eligible: input.paymentOwner.commissionEligible,
    })
    .eq("id", input.order.id)
    .eq("organization_id", input.organizationId);
}

function buildPaymentSessionMetadata(input: {
  sessionMetadata: JsonRecord | null;
  checkoutTracking: Awaited<ReturnType<typeof createPaymentSessionTrackedLink>> | null;
  paymentOwner: Awaited<ReturnType<typeof resolveSalesCatalogOrderPaymentOwner>>;
  connectyHubOwned: boolean;
  paymentProvider: PaymentGatewayProvider;
  gatewayAvailable: boolean;
  gatewayError?: string | null;
  providerPaymentId?: string | null;
  providerStatus?: string | null;
  extra?: JsonRecord;
}) {
  return {
    ...readRecord(input.sessionMetadata),
    checkout_tracking_url: input.checkoutTracking?.trackingUrl ?? null,
    checkout_tracking_link_id: input.checkoutTracking?.id ?? null,
    checkout_tracking_tag: input.checkoutTracking?.tag ?? null,
    gateway_available: input.gatewayAvailable,
    gateway_error: input.gatewayError ?? null,
    provider_payment_id: input.providerPaymentId ?? null,
    provider_status: input.providerStatus ?? null,
    payment_gateway: input.paymentProvider,
    payment_gateway_label: formatPaymentGatewayProviderLabel(input.paymentProvider),
    payment_owner: input.paymentOwner.owner,
    commercial_flow_type: input.paymentOwner.commercialFlowType,
    revenue_owner_type: input.paymentOwner.revenueOwnerType,
    commission_eligible: input.paymentOwner.commissionEligible,
    payment_receiver: input.connectyHubOwned ? "connectyhub" : "seller",
    platform_product_marketplace: input.connectyHubOwned,
    platform_product_ids: input.paymentOwner.platformProductIds,
    platform_catalog_item_ids: input.paymentOwner.catalogItemIds,
    ...(input.extra ?? {}),
  };
}

async function resolvePaymentGatewayProvider(input: {
  client: SupabaseClient;
  organizationId: string;
  connectyHubOwned?: boolean;
}): Promise<PaymentGatewayProvider> {
  if (input.connectyHubOwned) {
    return "pagbank";
  }

  const { data } = await input.client
    .from("sales_catalog_payment_integrations")
    .select("provider, status, updated_at")
    .eq("organization_id", input.organizationId)
    .in("provider", ["asaas", "pagbank", "mercado_pago"])
    .eq("status", "connected")
    .order("updated_at", { ascending: false });
  const providers = ((data ?? []) as Array<{ provider?: string | null }>).map((item) => item.provider);

  if (providers.includes("asaas")) return "asaas";
  if (providers.includes("pagbank")) return "pagbank";
  if (providers.includes("mercado_pago")) return "mercado_pago";

  return "asaas";
}

function formatPaymentGatewayProviderLabel(provider: PaymentGatewayProvider) {
  if (provider === "asaas") return "Asaas";
  return provider === "pagbank" ? "PagBank" : "Mercado Pago";
}

function formatPaymentGatewayProviderTag(provider: PaymentGatewayProvider) {
  if (provider === "asaas") return "asaas";
  return provider === "pagbank" ? "pagbank" : "mercado_pago";
}

function formatPaymentMethodLabel(provider: PaymentGatewayProvider, method: "pix" | "card") {
  const paymentLabel = method === "card" ? "Cartao" : "Pix";

  return `${paymentLabel} ${formatPaymentGatewayProviderLabel(provider)}`;
}

function getPaymentIntegrationMode(integration: PaymentGatewayIntegration | null) {
  return integration && "mode" in integration ? integration.mode : null;
}

function buildProviderPaymentMetadata(
  provider: PaymentGatewayProvider,
  pixData: PaymentGatewayPixData,
): JsonRecord {
  if (provider === "asaas") {
    const providerCustomerId = "providerCustomerId" in pixData ? pixData.providerCustomerId : null;
    const pixExpirationDate = "pixExpirationDate" in pixData ? pixData.pixExpirationDate : null;

    return {
      asaas_payment_id: pixData.providerPaymentId,
      asaas_customer_id: providerCustomerId,
      asaas_status: pixData.providerStatus,
      asaas_pix_expiration_date: pixExpirationDate,
    };
  }

  if (provider === "pagbank") {
    const providerOrderId = "providerOrderId" in pixData ? pixData.providerOrderId : null;
    const pixQrCodePngUrl = "pixQrCodePngUrl" in pixData ? pixData.pixQrCodePngUrl : null;
    const pixQrCodeBase64Url = "pixQrCodeBase64Url" in pixData ? pixData.pixQrCodeBase64Url : null;

    return {
      pagbank_order_id: providerOrderId,
      pagbank_charge_id: pixData.providerPaymentId,
      pagbank_status: pixData.providerStatus,
      pagbank_qrcode_png_url: pixQrCodePngUrl,
      pagbank_qrcode_base64_url: pixQrCodeBase64Url,
    };
  }

  return {
    mercado_pago_payment_id: pixData.providerPaymentId,
    mercado_pago_status: pixData.providerStatus,
  };
}

function serializePagBankSessionSettings(settings: SalesCatalogPagBankSettings): JsonRecord {
  return {
    enabled_methods: settings.enabledMethods,
    max_installments: settings.maxInstallments,
    interest_free_installments: settings.interestFreeInstallments,
    soft_descriptor: settings.softDescriptor,
    pix_expiration_minutes: settings.pixExpirationMinutes,
    checkout_expiration_minutes: settings.checkoutExpirationMinutes,
    allow_buyer_edit: settings.allowBuyerEdit,
    recurring_enabled: settings.recurringEnabled,
  };
}

function serializeAsaasSessionSettings(settings: SalesCatalogAsaasSettings): JsonRecord {
  return {
    enabled_methods: settings.enabledMethods,
    max_installments: settings.maxInstallments,
    interest_free_installments: settings.interestFreeInstallments,
    soft_descriptor: settings.softDescriptor,
    pix_expiration_days: settings.pixExpirationDays,
    checkout_expiration_minutes: settings.checkoutExpirationMinutes,
    boleto_due_days: settings.boletoDueDays,
    boleto_auto_cancel_days: settings.boletoAutoCancelDays,
    allow_buyer_edit: settings.allowBuyerEdit,
    recurring_enabled: settings.recurringEnabled,
  };
}

function resolveAsaasPaymentDueDate(days: number | null | undefined) {
  const parsedDays = typeof days === "number" && Number.isFinite(days) ? days : 1;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + Math.max(0, Math.round(parsedDays)));

  return dueDate.toISOString().slice(0, 10);
}

async function createPaymentSessionTrackedLink(input: {
  client: SupabaseClient;
  organizationId: string;
  order: OrderRow;
  items: OrderItemRow[];
  sessionId: string;
  checkoutUrl: string;
  amount: string | number;
  source: "dashboard" | "whatsapp_agent" | "checkout";
  actorId: string | null;
  itemCount: number;
}) {
  const id = randomUUID();
  const label = `Pagamento pedido ${input.order.id.slice(0, 8)}`;
  const slug = createTrackedLinkSlug(label);
  const tag = createTrackedLinkTag(label, id);
  const trackingUrl = buildTrackedLinkUrl(id);
  const now = new Date().toISOString();
  const metadata = {
    label,
    url: input.checkoutUrl,
    slug,
    tag,
    tracking_url: trackingUrl,
    click_count: 0,
    sales_destination: "connectyhub_checkout",
    source: "sales_catalog_checkout",
    order_id: input.order.id,
    payment_session_id: input.sessionId,
    lead_id: input.order.lead_id,
    conversation_id: input.order.conversation_id,
    lead_phone: input.order.customer_phone,
    amount: input.amount,
    currency: "BRL",
    items: summarizePaymentItems(input.items),
    item_count: input.itemCount,
    created_from: input.source,
    actor_id: input.actorId,
    agent_id: resolveOrderAgentId(readRecord(input.order.metadata)),
  } satisfies JsonRecord;

  const { error } = await input.client
    .from("intelligence_memory")
    .insert({
      id,
      scope: "organization",
      organization_id: input.organizationId,
      memory_type: "tracked_link_button",
      title: label,
      content: input.checkoutUrl,
      importance: 0.75,
      tags: ["tracked_link_button", "sales_catalog_checkout", "sales_catalog_order", "payment", "whatsapp_agent", "lead_tracking"],
      metadata,
      created_at: now,
      updated_at: now,
    });

  if (error) {
    throw new Error(`Checkout criado, mas nao foi possivel ativar rastreio do link: ${error.message}`);
  }

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.organizationId,
    source_type: "tracked_link_button",
    source_id: id,
    event_type: "tracked_link.created_from_checkout",
    title: `Botao de pagamento rastreado: ${label}`,
    summary: `Tag ${tag} vinculada ao checkout do pedido ${input.order.id.slice(0, 8)}.`,
    confidence: 1,
    visibility: "organization",
    tags: ["tracked_link_button", "sales_catalog_checkout", "sales_catalog_order", "payment", "whatsapp_agent", "lead_tracking"],
    payload: {
      ...metadata,
      target_url: input.checkoutUrl,
    },
  });

  return {
    id,
    label,
    url: input.checkoutUrl,
    tag,
    trackingUrl,
  };
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

function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();

  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
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
    const metadata = readRecord(item.metadata);

    return readString(metadata.billing_cycle) === "recurring"
      || readString(metadata.billingCycle) === "recurring";
  });
}

function resolveOrderAgentId(metadata: JsonRecord) {
  return readString(metadata.agent_id)
    ?? readString(metadata.whatsapp_agent_id)
    ?? readString(metadata.producer_agent_id)
    ?? readString(metadata.created_by_agent_id)
    ?? readString(metadata.latest_agent_id);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

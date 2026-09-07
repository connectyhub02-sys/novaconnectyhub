import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import { record } from "@/lib/sales-catalog/card-input";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import {
  isCampaignEligible,
  parseCampaign,
  quoteCampaign,
  type CampaignConfig,
  type CampaignInterval,
  type CampaignOperation,
  type CampaignPricing,
} from "./campaigns";

export async function storeOrderContext(
  client: SupabaseClient,
  organizationId: string,
  orderId: string,
) {
  const [order, items] = await Promise.all([
    client
      .from("sales_catalog_orders")
      .select("*")
      .eq("id", orderId)
      .eq("organization_id", organizationId)
      .single(),
    client
      .from("sales_catalog_order_items")
      .select("*")
      .eq("order_id", orderId)
      .eq("organization_id", organizationId)
      .order("created_at"),
  ]);
  if (order.error || items.error || !items.data.length)
    throw new Error("Não foi possível conferir o pedido.");
  const o = order.data;
  if (!o.lead_id)
    throw new Error("Confirme seus dados antes de escolher uma oferta.");
  const lead = await client
    .from("leads")
    .select("id,phone_number")
    .eq("id", o.lead_id)
    .eq("organization_id", organizationId)
    .single();
  if (lead.error) throw new Error("Cliente não encontrado nesta loja.");
  const previous = await client
    .from("sales_catalog_orders")
    .select("id", { head: true, count: "exact" })
    .eq("organization_id", organizationId)
    .eq("lead_id", o.lead_id)
    .in("payment_status", ["confirmed", "refunded"]);
  const active = await client
    .from("commercial_agreements")
    .select("id,target_id,state,period_end")
    .eq("organization_id", organizationId)
    .eq("lead_id", o.lead_id)
    .eq("owner_type", "store")
    .eq("metadata->>recurring", "true")
    .gt("paid_cycles", 0)
    .neq("origin_order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previous.error || active.error)
    throw new Error("Não foi possível conferir o histórico do cliente.");
  const previousPurchase = Boolean(previous.count),
    inactive = Boolean(
      active.data &&
      (!active.data.period_end ||
        Date.parse(active.data.period_end) <= Date.now() ||
        ["cancelled", "ended"].includes(active.data.state)),
    );
  const operation: CampaignOperation =
    record(o.metadata).renewal === true
      ? "renewal"
      : inactive
        ? "reactivation"
        : "initial";
  return {
    order: o,
    items: items.data,
    buyerId: String(o.lead_id),
    buyerKey: String(o.lead_id),
    previousPurchase,
    inactive,
    operation,
    originId: active.data?.target_id,
    previousAgreement: active.data,
    uses: 0,
  };
}
export async function listStoreCampaignOffers(
  client: SupabaseClient,
  organizationId: string,
  orderId: string,
) {
  const ctx = await storeOrderContext(client, organizationId, orderId);
  if (ctx.order.payment_status === "confirmed") return [];
  const rows = await client
    .from("commercial_campaigns")
    .select("id,revision,configuration")
    .eq("owner_type", "store")
    .eq("organization_id", organizationId)
    .eq("configuration->>status", "active");
  const usage = await client
    .from("commercial_agreements")
    .select("campaign_id,state,consumed_at,reservation_expires_at")
    .eq("owner_type", "store")
    .eq("organization_id", organizationId)
    .eq("buyer_key", ctx.buyerKey);
  if (rows.error || usage.error)
    throw new Error("Não foi possível consultar as ofertas.");
  const offers = rows.data.flatMap((c) => {
    const cfg = parseCampaign(c.configuration),
      uses = usage.data.filter(
        (a) =>
          a.campaign_id === c.id &&
          (a.consumed_at ||
            (a.state === "reserved" &&
              Date.parse(a.reservation_expires_at) > Date.now())),
      ).length;
    const line = ctx.items.find(
      (i) =>
        !i.platform_product_id &&
        record(i.metadata).order_bump !== true &&
        isCampaignEligible(cfg, {
          ...ctx,
          targetId: String(i.catalog_item_id),
          operation: storeCampaignOperation(ctx, i, cfg),
          uses,
        }),
    );
    if (!line) return [];
    const recurring = record(line.metadata).billing_cycle === "recurring";
    if (!recurring && cfg.stages.reduce((n, s) => n + s.cycles, 0) > 1)
      return [];
    return cfg.options.map((option) => ({
      campaignId: c.id,
      optionId: option.id,
      name: cfg.name,
      description: cfg.description,
      endsAt: cfg.endsAt,
      productTitle: line.title,
      quantity: line.quantity,
      operation: storeCampaignOperation(ctx, line, cfg),
      pricing: quoteCampaign(c.id, c.revision, cfg, option.id, 0, recurring),
    }));
  });
  for (const offer of offers) {
    const result = await client.from("commercial_events").upsert(
      {
        organization_id: organizationId,
        lead_id: ctx.buyerId,
        campaign_id: offer.campaignId,
        event_key: `store-offer-view:${orderId}:${offer.campaignId}:${offer.optionId}:${new Date().toISOString().slice(0, 10)}`,
        event_type: "campaign_offer_viewed",
        payload: {
          ...offer.pricing,
          order_id: orderId,
          notice: "Oferta apresentada no checkout.",
        },
      },
      { onConflict: "event_key", ignoreDuplicates: true },
    );
    if (result.error)
      throw new Error(
        "Não foi possível registrar a oferta no arquivo do lead.",
      );
  }
  return offers;
}
export async function applyStoreCampaign(
  client: SupabaseClient,
  organizationId: string,
  orderId: string,
  campaignId: string,
  optionId: string,
) {
  const ctx = await storeOrderContext(client, organizationId, orderId);
  if (
    ["confirmed", "refunded"].includes(ctx.order.payment_status) ||
    ctx.order.status === "cancelled"
  )
    throw new Error(
      "Este pedido já foi concluído ou cancelado. Abra um novo pedido para contratar outra oferta.",
    );
  const row = await client
    .from("commercial_campaigns")
    .select("id,revision,configuration")
    .eq("id", campaignId)
    .eq("owner_type", "store")
    .eq("organization_id", organizationId)
    .single();
  if (row.error) throw new Error("Oferta não encontrada.");
  const cfg = parseCampaign(row.data.configuration);
  const line = ctx.items.find(
    (i) =>
      !i.platform_product_id &&
      record(i.metadata).order_bump !== true &&
      isCampaignEligible(cfg, {
        ...ctx,
        targetId: String(i.catalog_item_id),
        operation: storeCampaignOperation(ctx, i, cfg),
      }),
  );
  if (!line) throw new Error("Esta oferta não é válida para o pedido.");
  const recurring = record(line.metadata).billing_cycle === "recurring";
  quoteCampaign(row.data.id, row.data.revision, cfg, optionId, 0, recurring);
  const { retireCheckoutPaymentsBeforeCartChange } =
    await import("@/lib/sales-catalog/transparent-checkout");
  const reserved = await client.rpc("reserve_commercial_agreement", {
    p_campaign: campaignId,
    p_revision: row.data.revision,
    p_org: organizationId,
    p_buyer: ctx.buyerKey,
    p_user: null,
    p_lead: ctx.buyerId,
    p_target: line.catalog_item_id,
    p_option: optionId,
    p_subscription: null,
    p_order: orderId,
    p_operation: storeCampaignOperation(ctx, line, cfg),
    p_previous: ctx.previousPurchase,
    p_inactive: ctx.inactive,
    p_origin: ctx.originId ?? null,
  });
  if (reserved.error)
    throw new Error(
      "A oferta expirou, já foi utilizada ou não é válida para este cliente.",
    );
  const revisionToken = randomUUID();
  const held = await client.rpc("hold_store_campaign_revision", {
    p_order: orderId,
    p_org: organizationId,
    p_token: revisionToken,
  });
  if (held.error)
    throw new Error(
      "Há um pagamento ou alteração em andamento. Aguarde antes de trocar a oferta.",
    );
  try {
    await retireCheckoutPaymentsBeforeCartChange(
      client,
      organizationId,
      orderId,
    );
    const revised = await client.rpc("revise_store_campaign_order", {
      p_order: orderId,
      p_agreement: reserved.data,
      p_token: revisionToken,
    });
    if (revised.error)
      throw new Error(
        "Não foi possível revisar a renovação. A cobrança anterior permanece suspensa para conferência.",
      );
    const payableOrderId = String(revised.data);
    const payableContext =
      payableOrderId === orderId
        ? ctx
        : await storeOrderContext(client, organizationId, payableOrderId);
    const payableLine = payableContext.items.find(
      (i) => i.catalog_item_id === line.catalog_item_id,
    );
    if (!payableLine)
      throw new Error("O produto mudou durante a revisão. Confira o pedido.");
    await prepareStoreReplacement(
      client,
      payableContext,
      String(reserved.data),
      payableLine,
      cfg,
    );
    const result = await client.rpc("apply_store_campaign_period", {
      p_agreement: reserved.data,
      p_order: payableOrderId,
      p_cycle: 0,
      p_item: payableLine.id,
    });
    if (result.error)
      throw new Error(
        "O pagamento está em andamento ou o pedido mudou. Confira antes de tentar novamente.",
      );
    const released = await client.rpc("release_store_campaign_revision", {
      p_order: payableOrderId,
      p_token: revisionToken,
    });
    if (released.error)
      throw new Error("A atualização da oferta precisa de conferência.");
    if (payableOrderId !== orderId) {
      const originalReleased = await client.rpc(
        "release_store_campaign_revision",
        { p_order: orderId, p_token: revisionToken },
      );
      if (originalReleased.error)
        throw new Error(
          "A revisão da cobrança anterior precisa de conferência.",
        );
    }
    return { pricing: result.data as CampaignPricing, orderId: payableOrderId };
  } catch (error) {
    await client.from("commercial_events").upsert(
      {
        organization_id: organizationId,
        lead_id: ctx.buyerId,
        agreement_id: reserved.data,
        campaign_id: campaignId,
        event_key: `store-revision-review:${revisionToken}`,
        event_type: "payment_review_required",
        payload: {
          order_id: orderId,
          notice:
            "A alteração da oferta aguarda conferência financeira. Não iniciar outro pagamento até a conciliação.",
        },
      },
      { onConflict: "event_key", ignoreDuplicates: true },
    );
    throw error;
  }
}

/** Persist the recurring agreement before generating any charge. Avulsos keep the existing path. */
export async function ensureStoreRecurringAgreement(
  client: SupabaseClient,
  organizationId: string,
  orderId: string,
) {
  const rows = await client
    .from("sales_catalog_order_items")
    .select("*")
    .eq("order_id", orderId)
    .eq("organization_id", organizationId);
  if (rows.error)
    throw new Error("Não foi possível conferir a recorrência do pedido.");
  const recurring = rows.data.filter(
    (i) => record(i.metadata).billing_cycle === "recurring",
  );
  if (!recurring.length) return null;
  if (recurring.length > 1)
    throw new Error(
      "Finalize uma assinatura por checkout. Os produtos avulsos podem acompanhar a primeira cobrança.",
    );
  const line = recurring[0];
  if (line.platform_product_id)
    throw new Error(
      "Esta assinatura da ConnectyHub deve ser contratada no painel.",
    );
  const ctx = await storeOrderContext(client, organizationId, orderId);
  const linked = await client
    .from("commercial_agreement_periods")
    .select("agreement_id,pricing")
    .eq("order_id", orderId)
    .maybeSingle();
  if (linked.error) throw new Error("Não foi possível conferir o contrato.");
  if (linked.data)
    return {
      id: linked.data.agreement_id as string,
      pricing: linked.data.pricing as CampaignPricing,
    };
  const product = await client
    .from("intelligence_memory")
    .select("id,organization_id,title,content,metadata,created_at,updated_at")
    .eq("id", line.catalog_item_id)
    .eq("organization_id", organizationId)
    .eq("memory_type", "sales_catalog_item")
    .single();
  if (product.error) throw new Error("Produto não encontrado.");
  const catalog = mapSalesCatalogItem(product.data);
  if (catalog.billingCycle !== "recurring")
    throw new Error("A recorrência deste produto mudou. Gere um novo pedido.");
  const interval = catalog.billingInterval as CampaignInterval,
    price = (normalizeCurrencyAmount(line.total) ?? 0) / (line.quantity ?? 1);
  const cfg: CampaignConfig = {
    name: line.title,
    description: "Assinatura da loja",
    status: "active",
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 36500 * 86400000).toISOString(),
    targetIds: [line.catalog_item_id],
    originIds: [],
    audience: "all",
    buyerIds: [],
    operations: ["initial", "renewal"],
    maxUses: 1,
    stages: [],
    options: [{ id: interval, interval, price, permanentDiscount: 0 }],
    message: "",
  };
  const result = await client.from("commercial_agreements").upsert(
    {
      organization_id: organizationId,
      owner_type: "store",
      buyer_key: ctx.buyerKey,
      lead_id: ctx.buyerId,
      configuration: cfg,
      option_id: interval,
      target_id: line.catalog_item_id,
      origin_order_id: orderId,
      metadata: { recurring: true },
    },
    { onConflict: "origin_order_id", ignoreDuplicates: true },
  );
  if (result.error && result.error.code !== "23505")
    throw new Error("Não foi possível registrar a assinatura.");
  const agreement = await client
    .from("commercial_agreements")
    .select("id")
    .eq("origin_order_id", orderId)
    .eq("organization_id", organizationId)
    .single();
  if (agreement.error)
    throw new Error("Não foi possível registrar a assinatura.");
  await prepareStoreReplacement(client, ctx, agreement.data.id, line);
  const pricing = await client.rpc("apply_store_campaign_period", {
    p_agreement: agreement.data.id,
    p_order: orderId,
    p_cycle: 0,
    p_item: line.id,
  });
  if (pricing.error)
    throw new Error("Não foi possível preparar o pagamento recorrente.");
  return {
    id: agreement.data.id as string,
    pricing: pricing.data as CampaignPricing,
  };
}

function storeCampaignOperation(
  ctx: Awaited<ReturnType<typeof storeOrderContext>>,
  line: Record<string, unknown>,
  cfg?: CampaignConfig,
): CampaignOperation {
  if (record(line.metadata).billing_cycle !== "recurring") return "initial";
  if (ctx.previousAgreement) {
    if (ctx.inactive) return "reactivation";
    return ctx.originId === String(line.catalog_item_id)
      ? "renewal"
      : cfg?.operations.includes("upgrade")
        ? "upgrade"
        : "initial";
  }
  return ctx.operation;
}
async function prepareStoreReplacement(
  client: SupabaseClient,
  ctx: Awaited<ReturnType<typeof storeOrderContext>>,
  agreementId: string,
  line: Record<string, unknown>,
  cfg?: CampaignConfig,
) {
  const previous = ctx.previousAgreement;
  if (
    !previous ||
    previous.id === agreementId ||
    record(line.metadata).billing_cycle !== "recurring"
  )
    return;
  const operation = storeCampaignOperation(ctx, line, cfg);
  if (operation === "initial") return;
  const held = await client.rpc("prepare_store_agreement_replacement", {
    p_agreement: agreementId,
    p_previous: previous.id,
    p_operation: operation,
  });
  if (held.error)
    throw new Error(
      "Já há uma alteração desta assinatura em andamento. Confira a contratação anterior.",
    );
  const periods = await client
    .from("commercial_agreement_periods")
    .select("order_id")
    .eq("agreement_id", previous.id)
    .is("paid_at", null);
  if (periods.error)
    throw new Error("Não foi possível conferir as cobranças anteriores.");
  const { retireCheckoutPaymentsBeforeCartChange } =
    await import("@/lib/sales-catalog/transparent-checkout");
  for (const period of periods.data) {
    if (period.order_id && period.order_id !== ctx.order.id)
      await retireCheckoutPaymentsBeforeCartChange(
        client,
        ctx.order.organization_id,
        period.order_id,
      );
  }
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCampaignEligible,
  parseCampaign,
  quoteCampaign,
  type CampaignConfig,
  type CampaignOperation,
  type CampaignPricing,
} from "./campaigns";
type Json = Record<string, unknown>;
export type CampaignRow = {
  id: string;
  revision: number;
  configuration: CampaignConfig;
};

export async function platformCampaignContext(
  client: SupabaseClient,
  organizationId: string,
  targetId: string,
  subscriptionId?: string,
) {
  const organization = await client
    .from("organizations")
    .select("owner_id,plan_code,status")
    .eq("id", organizationId)
    .single();
  if (organization.error) throw new Error("Não foi possível conferir a conta.");
  const companies = await client
    .from("organizations")
    .select("id")
    .eq("owner_id", organization.data.owner_id);
  if (companies.error) throw new Error("Não foi possível conferir a conta.");
  const previous = await client
    .from("billing_payments")
    .select("id", { count: "exact", head: true })
    .in(
      "organization_id",
      companies.data.map((r) => r.id),
    )
    .or("paid_at.not.is.null,status.in.(approved,refunded,charged_back)");
  if (previous.error)
    throw new Error("Não foi possível conferir o histórico de compras.");
  const productTarget = /^[0-9a-f-]{36}$/i.test(targetId);
  let query = client
    .from("organization_subscriptions")
    .select("plan_code,status,current_period_end,metadata")
    .eq("organization_id", organizationId);
  query = subscriptionId
    ? query.eq("id", subscriptionId)
    : productTarget
      ? query
          .eq("subscription_kind", "product")
          .eq("metadata->>purchase_product_id", targetId)
      : query.eq("subscription_kind", "plan");
  const subscription = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscription.error)
    throw new Error("Não foi possível conferir a assinatura.");
  let current = subscription.data;
  if (current && ["pending", "incomplete"].includes(current.status)) {
    let prior = client
      .from("organization_subscriptions")
      .select("plan_code,status,current_period_end,metadata")
      .eq("organization_id", organizationId)
      .not("status", "in", "(pending,incomplete)");
    prior = productTarget
      ? prior
          .eq("subscription_kind", "product")
          .eq("metadata->>purchase_product_id", targetId)
      : prior.eq("subscription_kind", "plan");
    const previousSubscription = await prior
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousSubscription.error)
      throw new Error("Não foi possível conferir o contrato anterior.");
    if (previousSubscription.data) current = previousSubscription.data;
  }
  const s = current,
    previousPurchase = Boolean(previous.count),
    inactive = Boolean(
      s &&
      (!s.current_period_end ||
        Date.parse(s.current_period_end) <= Date.now()) &&
      !["pending", "incomplete"].includes(s.status),
    );
  const originId = productTarget
    ? String((s?.metadata as Json | undefined)?.purchase_product_id ?? targetId)
    : (s?.plan_code ?? organization.data.plan_code);
  const operation: CampaignOperation = inactive
    ? "reactivation"
    : s &&
        originId !== targetId &&
        !["pending", "incomplete"].includes(s.status)
      ? "upgrade"
      : s && !["pending", "incomplete"].includes(s.status)
        ? "renewal"
        : "initial";
  return {
    buyerId: String(organization.data.owner_id),
    targetId,
    originId,
    previousPurchase,
    inactive,
    operation,
    uses: 0,
  };
}
export async function listPlatformCampaignOffers(
  client: SupabaseClient,
  organizationId: string,
  targetId: string,
  subscriptionId?: string,
) {
  const context = await platformCampaignContext(
    client,
    organizationId,
    targetId,
    subscriptionId,
  );
  const productTarget = /^[0-9a-f-]{36}$/i.test(targetId);
  const target = productTarget
    ? await client
        .from("platform_products")
        .select("billing_cycle")
        .eq("id", targetId)
        .eq("owner_type", "connectyhub")
        .eq("sales_channel_type", "direct")
        .eq("status", "active")
        .single()
    : await client
        .from("billing_plans")
        .select("billing_cycle")
        .eq("plan_code", targetId)
        .eq("status", "active")
        .single();
  if (target.error) return [];
  const recurring = target.data.billing_cycle !== "one_time";
  const rows = await client
    .from("commercial_campaigns")
    .select("id,revision,configuration")
    .eq("owner_type", "platform")
    .is("organization_id", null)
    .eq("configuration->>status", "active");
  if (rows.error) throw new Error("Não foi possível consultar as ofertas.");
  const usage = await client
    .from("commercial_agreements")
    .select("campaign_id,state,consumed_at,reservation_expires_at")
    .eq("owner_type", "platform")
    .eq("buyer_key", context.buyerId);
  if (usage.error)
    throw new Error("Não foi possível conferir a elegibilidade.");
  const offers = (rows.data as CampaignRow[]).flatMap((row) => {
    const config = parseCampaign(row.configuration);
    const uses = usage.data.filter(
      (a) =>
        a.campaign_id === row.id &&
        (a.consumed_at ||
          (a.state === "reserved" &&
            Date.parse(a.reservation_expires_at) > Date.now())),
    ).length;
    if (!isCampaignEligible(config, { ...context, uses })) return [];
    if (!recurring && config.stages.reduce((n, s) => n + s.cycles, 0) > 1)
      return [];
    return config.options.map((option) => ({
      campaignId: row.id,
      revision: row.revision,
      optionId: option.id,
      targetId,
      name: config.name,
      description: config.description,
      endsAt: config.endsAt,
      operation: context.operation,
      pricing: quoteCampaign(
        row.id,
        row.revision,
        config,
        option.id,
        0,
        recurring,
      ),
    }));
  });
  for (const offer of offers) {
    const result = await client.from("commercial_events").upsert(
      {
        organization_id: organizationId,
        buyer_user_id: context.buyerId,
        campaign_id: offer.campaignId,
        event_key: `offer-view:${context.buyerId}:${offer.campaignId}:${offer.optionId}:${new Date().toISOString().slice(0, 10)}`,
        event_type: "campaign_offer_viewed",
        payload: {
          ...offer.pricing,
          target_id: targetId,
          notice: "Oferta apresentada no painel do cliente.",
        },
      },
      { onConflict: "event_key", ignoreDuplicates: true },
    );
    if (result.error)
      throw new Error("Não foi possível registrar a oferta no histórico.");
  }
  return offers;
}
export async function preparePlatformCampaign(
  client: SupabaseClient,
  paymentId: string,
  selection?: { campaignId: string; optionId: string },
): Promise<CampaignPricing | null> {
  const payment = await client
    .from("billing_payments")
    .select("id,organization_id,subscription_id,status,payload")
    .eq("id", paymentId)
    .single();
  if (payment.error)
    throw new Error("Não foi possível conferir a oferta desta cobrança.");
  const p = payment.data,
    payload = (p.payload ?? {}) as Json;
  if (payload.campaign_pricing) {
    const accepted = payload.campaign_pricing as CampaignPricing;
    if (
      !selection ||
      (accepted.campaign_id === selection.campaignId &&
        accepted.option_id === selection.optionId)
    )
      return accepted;
  }
  if (!["pending", "rejected"].includes(p.status)) {
    if (!selection) return null;
    throw new Error(
      "Esta cobrança já foi concluída ou está em processamento. Aguarde a confirmação antes de escolher outra oferta.",
    );
  }
  const selected =
    selection ??
    (payload.checkout_kind !== "renewal"
      ? (payload.campaign_selection as
          { campaignId: string; optionId: string } | undefined)
      : undefined);
  let agreement: { id: string; paid_cycles: number } | null = null;
  let payableId = paymentId;
  if (selected) {
    const subscription = await client
      .from("organization_subscriptions")
      .select("provider_subscription_id")
      .eq("id", p.subscription_id)
      .eq("organization_id", p.organization_id)
      .single();
    if (subscription.error)
      throw new Error("Não foi possível conferir a renovação anterior.");
    if (subscription.data.provider_subscription_id?.startsWith("sub_"))
      throw new Error(
        "A assinatura anterior ainda possui renovação no provedor. O financeiro precisa migrá-la para a cobrança gerenciada antes de aplicar esta campanha.",
      );
  }
  if (selected?.campaignId) {
    const c = await client
      .from("commercial_campaigns")
      .select("id,revision,configuration")
      .eq("id", selected.campaignId)
      .eq("owner_type", "platform")
      .is("organization_id", null)
      .single();
    if (c.error) throw new Error("Oferta não encontrada.");
    const targetId = String(
      payload.purchase_product_id ??
        payload.target_plan_code ??
        payload.requested_plan_code ??
        "",
    );
    const context = await platformCampaignContext(
      client,
      p.organization_id,
      targetId,
      p.subscription_id,
    );
    const cfg = parseCampaign(c.data.configuration);
    quoteCampaign(c.data.id, c.data.revision, cfg, selected.optionId);
    if (!isCampaignEligible(cfg, context))
      throw new Error("Esta oferta não está disponível para esta contratação.");
    const reserved = await client.rpc("reserve_commercial_agreement", {
      p_campaign: c.data.id,
      p_revision: c.data.revision,
      p_org: p.organization_id,
      p_buyer: context.buyerId,
      p_user: context.buyerId,
      p_lead: null,
      p_target: targetId,
      p_option: selected.optionId,
      p_subscription: p.subscription_id,
      p_order: null,
      p_operation: context.operation,
      p_previous: context.previousPurchase,
      p_inactive: context.inactive,
      p_origin: context.originId,
    });
    if (reserved.error)
      throw new Error(
        "A oferta expirou, já foi utilizada ou não está disponível para esta conta.",
      );
    agreement = { id: reserved.data as string, paid_cycles: 0 };
    const attempts = await client
      .from("billing_card_attempts")
      .select("id")
      .eq("payment_id", p.id)
      .limit(1);
    if (attempts.error)
      throw new Error("Não foi possível conferir as tentativas anteriores.");
    const provider = await client
      .from("billing_payments")
      .select("provider_payment_id,provider")
      .eq("id", p.id)
      .single();
    if (provider.error)
      throw new Error("Não foi possível conferir a cobrança anterior.");
    if (
      provider.data.provider_payment_id ||
      attempts.data.length ||
      payload.campaign_pricing
    ) {
      const held = await client.rpc("hold_commercial_invoice_revision", {
        p_payment: p.id,
      });
      if (held.error)
        throw new Error(
          "O pagamento está em processamento ou conferência. Aguarde antes de trocar a oferta.",
        );
      if (provider.data.provider_payment_id) {
        if (provider.data.provider !== "asaas")
          throw new Error(
            "A cobrança anterior precisa ser encerrada pelo financeiro antes da troca.",
          );
        const { loadAsaasPlatformBillingConfig } =
          await import("@/lib/sales-catalog/asaas");
        const { retireAsaasPayment } =
          await import("@/lib/sales-catalog/asaas-direct");
        await retireAsaasPayment(
          await loadAsaasPlatformBillingConfig({ client }),
          provider.data.provider_payment_id,
          !provider.data.provider_payment_id.startsWith("pay_"),
        );
      }
      const revised = await client.rpc("replace_commercial_invoice", {
        p_payment: p.id,
        p_agreement: agreement.id,
      });
      if (revised.error)
        throw new Error(
          "A cobrança mudou durante a conferência. Aguarde a atualização financeira.",
        );
      payableId = String(revised.data);
    }
  } else if (payload.checkout_kind === "renewal") {
    const active = await client
      .from("commercial_agreements")
      .select("id,paid_cycles,target_id")
      .eq("platform_subscription_id", p.subscription_id)
      .eq("organization_id", p.organization_id)
      .eq("state", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active.error)
      throw new Error("Não foi possível conferir o benefício contratado.");
    if (
      active.data &&
      active.data.target_id ===
        String(
          payload.purchase_product_id ??
            payload.target_plan_code ??
            payload.requested_plan_code,
        )
    )
      agreement = active.data;
  }
  if (!agreement) return null;
  const applied = await client.rpc("apply_platform_campaign_period", {
    p_agreement: agreement.id,
    p_payment: payableId,
    p_cycle: agreement.paid_cycles,
  });
  if (applied.error)
    throw new Error(
      "O pagamento já foi iniciado ou a oferta precisa ser conferida antes de alterar o valor.",
    );
  return applied.data as CampaignPricing;
}

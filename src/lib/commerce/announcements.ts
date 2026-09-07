import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseCampaign,
  isCampaignEligible,
  campaignPriceNotice,
  quoteCampaign,
  type CampaignConfig,
  type CampaignOperation,
} from "./campaigns";
import { platformCampaignContext } from "./platform-campaigns";
import { record } from "@/lib/sales-catalog/card-input";
import { getAppBaseUrl } from "@/lib/sales-catalog/mercado-pago";

type Recipient = {
  id: string;
  name: string;
  phone: string;
  organizationId: string;
};
export async function previewCampaignAnnouncement(
  client: SupabaseClient,
  campaignId: string,
  buyerIds: string[],
  at = Date.now(),
) {
  if (!buyerIds.length || buyerIds.length > 300)
    throw new Error(
      "Selecione de 1 a 300 destinatários para conferir o público.",
    );
  const row = await client
    .from("commercial_campaigns")
    .select("id,revision,owner_type,organization_id,configuration")
    .eq("id", campaignId)
    .single();
  if (row.error) throw new Error("Campanha não encontrada.");
  const campaign = row.data,
    config = parseCampaign(campaign.configuration);
  if (
    config.status !== "active" ||
    at < Date.parse(config.startsAt) ||
    at >= Date.parse(config.endsAt)
  )
    throw new Error(
      "A divulgação precisa ocorrer durante a vigência da campanha ativa.",
    );
  const recipients: Recipient[] = [];
  async function evaluateBuyer(buyerId: string): Promise<Recipient | null> {
    let recipient: Recipient | null = null;
    if (campaign.owner_type === "platform") {
      const profile = await client
        .from("profiles")
        .select("id,full_name,phone_normalized,phone_verified_at")
        .eq("id", buyerId)
        .maybeSingle();
      if (profile.error)
        throw new Error("Não foi possível conferir o destinatário.");
      if (!profile.data?.phone_verified_at || !profile.data.phone_normalized)
        return null;
      const identity = await client
        .from("platform_customer_identities")
        .select("lead_id")
        .eq("user_id", buyerId);
      if (identity.error)
        throw new Error(
          "Não foi possível conferir as preferências de contato.",
        );
      if (identity.data.length) {
        const leads = await client
          .from("leads")
          .select("status,metadata")
          .in(
            "id",
            identity.data.map((i) => i.lead_id),
          );
        if (leads.error)
          throw new Error(
            "Não foi possível conferir as preferências de contato.",
          );
        if (
          leads.data.some(
            (l) => l.status === "archived" || record(l.metadata).opt_out,
          )
        )
          return null;
      }
      const orgs = await client
        .from("organizations")
        .select("id")
        .eq("owner_id", buyerId)
        .is("billing_organization_id", null)
        .neq("plan_code", "internal");
      if (orgs.error) throw new Error("Não foi possível conferir a conta.");
      for (const org of orgs.data) {
        for (const target of config.targetIds) {
          const context = await platformCampaignContext(client, org.id, target);
          if (isCampaignEligible(config, { ...context, now: at })) {
            recipient = {
              id: buyerId,
              name: profile.data.full_name ?? "Cliente",
              phone: profile.data.phone_normalized,
              organizationId: org.id,
            };
            break;
          }
        }
        if (recipient) break;
      }
    } else {
      const lead = await client
        .from("leads")
        .select("id,display_name,phone_number,status,metadata")
        .eq("id", buyerId)
        .eq("organization_id", campaign.organization_id)
        .maybeSingle();
      if (lead.error) throw new Error("Não foi possível conferir o lead.");
      if (
        !lead.data?.phone_number ||
        lead.data.status === "archived" ||
        record(lead.data.metadata).opt_out
      )
        return null;
      const previous = await client
        .from("sales_catalog_orders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", campaign.organization_id)
        .eq("lead_id", buyerId)
        .in("payment_status", ["confirmed", "refunded"]);
      const active = await client
        .from("commercial_agreements")
        .select("target_id,period_end,state")
        .eq("organization_id", campaign.organization_id)
        .eq("lead_id", buyerId)
        .eq("owner_type", "store")
        .eq("metadata->>recurring", "true")
        .gt("paid_cycles", 0)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previous.error || active.error)
        throw new Error("Não foi possível conferir o histórico do lead.");
      const inactive = Boolean(
        active.data &&
        (Date.parse(active.data.period_end) <= at ||
          ["cancelled", "ended"].includes(active.data.state)),
      );
      for (const targetId of config.targetIds) {
        const operation: CampaignOperation = inactive
          ? "reactivation"
          : active.data
            ? active.data.target_id === targetId
              ? "renewal"
              : config.operations.includes("upgrade")
                ? "upgrade"
                : "initial"
            : "initial";
        if (
          isCampaignEligible(config, {
            targetId,
            originId: active.data?.target_id,
            buyerId,
            previousPurchase: Boolean(previous.count),
            inactive,
            operation,
            uses: 0,
            now: at,
          })
        ) {
          recipient = {
            id: buyerId,
            name: lead.data.display_name ?? "Cliente",
            phone: lead.data.phone_number,
            organizationId: campaign.organization_id,
          };
          break;
        }
      }
    }
    if (!recipient) return null;
    let usage = client
      .from("commercial_agreements")
      .select("id,state,consumed_at,reservation_expires_at")
      .eq("campaign_id", campaignId)
      .eq("buyer_key", buyerId);
    if (campaign.owner_type === "store")
      usage = usage.eq("organization_id", campaign.organization_id);
    const used = await usage;
    if (used.error)
      throw new Error("Não foi possível conferir o uso da campanha.");
    if (
      used.data.filter(
        (a) =>
          a.consumed_at ||
          (a.state === "reserved" && Date.parse(a.reservation_expires_at) > at),
      ).length >= config.maxUses
    )
      return null;
    return recipient;
  }
  const uniqueBuyers = [...new Set(buyerIds)];
  for (let start = 0; start < uniqueBuyers.length; start += 6) {
    const batch = await Promise.all(
      uniqueBuyers.slice(start, start + 6).map(evaluateBuyer),
    );
    for (const recipient of batch) {
      if (recipient && !recipients.some((r) => r.phone === recipient.phone))
        recipients.push(recipient);
    }
  }
  const targetRows =
    campaign.owner_type === "store"
      ? await client
          .from("intelligence_memory")
          .select("metadata")
          .eq("organization_id", campaign.organization_id)
          .in("id", config.targetIds)
      : await client
          .from("billing_plans")
          .select("billing_cycle")
          .in("plan_code", config.targetIds);
  if (targetRows.error)
    throw new Error("Não foi possível conferir os produtos da divulgação.");
  const allRecurring =
    targetRows.data.length === config.targetIds.length &&
    targetRows.data.every(
      (t) =>
        (record(t).billing_cycle ??
          record(record(t).metadata).billing_cycle) === "recurring",
    );
  const message = announcementText(
    config,
    campaign.owner_type === "platform",
    allRecurring,
  );
  return { campaign, recipients, message };
}

function announcementText(
  config: CampaignConfig,
  platform: boolean,
  recurring: boolean,
) {
  return [
    config.message || config.description || config.name,
    ...(recurring
      ? config.options.map((option) =>
          campaignPriceNotice(quoteCampaign("preview", 1, config, option.id)),
        )
      : [
          "Confira os preços, os períodos e os produtos participantes antes de contratar.",
        ]),
    `Adesão até ${new Date(config.endsAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília).`,
    platform
      ? config.targetIds
          .map((id) =>
            /^[0-9a-f-]{36}$/i.test(id)
              ? `${getAppBaseUrl()}/dashboard/meus-produtos/comprar/${id}`
              : `${getAppBaseUrl()}/dashboard/planos`,
          )
          .filter((url, i, all) => all.indexOf(url) === i)
          .join("\n")
      : "Responda por aqui para conferir os produtos e as condições disponíveis para você.",
  ].join("\n\n");
}

export async function recheckCommercialAnnouncement(
  client: SupabaseClient,
  metadata: Record<string, unknown>,
  scope: string,
  organizationId: string | null,
) {
  const announcement = record(metadata.commercial_campaign);
  const result = await previewCampaignAnnouncement(
    client,
    String(announcement.campaign_id),
    Array.isArray(announcement.buyer_ids)
      ? announcement.buyer_ids.map(String)
      : [],
  );
  if (
    result.campaign.revision !== announcement.revision ||
    (scope === "organization"
      ? result.campaign.organization_id !== organizationId
      : result.campaign.owner_type !== "platform")
  )
    throw new Error("A campanha mudou. Confira e reprograme a divulgação.");
  if (!result.recipients.length)
    throw new Error(
      "Nenhum destinatário continua elegível para esta divulgação.",
    );
  return result;
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { campaignPriceNotice, parseCampaign, quoteCampaign } from "./campaigns";
export async function loadLeadCommercialContext(
  client: SupabaseClient,
  organizationId: string,
  leadId: string,
) {
  const [contracts, events, campaigns] = await Promise.all([
    client
      .from("commercial_agreements")
      .select(
        "id,target_id,campaign_id,campaign_revision,configuration,option_id,state,paid_cycles,period_end,cancel_at_period_end,metadata",
      )
      .eq("organization_id", organizationId)
      .eq("lead_id", leadId)
      .eq("owner_type", "store")
      .order("created_at", { ascending: false })
      .limit(12),
    client
      .from("commercial_events")
      .select("event_type,payload,created_at")
      .eq("organization_id", organizationId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(12),
    client
      .from("commercial_campaigns")
      .select("id,revision,configuration")
      .eq("owner_type", "store")
      .eq("organization_id", organizationId)
      .eq("configuration->>status", "active")
      .limit(40),
  ]);
  if (contracts.error || events.error || campaigns.error)
    throw new Error("Condições comerciais temporariamente indisponíveis.");
  return JSON.stringify({
    checkedAt: new Date().toISOString(),
    contracts: contracts.data.map((a) => {
      const q = quoteCampaign(
        a.campaign_id ?? a.id,
        a.campaign_revision ?? 1,
        parseCampaign(a.configuration),
        a.option_id,
        a.paid_cycles,
        a.metadata?.recurring !== false,
      );
      return {
        id: a.id,
        productId: a.target_id,
        state: a.state,
        paidPeriods: a.paid_cycles,
        paidUntil: a.period_end,
        cancelled: a.cancel_at_period_end,
        nextInvoice:
          a.cancel_at_period_end || a.state === "ended"
            ? "Sem próximas cobranças autorizadas."
            : campaignPriceNotice(q),
      };
    }),
    events: events.data,
    campaigns: campaigns.data
      .filter(
        (c) =>
          Date.now() >= Date.parse(c.configuration.startsAt) &&
          Date.now() < Date.parse(c.configuration.endsAt) &&
          (c.configuration.audience !== "selected" || c.configuration.buyerIds.includes(leadId)),
      )
      .map((c) => ({
        name: c.configuration.name,
        description: c.configuration.description,
        targetIds: c.configuration.targetIds,
        validUntil: c.configuration.endsAt,
        audience: c.configuration.audience,
        operations: c.configuration.operations,
        eligibility:
          "O checkout confere o histórico do comprador antes de aplicar.",
        periods: c.configuration.options.map((o: { id: string }) =>
          campaignPriceNotice(
            quoteCampaign(c.id, c.revision, c.configuration, o.id),
          ),
        ),
      })),
    guidance:
      "Condições da própria empresa. Só informe como contratado o que constar no contrato. Campanhas do catálogo dependem de elegibilidade, não prometa desconto indisponível. O cliente pode escolher períodos e benefícios no checkout. Recusa ou comprovante não confirma pagamento. Descreva a próxima cobrança, a duração do benefício e o preço posterior. Uma tentativa repetida não consome outra mensalidade. Cancelamento de renovação não apaga o período pago. Não use dados de outra empresa.",
  });
}

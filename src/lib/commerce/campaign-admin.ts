import { previewCampaignAnnouncement } from "./announcements";
import {
  queueWhatsappSimpleCampaign,
  resolveCommercialAnnouncementContext,
} from "@/lib/whatsapp/channel-operations";
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { assertContractAccess } from "@/lib/billing/contract-access";
import { cancelStoreAgreement } from "./store-cancellation";
import { parseCampaign } from "./campaigns";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";

export function campaignAdminHandlers(owner: "platform" | "store") {
  async function access() {
    const client = createServiceClient();
    if (owner === "platform") {
      const auth = await requirePlatformAdmin();
      if (auth instanceof NextResponse) return auth;
      return { client, organizationId: null, userId: auth.userId };
    }
    const workspace = await getCurrentWorkspace({ allowRestricted: true });
    if (!workspace?.organization)
      return NextResponse.json(
        { error: "Entre no painel de uma empresa." },
        { status: 401 },
      );
    const company = await requireClientCompanyAccess({
      client,
      userId: workspace.user.id,
      companyId: workspace.organization.id,
    });
    await assertContractAccess(company.id, client);
    return { client, organizationId: company.id, userId: workspace.user.id };
  }
  async function handle(request: NextRequest, save: boolean) {
    try {
      const auth = await access();
      if (auth instanceof NextResponse) return auth;
      const { client, organizationId, userId } = auth;
      const catalogQuery =
        owner === "platform"
          ? client
              .from("billing_plans")
              .select(
                "id,plan_code,name,monthly_price_brl,billing_cycle,billing_interval",
              )
              .eq("offer_kind", "plan")
              .neq("plan_code", "trial")
              .neq("plan_code", "internal")
          : client
              .from("intelligence_memory")
              .select("id,title,metadata")
              .eq("organization_id", organizationId!)
              .eq("memory_type", "sales_catalog_item");
      const catalog = await catalogQuery.limit(500);
      if (catalog.error)
        throw new Error("Não foi possível consultar o catálogo.");
      const targets = (catalog.data ?? [])
        .map((row) => {
          const r = row as unknown as Record<string, unknown>,
            meta = r.metadata as Record<string, unknown> | undefined;
          return {
            id: String(r.plan_code ?? r.id),
            name: String(r.name ?? r.title),
            price:
              normalizeCurrencyAmount(
                String(r.monthly_price_brl ?? meta?.price ?? "0"),
              ) ?? 0,
            recurring: (r.billing_cycle ?? meta?.billing_cycle) === "recurring",
            interval: String(
              r.billing_interval ?? meta?.billing_interval ?? "month",
            ),
            platformProduct: Boolean(meta?.platform_product_id),
          };
        })
        .filter((row) => !row.platformProduct);
      if (owner === "platform") {
        const products = await client
          .from("platform_products")
          .select("id,name,price,billing_cycle,billing_interval")
          .eq("owner_type", "connectyhub")
          .eq("sales_channel_type", "direct")
          .eq("status", "active")
          .limit(300);
        if (products.error)
          throw new Error("Não foi possível consultar os produtos.");
        for (const p of products.data)
          targets.push({
            id: p.id,
            name: p.name,
            price: normalizeCurrencyAmount(p.price) ?? 0,
            recurring: p.billing_cycle === "recurring",
            interval: p.billing_interval ?? "month",
            platformProduct: false,
          });
      }
      if (save) {
        const body = await request.json();
        if (body.action === "cancel_subscription" && organizationId)
          return NextResponse.json(
            await cancelStoreAgreement(
              client,
              organizationId,
              String(body.agreementId),
            ),
          );
        if (
          ["preview_announcement", "schedule_announcement"].includes(
            body.action,
          )
        ) {
          const campaign = await client
            .from("commercial_campaigns")
            .select("id,revision")
            .eq("id", body.id)
            .eq("owner_type", owner)
            .or(
              organizationId
                ? `organization_id.eq.${organizationId}`
                : "organization_id.is.null",
            )
            .single();
          if (
            campaign.error ||
            campaign.data.revision !== Number(body.revision)
          )
            throw new Error("Salve e confira a versão atual da campanha.");
          const at = Date.parse(String(body.scheduledFor));
          if (!Number.isFinite(at) || at < Date.now())
            throw new Error("Escolha uma data futura para divulgar.");
          const preview = await previewCampaignAnnouncement(
            client,
            campaign.data.id,
            Array.isArray(body.buyerIds) ? body.buyerIds.map(String) : [],
            at,
          );
          const context = await resolveCommercialAnnouncementContext(
            client,
            String(body.instanceId),
            owner,
            organizationId,
          );
          const limit = context.behavior.whatsappCampaignBatchSize;
          if (body.action === "preview_announcement")
            return NextResponse.json({
              recipients: preview.recipients.map(({ id, name }) => ({
                id,
                name,
              })),
              message: preview.message,
              limit,
            });
          if (!preview.recipients.length || preview.recipients.length > limit)
            throw new Error(
              `Selecione até ${limit} destinatários elegíveis por divulgação.`,
            );
          const queued = await queueWhatsappSimpleCampaign(client, context, {
            title: preview.campaign.configuration.name,
            text: preview.message,
            numbers: preview.recipients.map((r) => r.phone),
            scheduledFor: new Date(at).toISOString(),
            commercialCampaign: {
              campaign_id: campaign.data.id,
              revision: campaign.data.revision,
              buyer_ids: preview.recipients.map((r) => r.id),
              recipients: preview.recipients,
            },
          });
          return NextResponse.json({
            ok: true,
            queued,
            message:
              "Divulgação agendada. O público e a vigência serão conferidos novamente antes do envio.",
          });
        }
        const configuration = parseCampaign(body.configuration);
        if (
          configuration.targetIds.some(
            (id) => !targets.some((t) => t.id === id),
          )
        )
          return NextResponse.json(
            {
              error: "Escolha apenas produtos e planos próprios desta empresa.",
            },
            { status: 422 },
          );
        if (
          configuration.stages.reduce((n, s) => n + s.cycles, 0) > 1 &&
          configuration.targetIds.some(
            (id) => !targets.find((t) => t.id === id)?.recurring,
          )
        )
          return NextResponse.json(
            {
              error:
                "Várias mensalidades promocionais exigem produtos recorrentes.",
            },
            { status: 422 },
          );
        if (configuration.buyerIds.length) {
          const buyers =
            owner === "platform"
              ? await client
                  .from("profiles")
                  .select("id")
                  .in("id", configuration.buyerIds)
              : await client
                  .from("leads")
                  .select("id")
                  .eq("organization_id", organizationId!)
                  .in("id", configuration.buyerIds);
          if (
            buyers.error ||
            buyers.data?.length !== configuration.buyerIds.length
          )
            return NextResponse.json(
              { error: "Selecione clientes desta empresa." },
              { status: 422 },
            );
        }
        const write = body.id
          ? client
              .from("commercial_campaigns")
              .update({ configuration, created_by: userId })
              .eq("id", body.id)
              .eq("owner_type", owner)
              .eq("revision", Number(body.revision))
              .or(
                organizationId
                  ? `organization_id.eq.${organizationId}`
                  : "organization_id.is.null",
              )
          : client.from("commercial_campaigns").insert({
              configuration,
              organization_id: organizationId,
              owner_type: owner,
              created_by: userId,
            });
        const saved = await write
          .select("id,revision,configuration")
          .maybeSingle();
        if (saved.error || !saved.data)
          return NextResponse.json(
            {
              error:
                "A campanha mudou ou não pôde ser salva. Atualize a página.",
            },
            { status: 409 },
          );
        return NextResponse.json({ campaign: saved.data });
      }
      const campaigns = await client
        .from("commercial_campaigns")
        .select("id,revision,configuration,updated_at")
        .eq("owner_type", owner)
        .or(
          organizationId
            ? `organization_id.eq.${organizationId}`
            : "organization_id.is.null",
        )
        .order("updated_at", { ascending: false })
        .limit(100);
      if (campaigns.error)
        throw new Error("Não foi possível carregar as campanhas.");
      const buyerQuery =
        owner === "platform"
          ? client.from("profiles").select("id,full_name,email").limit(300)
          : client
              .from("leads")
              .select("id,display_name,phone_number")
              .eq("organization_id", organizationId!)
              .limit(300);
      const buyers = await buyerQuery;
      if (buyers.error) throw new Error("Não foi possível carregar o público.");
      const contracts =
        owner === "store"
          ? await client
              .from("commercial_agreements")
              .select(
                "id,lead_id,state,period_end,paid_cycles,cancel_at_period_end,configuration,option_id,metadata",
              )
              .eq("organization_id", organizationId!)
              .eq("owner_type", "store")
              .eq("metadata->>recurring", "true")
              .order("created_at", { ascending: false })
              .limit(100)
          : { data: [], error: null };
      if (contracts.error)
        throw new Error("Não foi possível carregar as assinaturas.");
      let channelsQuery = client
        .from("whatsapp_instances")
        .select("id,display_name,phone_number,metadata")
        .eq("provider", "uazapi")
        .neq("status", "archived");
      channelsQuery =
        owner === "platform"
          ? channelsQuery.eq("metadata->>admin_whatsapp", "true")
          : channelsQuery.eq("organization_id", organizationId!);
      const channels = await channelsQuery.limit(100);
      if (channels.error)
        throw new Error("Não foi possível consultar os canais de divulgação.");
      return NextResponse.json({
        channels: (channels.data ?? []).map((c) => ({
          id: c.id,
          name: c.display_name ?? c.phone_number ?? "WhatsApp",
        })),
        contracts: contracts.data,
        campaigns: campaigns.data,
        targets,
        buyers: (buyers.data ?? []).map((row) => {
          const r = row as Record<string, unknown>;
          return {
            id: r.id,
            name:
              r.full_name ??
              r.display_name ??
              r.email ??
              r.phone_number ??
              "Cliente",
          };
        }),
      });
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : 422;
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível concluir.",
        },
        { status },
      );
    }
  }
  return {
    GET: (request: NextRequest) => handle(request, false),
    POST: (request: NextRequest) => handle(request, true),
  };
}

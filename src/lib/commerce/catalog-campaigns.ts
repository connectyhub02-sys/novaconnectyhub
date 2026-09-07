import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCampaign, quoteCampaign, campaignPriceNotice } from "./campaigns";

/** Public advertising contains no buyer list or private eligibility/history. */
export async function loadCatalogCampaigns(
  client: SupabaseClient,
  organizationId: string,
  productIds: string[],
) {
  const rows = await client
    .from("commercial_campaigns")
    .select("id,revision,configuration")
    .eq("owner_type", "store")
    .eq("organization_id", organizationId)
    .eq("configuration->>status", "active")
    .limit(40);
  if (rows.error) throw new Error("Não foi possível consultar as campanhas.");
  const active = rows.data
    .map((row) => ({ ...row, config: parseCampaign(row.configuration) }))
    .filter(
      (row) =>
        row.config.audience !== "selected" &&
        Date.parse(row.config.startsAt) <= Date.now() &&
        Date.parse(row.config.endsAt) > Date.now(),
    );
  const ids = [
    ...new Set(active.flatMap((row) => row.config.targetIds)),
  ].filter((id) => !productIds.length || productIds.includes(id));
  if (!ids.length) return [];
  const products = await client
    .from("intelligence_memory")
    .select("id,title,metadata")
    .eq("organization_id", organizationId)
    .eq("memory_type", "sales_catalog_item")
    .in("id", ids);
  if (products.error)
    throw new Error("Não foi possível consultar os produtos.");
  const audience = {
    all: "Clientes elegíveis",
    new: "Primeira compra",
    existing: "Clientes que já compraram",
    inactive: "Reativação",
    selected: "Clientes selecionados",
  };
  return active
    .flatMap((row) =>
      products.data
        .filter(
          (p) =>
            row.config.targetIds.includes(p.id) &&
            p.metadata?.status === "active" &&
            !p.metadata?.platform_product_id,
        )
        .flatMap((product) =>
          row.config.options.map((option) => ({
            id: row.id + ":" + option.id + ":" + product.id,
            campaignId: row.id,
            optionId: option.id,
            productId: product.id,
            title: product.title,
            name: row.config.name,
            audience: audience[row.config.audience],
            endsAt: row.config.endsAt,
            conditions: campaignPriceNotice(
              quoteCampaign(
                row.id,
                row.revision,
                row.config,
                option.id,
                0,
                product.metadata?.billing_cycle === "recurring",
              ),
            ),
            productUrl: `/produto/${product.id}`,
          })),
        ),
    )
    .slice(0, 8);
}

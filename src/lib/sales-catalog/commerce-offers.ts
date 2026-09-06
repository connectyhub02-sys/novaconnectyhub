import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSalesCatalogSkus, getOrganizationSalesCatalogSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { isSalesCatalogDisplayableProduct, type ClientSalesCatalogItem, type SalesCatalogOrderBumpItem } from "./shared";
import { normalizeCurrencyAmount } from "./mercado-pago";

export type CommerceOfferSurface = "store" | "product" | "cart" | "checkout" | "confirmation";
export type CommerceOffer = { productId: string; title: string; description: string; price: number; imageUrl: string | null; productUrl: string; canAddDirectly: boolean };

export function isEligibleCommerceOffer(item: ClientSalesCatalogItem) {
  return isSalesCatalogDisplayableProduct(item) && item.status === "active" && item.salesDestination === "connectyhub_checkout"
    && item.billingCycle === "one_time" && Boolean(getCommerceOfferPrice(item))
    && (item.inventory.allowBackorder || !item.skus.length || item.skus.some(sku => sku.status === "active" && sku.stockStatus !== "out_of_stock" && (sku.stockQuantity === null || sku.stockQuantity > 0)))
    && (item.inventory.allowBackorder || item.inventory.status !== "out_of_stock" && (item.inventory.quantity === null || item.inventory.quantity > 0));
}

export async function loadCommerceOffers(input: { client: SupabaseClient; organizationId: string; surface: CommerceOfferSurface; currentProductIds?: string[]; leadId?: string | null }) {
  const settings = await getOrganizationSalesCatalogSettings(input.client, input.organizationId);
  if (!settings?.orderBumps.enabled || settings.orderBumps.webSurfaces && !settings.orderBumps.webSurfaces.includes(input.surface) || input.surface === "checkout" && !settings.orderBumps.checkoutEnabled) return [];
  const manual = settings.orderBumps.items.filter(item => item.active).map(item => item.productId);
  if (!manual.length && !settings.orderBumps.autoSuggestionsEnabled) return [];
  const current = new Set(input.currentProductIds ?? []);
  const { data: rows, error } = await input.client.from("intelligence_memory").select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("organization_id", input.organizationId).eq("memory_type", "sales_catalog_item").order("updated_at", { ascending: false }).limit(300);
  if (error) throw new Error("Não foi possível consultar as ofertas da loja.");
  const products = await attachSalesCatalogSkus(input.client, (rows ?? []).map(row => mapSalesCatalogItem(row)), { strict: true });
  const excluded = new Set(current);
  if (input.leadId) {
    const { data: decisions, error: decisionError } = await input.client.from("lead_commerce_offer_states").select("catalog_item_id, status")
      .eq("organization_id", input.organizationId).eq("lead_id", input.leadId).in("status", ["declined", "accepted"])
      .gte("updated_at", new Date(Date.now() - 86400000).toISOString());
    if (decisionError) return []; // Do not repeat a refusal when its history cannot be checked.
    for (const decision of decisions ?? []) excluded.add(decision.catalog_item_id);
  }
  const currentItems = products.filter(item => current.has(item.id));
  const platformCart = currentItems.length ? currentItems.every(item => Boolean(item.platformProductId)) : null;
  const categories = new Set(currentItems.map(item => item.category).filter(Boolean));
  const candidates = products.filter(item => !excluded.has(item.id) && isEligibleCommerceOffer(item)
    && (platformCart === null || Boolean(item.platformProductId) === platformCart)
    && (manual.includes(item.id) ? matchesCommerceOfferConditions(settings.orderBumps.items.find(config => config.productId === item.id)!, currentItems) : settings.orderBumps.autoSuggestionsEnabled));
  candidates.sort((a, b) => {
    const priority = (item: ClientSalesCatalogItem) => manual.includes(item.id) ? 1000 - manual.indexOf(item.id) : categories.has(item.category) ? 100 : 0;
    return priority(b) - priority(a);
  });
  return candidates.slice(0, Math.max(0, Math.min(2, settings.orderBumps.maxOffersPerOrder ?? 2))).map(item => ({
    productId: item.id, title: item.title, description: item.description, price: getCommerceOfferPrice(item)!,
    imageUrl: item.media.find(media => media.kind === "image")?.storageUrl ?? null,
    productUrl: `/produto/${item.id}`, canAddDirectly: canAddCommerceOfferDirectly(item),
  } satisfies CommerceOffer));
}

export function canAddCommerceOfferDirectly(item: ClientSalesCatalogItem) {
  return item.skus.filter(sku => sku.status === "active").length <= 1 && !item.attributes.some(attribute => attribute.values.length > 1) && !item.fulfillment.schedulingRequired;
}

export function getCommerceOfferPrice(item: ClientSalesCatalogItem, now = Date.now()) {
  const skus = item.skus.filter(sku => sku.status === "active");
  const sku = skus.length === 1 ? skus[0] : null;
  const starts = item.offer.saleStartsAt ? Date.parse(item.offer.saleStartsAt) : -Infinity;
  const ends = item.offer.saleEndsAt ? Date.parse(item.offer.saleEndsAt) : Infinity;
  const promotionActive = starts <= now && ends >= now;
  return (sku ? normalizeCurrencyAmount(sku.salePrice) ?? normalizeCurrencyAmount(sku.price) : null)
    ?? (promotionActive ? normalizeCurrencyAmount(item.offer.salePrice) : null)
    ?? normalizeCurrencyAmount(item.price);
}

export function matchesCommerceOfferConditions(config: SalesCatalogOrderBumpItem, current: ClientSalesCatalogItem[], subtotal?: number) {
  if (config.triggerProductId && !current.some(item => item.id === config.triggerProductId)) return false;
  const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (config.triggerCategory && !current.some(item => normalized(item.category ?? "") === normalized(config.triggerCategory!))) return false;
  const amount = subtotal ?? current.reduce((sum, item) => sum + (getCommerceOfferPrice(item) ?? 0), 0);
  return amount >= (config.minimumSubtotal ?? 0);
}

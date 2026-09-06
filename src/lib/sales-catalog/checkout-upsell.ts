import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { attachSalesCatalogSkus, getOrganizationSalesCatalogShippingSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { loadCommerceOffers } from "./commerce-offers";
import { loadTransparentCheckout, CheckoutError } from "./transparent-checkout";
import { calculateSalesCatalogShippingQuotes } from "./shipping-calculator";
import { normalizeCurrencyAmount } from "./mercado-pago";
import { createSalesCatalogPixPaymentSession } from "./payment-sessions";
import { buildCheckoutOrderBumpRows } from "./checkout-order-bumps";

export async function createCheckoutUpsell(client: SupabaseClient, sessionId: string, productId: string) {
  const source = await loadTransparentCheckout(client, sessionId);
  if (source.order.payment_status !== "confirmed") throw new CheckoutError("Conclua o pagamento do pedido antes de continuar com esta oferta.", 409);
  const organizationId = source.session.organization_id;
  const { data: existingUpsell, error: lookupError } = await client.from("sales_catalog_upsell_orders").select("order_id").eq("parent_order_id", source.order.id).eq("catalog_item_id", productId).maybeSingle();
  if (lookupError) throw new CheckoutError("Não foi possível conferir esta oferta. Tente novamente.", 503);
  if (existingUpsell) return checkoutForUpsell(client, organizationId, existingUpsell.order_id);
  const candidates = await loadCommerceOffers({ client, organizationId, surface: "confirmation", leadId: source.order.lead_id, currentProductIds: source.items.map(item => item.catalog_item_id) });
  const offer = candidates.find(item => item.productId === productId && item.canAddDirectly);
  if (!offer) throw new CheckoutError("Esta oferta não está mais disponível. Veja as opções na loja.", 409);
  const { data: row } = await client.from("intelligence_memory").select("id, organization_id, title, content, metadata, created_at, updated_at").eq("organization_id", organizationId).eq("id", productId).eq("memory_type", "sales_catalog_item").single();
  if (!row) throw new CheckoutError("Produto não encontrado.", 404);
  const [product] = await attachSalesCatalogSkus(client, [mapSalesCatalogItem(row)], { strict: true });
  let shipping = 0;
  let shippingMethod: string | null = null;
  if (product.fulfillment.mode === "physical") {
    if (/retir|pickup/i.test(source.order.shipping_method ?? "")) shippingMethod = source.order.shipping_method;
    else {
      const settings = await getOrganizationSalesCatalogShippingSettings(client, organizationId);
      if (!settings || !source.order.destination_cep || product.shipping.profile === "custom") throw new CheckoutError("Confirme a entrega desta oferta pelo WhatsApp.", 409);
      const result = calculateSalesCatalogShippingQuotes({ item: product, settings, cep: source.order.destination_cep });
      const quotes = result.quotes.filter(quote => normalizeCurrencyAmount(quote.price) !== null);
      const quote = quotes.find(quote => source.order.shipping_method?.toLowerCase().includes(quote.serviceName.toLowerCase())) ?? (quotes.length === 1 ? quotes[0] : null);
      if (!quote) throw new CheckoutError("Confirme a modalidade de entrega desta oferta pelo WhatsApp.", 409);
      shipping = normalizeCurrencyAmount(quote.price)!;
      shippingMethod = quote.serviceName;
    }
  }
  const [itemRow] = buildCheckoutOrderBumpRows([{ item: product, config: { productId, title: product.title, description: product.description, badge: product.highlightLabel, price: offer.price, priceLabel: String(offer.price), mediaUrl: offer.imageUrl } }], organizationId, source.order.id);
  itemRow.metadata = { ...itemRow.metadata, order_bump: false };
  const { data: orderId, error } = await client.rpc("create_checkout_upsell_order", { p_parent_id: source.order.id, p_organization_id: organizationId, p_order_id: randomUUID(), p_product_id: productId, p_product_updated_at: row.updated_at, p_item: itemRow, p_shipping: shipping, p_shipping_method: shippingMethod });
  if (error || !orderId) throw new CheckoutError("Não foi possível preparar a oferta. Atualize a página e tente novamente.", 409);
  return checkoutForUpsell(client, organizationId, orderId);
}

async function checkoutForUpsell(client: SupabaseClient, organizationId: string, orderId: string) {
  const { data: existing } = await client.from("sales_catalog_payment_sessions").select("id").eq("organization_id", organizationId).eq("order_id", orderId).eq("method", "card").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) return { checkoutUrl: `/checkout/${existing.id}` };
  const checkout = await createSalesCatalogPixPaymentSession({ client, organizationId, orderId, source: "checkout", preferredMethod: "card" });
  return { checkoutUrl: checkout.trackingUrl ?? checkout.checkoutUrl };
}

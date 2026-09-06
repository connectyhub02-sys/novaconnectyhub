import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganizationSalesCatalogSettings, getOrganizationSalesCatalogShippingSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { buildCheckoutOrderBumpRows, loadValidatedOrderBumpItems } from "./checkout-order-bumps";
import { normalizeCurrencyAmount } from "./mercado-pago";
import { calculateSalesCatalogShippingQuotes } from "./shipping-calculator";
import { record } from "./card-input";
import type { ClientSalesCatalogItem } from "./shared";
import { retireCheckoutPaymentsBeforeCartChange } from "./transparent-checkout";

export async function setSalesCatalogCheckoutOrderBumps(input: { client: SupabaseClient; organizationId: string; orderId: string; selectedProductIds: string[]; revision?: number }) {
  const { client, organizationId, orderId } = input;
  const { data: order, error } = await client.from("sales_catalog_orders").select("*").eq("id", orderId).eq("organization_id", organizationId).single();
  if (error || !order) throw new Error("Não foi possível conferir o pedido.");
  const { data: currentItems, error: itemsError } = await client.from("sales_catalog_order_items").select("*").eq("order_id", orderId).eq("organization_id", organizationId).order("created_at");
  if (itemsError || !currentItems) throw new Error("Não foi possível conferir os produtos.");
  const original = currentItems.filter(item => record(item.metadata).order_bump !== true);
  const originalIds = new Set(original.map(item => item.catalog_item_id));
  const selected = [...new Set(input.selectedProductIds)].filter(id => !originalIds.has(id));
  const settings = await getOrganizationSalesCatalogSettings(client, organizationId);
  const previousCount = currentItems.filter(item => record(item.metadata).order_bump === true).length;
  if (selected.length > Math.max(previousCount, settings?.orderBumps.maxOffersPerOrder ?? 1)) throw new Error("O limite de ofertas deste pedido foi atingido.");
  const applied = await loadValidatedOrderBumpItems({ client, organizationId, selectedProductIds: selected, currentProductIds: [...originalIds].filter((id): id is string => typeof id === "string"), subtotal: original.reduce((sum, row) => sum + (normalizeCurrencyAmount(row.total) ?? 0), 0) });
  const rows = buildCheckoutOrderBumpRows(applied, organizationId, orderId);
  const nextItems = [...original, ...rows];
  // A single payment must never mix the store's receivables with platform products.
  const owners = new Set(nextItems.map(item => item.product_origin_type === "connectyhub" || item.platform_product_id ? "platform" : "seller"));
  if (owners.size > 1) throw new Error("Esta oferta precisa de um pedido separado para garantir o recebimento correto.");
  const previouslySelected = currentItems.filter(item => record(item.metadata).order_bump === true).map(item => item.catalog_item_id).sort();
  const sameSelection = JSON.stringify(previouslySelected) === JSON.stringify([...selected].sort());
  const pricesChanged = rows.some(row => normalizeCurrencyAmount(currentItems.find(item => item.catalog_item_id === row.catalog_item_id)?.total) !== row.total);
  let shipping = normalizeCurrencyAmount(order.shipping_total) ?? 0;
  let shippingMethod = order.shipping_method;
  if (!sameSelection || pricesChanged) {
    const ids = [...new Set(nextItems.map(item => item.catalog_item_id).filter(Boolean))];
    const { data: products, error: productError } = await client.from("intelligence_memory").select("id, organization_id, title, content, metadata, created_at, updated_at").eq("organization_id", organizationId).eq("memory_type", "sales_catalog_item").in("id", ids);
    if (productError) throw new Error("Não foi possível atualizar o frete.");
    const byId = new Map((products ?? []).map(row => [row.id, mapSalesCatalogItem(row)]));
    const physical = nextItems.filter(row => (record(row.fulfillment).mode ?? "physical") === "physical");
    if (!physical.length || /retir|pickup/i.test(shippingMethod ?? "")) shipping = 0;
    else {
      const entries = physical.map(row => ({ item: byId.get(row.catalog_item_id), quantity: row.quantity ?? 1 }));
      if (entries.some(entry => !entry.item)) throw new Error("Confirme o frete deste pedido pelo WhatsApp antes de adicionar ofertas.");
      const billable = entries.filter(entry => entry.item!.shipping.profile !== "free") as { item: ClientSalesCatalogItem; quantity: number }[];
      if (!billable.length) { shipping = 0; shippingMethod = "Frete grátis"; }
      else {
        if (billable.some(entry => entry.item.shipping.profile === "custom")) throw new Error("O frete desta oferta precisa ser combinado pelo WhatsApp.");
        const shippingSettings = await getOrganizationSalesCatalogShippingSettings(client, organizationId);
        if (!shippingSettings || !order.destination_cep) throw new Error("Confirme o CEP e o frete pelo WhatsApp antes de adicionar ofertas.");
        const subtotal = nextItems.reduce((sum, row) => sum + (normalizeCurrencyAmount(row.total) ?? 0), 0);
        const base = billable[0].item;
        const aggregate: ClientSalesCatalogItem = { ...base, price: String(subtotal), shipping: { ...base.shipping, weightGrams: billable.reduce((sum, entry) => sum + (entry.item.shipping.weightGrams ?? 1000) * entry.quantity, 0) } };
        const result = calculateSalesCatalogShippingQuotes({ item: aggregate, settings: shippingSettings, cep: order.destination_cep });
        const quotes = result.quotes.filter(quote => normalizeCurrencyAmount(quote.price) !== null);
        const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const quote = quotes.find(quote => normalized(shippingMethod ?? "").includes(normalized(quote.serviceName))) ?? (quotes.length === 1 ? quotes[0] : null);
        if (!quote) throw new Error("A entrega mudou com esta oferta. Confirme a opção de frete pelo WhatsApp.");
        shipping = normalizeCurrencyAmount(quote.price)!;
        shippingMethod = quote.serviceName;
      }
    }
  }
  if (!sameSelection || pricesChanged) await retireCheckoutPaymentsBeforeCartChange(client, organizationId, orderId);
  const { data: updated, error: saveError } = await client.rpc("set_checkout_order_bumps", {
    p_order_id: orderId, p_organization_id: organizationId, p_revision: input.revision ?? Number(order.checkout_revision), p_rows: rows, p_shipping: shipping, p_shipping_method: shippingMethod,
  });
  if (saveError || !updated) throw new Error(saveError?.message.includes("CHECKOUT_PAYMENT_BUSY") ? "Existe um pagamento em processamento. Aguarde a confirmação antes de alterar o pedido." : "O pedido foi atualizado. Confira o carrinho e tente novamente.");
  const { data: items, error: reloadError } = await client.from("sales_catalog_order_items").select("*").eq("order_id", orderId).eq("organization_id", organizationId).order("created_at");
  if (reloadError) throw new Error("O carrinho foi atualizado. Recarregue a página para conferir.");
  return { order: updated, items: items ?? [], appliedBumps: applied.map(entry => entry.config), addedBumps: applied.filter(entry => !previouslySelected.includes(entry.item.id)).map(entry => entry.config), totalAmount: normalizeCurrencyAmount(updated.total) };
}

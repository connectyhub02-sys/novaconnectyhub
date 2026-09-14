import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganizationSalesCatalogShippingSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { quoteFoodComposition, foodUnitSummary } from "./food-composition";
import { readFoodOrderSnapshot } from "./food-order";
import { record } from "./card-input";
import { boundDeliveryCoordinates, deliveryMoneyCents } from "./local-delivery";
import { chooseOrderDeliveryQuote, quoteOrderDelivery } from "./order-shipping";
import { evaluateOrderOperation, orderOperationMode } from "./operation-hours";
import { applySalesCatalogOrderRevision } from "./order-revision";
import type { loadTransparentCheckout } from "./transparent-checkout";

export async function prepareFoodCheckoutRevision(client: SupabaseClient, snapshot: Awaited<ReturnType<typeof loadTransparentCheckout>>, changes?: unknown) {
  const { order, items, session, settings } = snapshot;
  const ids = [...new Set(items.map(row => row.catalog_item_id).filter(Boolean))];
  const { data, error } = await client.from("intelligence_memory").select("id, organization_id, title, content, metadata, created_at, updated_at").eq("organization_id", session.organization_id).eq("memory_type", "sales_catalog_item").in("id", ids);
  if (error) throw new Error("Não foi possível conferir as opções disponíveis.");
  const catalog = new Map((data ?? []).map(row => [row.id, mapSalesCatalogItem(row)]));
  const editable = items.filter(row => readFoodOrderSnapshot(row.metadata));
  if (!editable.length) throw new Error("Este pedido não possui montagens para alterar.");
  if (changes !== undefined && (!Array.isArray(changes) || changes.length !== editable.length || new Set(changes.map(value => record(value).id)).size !== editable.length
    || changes.some(value => !editable.some(row => row.id === record(value).id)))) throw new Error("Confira a montagem de todas as unidades do pedido.");
  const selections = new Map((Array.isArray(changes) ? changes : []).map(value => [record(value).id, record(value).selection]));
  const units = editable.map((row, index) => {
    const item = catalog.get(row.catalog_item_id), saved = readFoodOrderSnapshot(row.metadata)!;
    if (!item || item.status !== "active" || !item.foodComposition?.enabled) throw new Error("Um produto não está mais disponível para montagem. Fale com a loja.");
    return { id: row.id, title: row.title, unitNumber: Number(record(row.metadata).food_unit_index ?? index) + 1, policy: item.foodComposition, selection: selections.get(row.id) ?? saved.units[0].selection };
  });
  // GET can show now-unavailable selections for correction; quote/save require a
  // complete current selection and replace all financial data on the server.
  if (changes === undefined) return { units, revision: Number(order.checkout_revision), rows: [], shipping: null, total: null, error: null };
  const skuIds = items.map(row => row.sku_id).filter(Boolean);
  const skuResult = skuIds.length ? await client.from("sales_catalog_skus").select("id, catalog_item_id, price, sale_price, status").eq("organization_id", session.organization_id).in("id", skuIds) : { data: [], error: null };
  if (skuResult.error) throw new Error("Não foi possível conferir as variações do pedido.");
  const rows = items.map(row => {
    const edit = units.find(unit => unit.id === row.id);
    if (!edit) {
      const item = catalog.get(row.catalog_item_id), sku = skuResult.data?.find(sku => sku.id === row.sku_id && sku.catalog_item_id === row.catalog_item_id);
      if (!item || item.status !== "active" || row.sku_id && (!sku || sku.status !== "active")) throw new Error("Um produto do pedido ficou indisponível. Fale com a loja para ajustar.");
      const unitPrice = sku?.price || item.price, salePrice = sku?.sale_price || item.offer.salePrice;
      const amount = ((deliveryMoneyCents(salePrice || unitPrice) ?? 0) + (deliveryMoneyCents(record(row.metadata).conversation_cart_attribute_modifier_total as string) ?? 0)) * (row.quantity ?? 1);
      if (amount !== deliveryMoneyCents(row.total)) throw new Error("Outro produto mudou de preço. Confira o pedido com a loja antes de alterar a montagem.");
      return { ...row, unit_price: unitPrice, sale_price: salePrice || null };
    }
    const composition = quoteFoodComposition(edit.policy, [edit.selection], 1)!;
    composition.summary = foodUnitSummary(composition.units[0], edit.unitNumber - 1);
    return { ...row, quantity: 1, unit_price: String(composition.totalCents / 100), sale_price: null, total: String(composition.totalCents / 100),
      metadata: { ...record(row.metadata), food_composition: composition } };
  });
  const subtotalCents = rows.reduce((sum, row) => sum + (deliveryMoneyCents(row.total) ?? 0), 0);
  const entries = rows.map(row => {
    const item = catalog.get(row.catalog_item_id);
    if (!item) throw new Error("Um produto não está mais disponível para conferir a entrega.");
    return { item, quantity: row.quantity ?? 1 };
  });
  const shippingSettings = await getOrganizationSalesCatalogShippingSettings(client, session.organization_id);
  const point = boundDeliveryCoordinates(record(order.metadata).shipping_quote ?? record(order.metadata).initial_shipping, order.destination_address, order.destination_cep);
  const delivery = quoteOrderDelivery({ entries, settings: shippingSettings, cep: order.destination_cep ?? "", address: order.destination_address ?? "", coordinates: point, subtotal: subtotalCents / 100 });
  const quote = chooseOrderDeliveryQuote(delivery.quotes, order.shipping_method);
  if (delivery.physical && !quote) throw new Error(delivery.error ?? "Confirme os dados e a entrega antes de alterar a montagem.");
  const operation = evaluateOrderOperation(settings?.orderPolicy?.operations, orderOperationMode(rows, quote?.name));
  if (!operation.allowed) throw new Error(operation.message!);
  const shipping = { total: quote?.amount ?? 0, method: quote?.name ?? null, destinationCep: order.destination_cep, destinationAddress: order.destination_address,
    quote: { service_id: quote?.id, coordinates: point, cep: order.destination_cep, destination_address: order.destination_address } };
  const total = (subtotalCents - (deliveryMoneyCents(order.discount_total) ?? 0) + Math.round(shipping.total * 100)) / 100;
  return { units, rows, revision: Number(order.checkout_revision), shipping, total, error: null };
}

export async function saveFoodCheckoutRevision(client: SupabaseClient, snapshot: Awaited<ReturnType<typeof loadTransparentCheckout>>, body: Record<string, unknown>) {
  const proposal = await prepareFoodCheckoutRevision(client, snapshot, body.units);
  if (!Number.isSafeInteger(body.revision) || body.revision !== proposal.revision || body.total !== proposal.total || !proposal.shipping
    || typeof body.requestId !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(body.requestId)) throw new Error("O pedido mudou. Confira o total atualizado antes de confirmar.");
  return applySalesCatalogOrderRevision({ client, organizationId: snapshot.session.organization_id, orderId: snapshot.order.id,
    leadId: snapshot.order.lead_id, conversationId: snapshot.order.conversation_id, checkoutSessionId: snapshot.session.id,
    expectedRevision: proposal.revision, requestId: `food:${body.requestId}`, rows: proposal.rows, shipping: proposal.shipping, expectedTotal: proposal.total!, operationHours: snapshot.settings?.orderPolicy?.operations });
}

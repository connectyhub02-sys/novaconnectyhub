import { evaluateOrderOperation } from "./operation-hours";
import "server-only";
import { boundDeliveryCoordinates, validDeliveryPoint } from "./local-delivery";
import type { SalesCatalogGeoPoint } from "./shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganizationSalesCatalogShippingSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { CheckoutError, loadTransparentCheckout, retireCheckoutPaymentsBeforeCartChange } from "./transparent-checkout";
import { getCheckoutCustomerMissingFields, parseCheckoutAddress, type CheckoutCustomerOrder } from "./checkout-customer";
import { chooseOrderDeliveryQuote, quoteOrderDelivery } from "./order-shipping";
import { normalizeCurrencyAmount } from "./mercado-pago";
import { record, text } from "./card-input";

type Customer = Omit<CheckoutCustomerOrder, "id" | "lead_id"> & { coordinates?: SalesCatalogGeoPoint | null };
export async function loadCheckoutDelivery(client: SupabaseClient, sessionId: string, draft?: Customer) {
  const snapshot = await loadTransparentCheckout(client, sessionId);
  const { order, items, session } = snapshot;
  const customer = pickCustomer(draft ?? order);
  if (!draft) customer.coordinates = boundDeliveryCoordinates(record(order.metadata).shipping_quote ?? record(order.metadata).initial_shipping, customer.destination_address, customer.destination_cep);
  const ids = [...new Set(items.map(item => item.catalog_item_id).filter(Boolean))];
  const { data: products, error } = await client.from("intelligence_memory").select("id, organization_id, title, content, metadata, created_at, updated_at").eq("organization_id", session.organization_id).eq("memory_type", "sales_catalog_item").in("id", ids);
  if (error) throw new CheckoutError("Não foi possível conferir os produtos para a entrega.", 503);
  const byId = new Map((products ?? []).map(row => [row.id, mapSalesCatalogItem(row)]));
  const entries = items.map(item => {
    const product = byId.get(item.catalog_item_id);
    if (!product) throw new CheckoutError("Um produto deste pedido não está mais disponível para calcular a entrega.", 409);
    return { item: { ...product, fulfillment: { ...product.fulfillment, mode: record(item.fulfillment).mode === "physical" ? "physical" as const : product.fulfillment.mode } }, quantity: item.quantity ?? 1 };
  });
  const settings = await getOrganizationSalesCatalogShippingSettings(client, session.organization_id);
  const subtotal = normalizeCurrencyAmount(order.subtotal) ?? 0;
  const delivery = quoteOrderDelivery({ entries, settings, subtotal, cep: customer.destination_cep ?? "", address: customer.destination_address ?? "", coordinates: customer.coordinates });
  const operationFor = (pickup: boolean) => evaluateOrderOperation(snapshot.settings?.orderPolicy?.operations, delivery.physical ? pickup ? "pickup" : "delivery" : "none");
  const quotes = delivery.quotes.filter(quote => operationFor(quote.pickup).allowed);
  const selected = chooseOrderDeliveryQuote(quotes, order.shipping_method);
  const operation = operationFor(selected?.pickup ?? false);
  const operationError = !quotes.length && !operation.allowed ? operation.message : null;
  const requireAddress = delivery.physical || snapshot.settings?.asaas.enabledMethods.includes("credit_card") !== false;
  const needsLocation = Boolean(settings?.localDeliveryEnabled && settings.localDeliveryAuthority !== "cep" && settings.localDeliveryAuthority !== "address" && settings.localDeliveryZones.some(zone => zone.active && (zone.shape === "radius" || zone.shape === "polygon")));
  return { snapshot, customer, requireAddress, needsLocation, ...delivery, quotes, operationError, error: operationError ?? delivery.error, selectedId: selected?.id ?? "", revision: Number(order.checkout_revision ?? 0), subtotal, discount: normalizeCurrencyAmount(order.discount_total) ?? 0 };
}

export function publicDeliveryQuote(data: Awaited<ReturnType<typeof loadCheckoutDelivery>>) {
  return { customer: data.customer, needsLocation: data.needsLocation, requireAddress: data.requireAddress, physical: data.physical, quotes: data.quotes, selectedId: data.selectedId, revision: data.revision, subtotal: data.subtotal, discount: data.discount, error: data.error, operationError: data.operationError };
}

export async function saveCheckoutDelivery(client: SupabaseClient, sessionId: string, body: Record<string, unknown>) {
  if (!Number.isSafeInteger(body.revision)) throw new CheckoutError("Atualize a página para conferir o pedido.", 409);
  const data = await loadCheckoutDelivery(client, sessionId, pickCustomer(record(body.customer)));
  const { snapshot, customer } = data;
  if (Number(body.revision) !== data.revision) throw new CheckoutError("O pedido foi atualizado. Recalcule a entrega antes de confirmar.", 409);
  const missing = getCheckoutCustomerMissingFields({ id: snapshot.order.id, ...customer }, data.requireAddress);
  if (missing.length) throw new CheckoutError(`Confira: ${missing.join(", ")}.`, 422);
  if (data.requireAddress && (!parseCheckoutAddress(customer.destination_address).address || (customer.destination_address?.trim().length ?? 0) < 12)) throw new CheckoutError("Informe o endereço completo com rua, número, bairro e cidade.", 422);
  const selected = data.quotes.find(quote => quote.id === body.serviceId);
  if (data.physical && !selected) throw new CheckoutError(data.error ?? "Escolha uma opção de entrega disponível.", 422);
  const operation = evaluateOrderOperation(snapshot.settings?.orderPolicy?.operations, data.physical ? selected?.pickup ? "pickup" : "delivery" : "none");
  if (!operation.allowed) throw new CheckoutError(operation.message!, 409);
  const shipping = selected?.amount ?? 0;
  const order = snapshot.order;
  const { data: payments, error } = await client.from("sales_catalog_payment_sessions").select("id, provider_payment_id, metadata").eq("organization_id", snapshot.session.organization_id).eq("order_id", order.id).in("status", ["created", "pending", "error"]);
  if (error) throw new CheckoutError("Não foi possível conferir os pagamentos deste pedido.", 503);
  if (payments?.some(payment => record(payment.metadata).gateway_request_inflight === true)) throw new CheckoutError("Há um pagamento sendo verificado. Aguarde antes de alterar a entrega.", 409);
  if (payments?.some(payment => payment.provider_payment_id)) await retireCheckoutPaymentsBeforeCartChange(client, snapshot.session.organization_id, order.id);
  const { data: saved, error: saveError } = await client.rpc("set_checkout_delivery", {
    p_session_id: sessionId, p_revision: data.revision, p_customer: customer,
    p_shipping: shipping, p_shipping_method: selected?.name ?? null,
    p_quote: selected ? { ...selected, coordinates: customer.coordinates ?? null, destination_address: customer.destination_address, cep: customer.destination_cep, source: "checkout", calculated_at: new Date().toISOString() } : {},
  });
  if (saveError || !saved) throw new CheckoutError(saveError?.message.includes("CHECKOUT_PAYMENT") ? "Há um pagamento em processamento. Aguarde antes de alterar a entrega." : "Não foi possível salvar a entrega. Atualize o pedido e tente novamente.", 409);
  return { ok: true, revision: saved.checkout_revision, amount: normalizeCurrencyAmount(saved.total), shipping };
}

function pickCustomer(value: Customer | Record<string, unknown>): Customer {
  return {
    customer_name: text(value.customer_name).slice(0, 120), customer_email: text(value.customer_email).slice(0, 254),
    customer_phone: text(value.customer_phone).replace(/\D/g, ""), customer_document: text(value.customer_document).replace(/\D/g, ""),
    coordinates: validDeliveryPoint(value.coordinates as SalesCatalogGeoPoint | null) ? { lat: (value.coordinates as SalesCatalogGeoPoint).lat, lng: (value.coordinates as SalesCatalogGeoPoint).lng } : null,
    destination_cep: text(value.destination_cep).replace(/\D/g, ""), destination_address: text(value.destination_address).slice(0, 500),
  };
}

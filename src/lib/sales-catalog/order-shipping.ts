import type { ClientSalesCatalogItem, ClientSalesCatalogShippingSettings } from "./shared";
import { calculateSalesCatalogShippingQuotes } from "./shipping-calculator";
import { normalizeCurrencyAmount } from "./mercado-pago";

export type OrderDeliveryQuote = { id: string; name: string; amount: number; minDays: number | null; maxDays: number | null; pickup: boolean };
export type OrderShippingEntry = { item: ClientSalesCatalogItem; quantity: number };

/** One parcel for the whole cart; quantities, weight tiers and free-shipping thresholds are authoritative. */
export function quoteOrderDelivery(input: { entries: OrderShippingEntry[]; settings: ClientSalesCatalogShippingSettings | null; cep: string; address?: string; subtotal: number }) {
  const physical = input.entries.filter(entry => entry.item.fulfillment.mode === "physical");
  const quotes: OrderDeliveryQuote[] = [];
  if (!physical.length) return { physical: false, quotes, error: null };
  if (input.settings?.localPickup) quotes.push({ id: "pickup", name: "Retirada na loja", amount: 0, minDays: null, maxDays: null, pickup: true });
  if (!/^\d{8}$/.test(input.cep.replace(/\D/g, ""))) return { physical: true, quotes, error: "Informe o CEP para calcular a entrega." };
  const billable = physical.filter(entry => entry.item.shipping.profile !== "free");
  if (!input.settings) return { physical: true, quotes, error: "A loja ainda não disponibilizou uma opção de entrega para este pedido." };
  // A custom quote cannot be silently replaced by the standard table.
  if (billable.some(entry => entry.item.shipping.profile === "custom")) return { physical: true, quotes, error: "Este produto tem frete personalizado. A loja precisa disponibilizar uma cotação para a entrega." };
  const base = billable[0]?.item ?? physical[0].item;
  const aggregate = { ...base, price: String(input.subtotal), shipping: { ...base.shipping, weightGrams: billable.reduce((sum, entry) => sum + (entry.item.shipping.weightGrams ?? 1000) * entry.quantity, 0) } };
  const result = calculateSalesCatalogShippingQuotes({ item: aggregate, settings: input.settings, cep: input.cep });
  for (const quote of result.quotes) {
    const amount = shippingAmount(quote.price);
    if (amount !== null && amount >= 0) quotes.push({ id: quote.serviceId, name: quote.serviceName, amount, minDays: quote.minDays, maxDays: quote.maxDays, pickup: false });
  }
  // Text zones are checked against the complete address. Radius/polygon zones need coordinates, not a guessed location.
  if (input.settings.localDeliveryEnabled && input.address) {
    const address = ` ${normalized(input.address)} `;
    for (const zone of input.settings.localDeliveryZones.filter(zone => zone.active && zone.shape === "neighborhoods")) {
      const includes = (part: string) => address.includes(` ${normalized(part)} `);
      if (!zone.neighborhoods.length || !zone.neighborhoods.some(includes) || zone.cities.length && !zone.cities.some(includes)) continue;
      const minimum = shippingAmount(zone.orderMinimum);
      if (minimum !== null && input.subtotal < minimum) continue;
      const threshold = shippingAmount(zone.freeDeliveryThreshold);
      const amount = threshold !== null && input.subtotal >= threshold ? 0 : shippingAmount(zone.price);
      if (amount !== null && amount >= 0) quotes.push({ id: `local:${zone.id}`, name: `Entrega local - ${zone.name}`, amount, minDays: zone.minDays, maxDays: zone.maxDays, pickup: false });
    }
  }
  quotes.sort((a, b) => Number(a.pickup) - Number(b.pickup) || a.amount - b.amount || a.id.localeCompare(b.id));
  return { physical: true, quotes, error: quotes.some(quote => !quote.pickup) ? null : result.error ?? "Não há uma opção de entrega disponível para este endereço." };
}

export function chooseOrderDeliveryQuote(quotes: OrderDeliveryQuote[], previousMethod?: string | null) {
  return (previousMethod ? quotes.find(quote => normalized(previousMethod).includes(normalized(quote.name))) : null)
    ?? quotes.find(quote => !quote.pickup) ?? null;
}

function normalized(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
function shippingAmount(value: string | number | null | undefined) {
  if (typeof value === "string" && /^\s*(?:R\$\s*)?0+(?:[.,]0+)?\s*$/.test(value)) return 0;
  return normalizeCurrencyAmount(value);
}

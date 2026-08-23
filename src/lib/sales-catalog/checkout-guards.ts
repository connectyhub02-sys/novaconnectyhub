type SalesCatalogCheckoutShippingState = {
  shipping_method?: unknown;
  shipping_total?: unknown;
};

type SalesCatalogCheckoutFulfillmentItem = {
  fulfillment?: unknown;
};

export function requiresSalesCatalogShippingBeforePayment(
  order: SalesCatalogCheckoutShippingState,
  items: SalesCatalogCheckoutFulfillmentItem[],
) {
  const hasPhysicalItem = items.some((item) => readSalesCatalogFulfillmentMode(item.fulfillment) === "physical");

  if (!hasPhysicalItem) {
    return false;
  }

  return !hasShippingValue(order.shipping_method) && !hasShippingValue(order.shipping_total);
}

export function readSalesCatalogFulfillmentMode(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const mode = typeof record.mode === "string" ? record.mode : null;

  return mode === "digital" || mode === "service" || mode === "subscription" ? mode : "physical";
}

function hasShippingValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

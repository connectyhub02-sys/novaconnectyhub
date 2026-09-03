type SalesCatalogCheckoutShippingState = {
  destination_address?: unknown;
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

  const hasResolvedShipping = hasShippingValue(order.shipping_method) || hasShippingValue(order.shipping_total);

  if (!hasResolvedShipping) {
    return true;
  }

  if (isPickupShippingMethod(order.shipping_method)) {
    return false;
  }

  return !hasCompleteDeliveryAddressValue(order.destination_address);
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

function hasCompleteDeliveryAddressValue(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = normalizeDeliveryAddress(value);
  if (normalized.length < 12) {
    return false;
  }

  const hasAddressAnchor = /\b(?:rua|r|avenida|av|alameda|travessa|estrada|rodovia|praca|largo|condominio|residencial|casa|apto|apartamento)\b/.test(normalized);
  const hasNumber = /\b\d{1,6}\b/.test(normalized) || /\b(?:sem numero|s n)\b/.test(normalized);

  return hasAddressAnchor && hasNumber;
}

function isPickupShippingMethod(value: unknown) {
  return typeof value === "string" && /\b(?:retirada|retirar|pickup)\b/.test(normalizeDeliveryAddress(value));
}

function normalizeDeliveryAddress(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

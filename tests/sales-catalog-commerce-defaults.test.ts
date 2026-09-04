import { describe, expect, it, vi } from "vitest";
import { mapSalesCatalogSettings } from "@/lib/client-os/sales-catalog";
import { createDefaultSalesCatalogCommerceSettings } from "@/lib/sales-catalog/shared";

vi.mock("server-only", () => ({}));

function buildSettingsRow(metadata: Record<string, unknown>) {
  return {
    id: "settings-memory",
    organization_id: "11111111-1111-1111-1111-111111111111",
    title: "Configuracao do catalogo",
    content: "",
    metadata,
    created_at: "2026-09-04T12:00:00.000Z",
    updated_at: "2026-09-04T12:00:00.000Z",
  };
}

const disabledPaymentMethods = [
  { id: "pix", label: "Pix", enabled: false, instructions: null, requires_proof: false },
  { id: "card_link", label: "Cartao por link", enabled: false, instructions: null, requires_proof: false },
  { id: "boleto", label: "Boleto", enabled: false, instructions: null, requires_proof: false },
  { id: "cash_on_delivery", label: "Pagamento na entrega", enabled: false, instructions: null, requires_proof: false },
  { id: "manual", label: "Combinar com atendente", enabled: false, instructions: null, requires_proof: false },
];

describe("sales catalog commerce defaults", () => {
  it("uses Asaas Pix and card with the store assistant enabled by default", () => {
    const defaults = createDefaultSalesCatalogCommerceSettings();

    expect(defaults.paymentMethods.filter((method) => method.enabled).map((method) => method.id)).toEqual([
      "pix",
      "card_link",
    ]);
    expect(defaults.asaas.enabledMethods).toEqual(["pix", "credit_card"]);
    expect(defaults.commerceAgent.enabled).toBe(true);
    expect(defaults.commerceAgent.surfaces).toEqual(["store", "product", "cart", "checkout"]);
    expect(defaults.orderBumps.enabled).toBe(true);
    expect(defaults.orderBumps.autoSuggestionsEnabled).toBe(true);
  });

  it("upgrades legacy all-disabled payment and bump settings to the Asaas default", () => {
    const settings = mapSalesCatalogSettings(buildSettingsRow({
      configured: true,
      business_type: "simple",
      payment_methods: disabledPaymentMethods,
      asaas: null,
      order_bumps: {
        enabled: false,
        whatsapp_enabled: true,
        checkout_enabled: true,
        auto_suggestions_enabled: true,
        max_offers_per_order: 1,
        items: [],
      },
      commerce_agent: {
        enabled: false,
        mode: "assistant",
        surfaces: ["store", "product", "cart", "checkout"],
      },
    }));

    expect(settings.paymentMethods.filter((method) => method.enabled).map((method) => method.id)).toEqual([
      "pix",
      "card_link",
    ]);
    expect(settings.asaas.enabledMethods).toEqual(["pix", "credit_card"]);
    expect(settings.orderBumps.enabled).toBe(true);
    expect(settings.orderBumps.whatsappEnabled).toBe(true);
    expect(settings.orderBumps.autoSuggestionsEnabled).toBe(true);
    expect(settings.commerceAgent.enabled).toBe(true);
  });

  it("preserves explicit panel choices after the user saves commerce settings", () => {
    const settings = mapSalesCatalogSettings(buildSettingsRow({
      configured: true,
      business_type: "simple",
      payment_methods_configured_at: "2026-09-04T12:00:00.000Z",
      payment_methods: disabledPaymentMethods,
      order_bumps_configured_at: "2026-09-04T12:00:00.000Z",
      order_bumps: {
        enabled: false,
        whatsapp_enabled: false,
        checkout_enabled: false,
        auto_suggestions_enabled: false,
        max_offers_per_order: 1,
        items: [],
      },
      commerce_agent_configured_at: "2026-09-04T12:00:00.000Z",
      commerce_agent: {
        enabled: false,
        mode: "assistant",
        surfaces: ["store", "product", "cart", "checkout"],
      },
    }));

    expect(settings.paymentMethods.some((method) => method.enabled)).toBe(false);
    expect(settings.orderBumps.enabled).toBe(false);
    expect(settings.orderBumps.whatsappEnabled).toBe(false);
    expect(settings.orderBumps.autoSuggestionsEnabled).toBe(false);
    expect(settings.commerceAgent.enabled).toBe(false);
  });
});

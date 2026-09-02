import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storefrontSource = readFileSync("src/components/checkout/public-storefront.tsx", "utf8");
const productCartSource = readFileSync("src/components/checkout/product-page-cart-controller.tsx", "utf8");
const storefrontLoaderSource = readFileSync("src/lib/sales-catalog/public-storefront-loader.ts", "utf8");
const storeCheckoutRouteSource = readFileSync("src/app/api/public/sales-catalog/stores/[storeSlug]/checkout/route.ts", "utf8");

describe("public storefront lead identity", () => {
  it("hydrates cart contact fields from the tracked lead context", () => {
    expect(storefrontLoaderSource).toContain("leadEmail: string | null");
    expect(storefrontLoaderSource).toContain("leadEmail: leadContext.leadEmail");
    expect(storefrontLoaderSource).toContain("function resolveLeadEmail");
    expect(storefrontLoaderSource).toContain("record.customer_email");
    expect(storefrontSource).toContain("leadEmail: string | null");
    expect(storefrontSource).toContain("useState(tracking.leadEmail ?? \"\")");
    expect(productCartSource).toContain("useState(tracking.leadEmail ?? \"\")");
  });

  it("keeps known WhatsApp data out of repeated cart questions and requires email", () => {
    expect(storefrontSource).toContain("leadContactPrefilled={Boolean(tracking.leadId || tracking.leadName || tracking.leadPhone)}");
    expect(storefrontSource).toContain("const hasPrefilledPhone = leadContactPrefilled && Boolean(customerPhone.trim())");
    expect(storefrontSource).toContain("Nome ainda nao informado");
    expect(storefrontSource).toContain("placeholder=\"E-mail obrigatório\"");
    expect(storefrontSource).toContain("isValidStorefrontEmail(customerEmail)");
    expect(productCartSource).toContain("isValidCustomerEmail(customerEmail)");
  });

  it("requires and saves checkout contact data back to the lead record", () => {
    expect(storeCheckoutRouteSource).toContain("Informe um e-mail valido para finalizar o pedido.");
    expect(storeCheckoutRouteSource).toContain("upsertCheckoutLeadContact");
    expect(storeCheckoutRouteSource).toContain("event_type: \"sales_catalog.checkout_contact_saved\"");
    expect(storeCheckoutRouteSource).toContain("customer_email: input.customerEmail");
    expect(storeCheckoutRouteSource).toContain("checkout_email: input.customerEmail");
    expect(storeCheckoutRouteSource).toContain("customer_email: customerEmail");
    expect(storeCheckoutRouteSource).toContain("payerEmail: customerEmail");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storefrontSource = readFileSync("src/components/checkout/public-storefront.tsx", "utf8");
const productCartSource = readFileSync("src/components/checkout/product-page-cart-controller.tsx", "utf8");
const storefrontLoaderSource = readFileSync("src/lib/sales-catalog/public-storefront-loader.ts", "utf8");
const publicTrackingContextSource = readFileSync("src/lib/tracking/public-context.ts", "utf8");
const trackerSource = readFileSync("src/components/tracking/connecty-tracker.tsx", "utf8");
const storeCheckoutRouteSource = readFileSync("src/app/api/public/sales-catalog/stores/[storeSlug]/checkout/route.ts", "utf8");
const productCheckoutRouteSource = readFileSync("src/app/api/public/sales-catalog/products/[productId]/checkout/route.ts", "utf8");
const leadContextSource = readFileSync("src/lib/tracking/lead-context.ts", "utf8");
const whatsappWebhookSource = readFileSync("src/lib/whatsapp/webhook-ingest.ts", "utf8");

describe("public storefront lead identity", () => {
  it("hydrates cart contact fields from the tracked lead context", () => {
    expect(storefrontLoaderSource).toContain("readPublicStorefrontBrowserTrackingContext");
    expect(storefrontLoaderSource).toContain("findPublicStorefrontLeadIdentity");
    expect(storefrontLoaderSource).toContain("findPublicStorefrontCommerceSession");
    expect(storefrontLoaderSource).toContain("leadName: string | null");
    expect(storefrontLoaderSource).toContain("leadEmail: string | null");
    expect(storefrontLoaderSource).toContain("leadName: leadContext.leadName");
    expect(storefrontLoaderSource).toContain("leadEmail: leadContext.leadEmail");
    expect(storefrontLoaderSource).toContain("resolveLeadPersonalName");
    expect(storefrontLoaderSource).toContain("function resolveLeadEmail");
    expect(storefrontLoaderSource).toContain("record.customer_email");
    expect(storefrontSource).toContain("leadEmail: string | null");
    expect(storefrontSource).toContain("useState(tracking.leadEmail ?? \"\")");
    expect(productCartSource).toContain("useState(tracking.leadEmail ?? \"\")");
    expect(storefrontSource).toContain("publicTrackingContextUpdatedEventName");
    expect(productCartSource).toContain("publicTrackingContextUpdatedEventName");
    expect(publicTrackingContextSource).toContain("connectyhub_public_tracking_context");
    expect(publicTrackingContextSource).toContain("lead_name");
    expect(publicTrackingContextSource).toContain("lead_email");
    expect(trackerSource).toContain("writePublicTrackingContext(result.public_tracking)");
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

  it("does not reuse archived leads when a WhatsApp contact restarts the funnel", () => {
    expect(leadContextSource).toContain(".neq(\"status\", \"archived\")");
    expect(storefrontLoaderSource).toContain(".neq(\"status\", \"archived\")");
    expect(storeCheckoutRouteSource).toContain("if (data?.status === \"archived\")");
    expect(storeCheckoutRouteSource).toContain("releaseArchivedLeadPhone(client");
    expect(storeCheckoutRouteSource).toContain("archived_reopened_original_phone");
    expect(productCheckoutRouteSource).toContain("if (data?.status === \"archived\")");
    expect(productCheckoutRouteSource).toContain("releaseArchivedLeadPhone(client");
    expect(productCheckoutRouteSource).toContain("archived_reopened_original_phone");
    expect(whatsappWebhookSource).toContain("releaseArchivedLeadPhone(client");
    expect(whatsappWebhookSource).toContain("releaseArchivedConversationChatId(client");
    expect(whatsappWebhookSource).toContain("archived_reopened_original_provider_chat_id");
    expect(whatsappWebhookSource).toContain("provider_chat_id: null");
  });
});

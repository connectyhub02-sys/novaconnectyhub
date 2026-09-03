import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSource = read("supabase/migrations/0073_asaas_payment_gateway.sql");
const asaasGatewaySource = read("src/lib/sales-catalog/asaas.ts");
const paymentSessionsSource = read("src/lib/sales-catalog/payment-sessions.ts");
const integrationsSource = read("src/lib/client-os/integrations.ts");
const clientConsoleSource = read("src/components/connectyhub-os/client-integrations-console.tsx");
const webhookSource = read("src/app/api/webhooks/asaas/route.ts");
const whatsappAgentRuntimeSource = read("src/lib/whatsapp/agent-runtime.ts");
const sharedSource = read("src/lib/sales-catalog/shared.ts");
const postPaymentSource = read("src/lib/sales-catalog/post-payment.ts");
const adminIntegrationsSource = read("src/lib/admin/client-integrations.ts");
const maintenanceVaultSource = read("src/lib/maintenance-vault.ts");
const envExampleSource = read(".env.example");

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Asaas gateway rollout", () => {
  it("adds Asaas as a sales catalog payment provider", () => {
    expect(migrationSource).toContain("check (provider in ('mercado_pago', 'pagbank', 'asaas'))");
    expect(migrationSource).toContain("'asaas'");
    expect(migrationSource).toContain("\"api_key_connect\": true");
    expect(sharedSource).toContain("\"mercado_pago\" | \"pagbank\" | \"asaas\"");
  });

  it("implements Asaas customer, payment, Pix, checkout and webhook API calls", () => {
    expect(existsSync("src/lib/sales-catalog/asaas.ts")).toBe(true);
    expect(asaasGatewaySource).toContain("endpoint: \"/customers\"");
    expect(asaasGatewaySource).toContain("endpoint: \"/payments\"");
    expect(asaasGatewaySource).toContain("/pixQrCode");
    expect(asaasGatewaySource).toContain("endpoint: \"/checkouts\"");
    expect(asaasGatewaySource).toContain("endpoint: \"/webhooks\"");
    expect(asaasGatewaySource).toContain("access_token: input.accessToken");
    expect(asaasGatewaySource).toContain("\"User-Agent\": buildAsaasUserAgent(input.mode)");
    expect(asaasGatewaySource).toContain("ConnectyHub/1.0");
    expect(asaasGatewaySource).toContain("createAsaasPaymentWebhook");
  });

  it("uses Asaas for client-owned Pix sessions and hosted card checkout", () => {
    expect(paymentSessionsSource).toContain("providers.includes(\"asaas\")");
    expect(paymentSessionsSource).toContain("createAsaasPixPayment");
    expect(paymentSessionsSource).toContain("extractAsaasPaymentData");
    expect(paymentSessionsSource).toContain("createAsaasCheckout");
    expect(paymentSessionsSource).toContain("customer_email_required");
    expect(paymentSessionsSource).toContain("customer_document_required");
    expect(paymentSessionsSource).toContain("return \"pagbank\"");
  });

  it("adds guided Asaas connection surfaces", () => {
    expect(existsSync("src/app/api/dashboard/sales-catalog/payments/asaas/connect/route.ts")).toBe(true);
    expect(existsSync("src/app/api/dashboard/sales-catalog/payments/asaas/affiliate/route.ts")).toBe(true);
    expect(integrationsSource).toContain("id: \"asaas\"");
    expect(integrationsSource).toContain("buildAsaasConnections");
    expect(clientConsoleSource).toContain("function AsaasGuidedCard");
    expect(clientConsoleSource).toContain("API Key Asaas");
    expect(clientConsoleSource).toContain("Ja tenho conta");
    expect(clientConsoleSource).toContain("Nao tenho conta");
    expect(clientConsoleSource).toContain("buildAsaasAffiliateUrl");
  });

  it("processes Asaas payment webhooks and feeds post-payment automation", () => {
    expect(existsSync("src/app/api/webhooks/asaas/route.ts")).toBe(true);
    expect(webhookSource).toContain("verifyAsaasWebhookToken");
    expect(webhookSource).toContain("asaas-access-token");
    expect(webhookSource).toContain("source: \"asaas_webhook\"");
    expect(webhookSource).toContain("sales_catalog.payment_webhook_processed");
    expect(postPaymentSource).toContain("\"asaas_webhook\"");
  });

  it("collects lead data required by Asaas before generating payment", () => {
    expect(whatsappAgentRuntimeSource).toContain("runtimeSalesCatalogOrderNeedsCustomerEmailBeforePayment");
    expect(whatsappAgentRuntimeSource).toContain("runtimeSalesCatalogOrderNeedsCustomerDocumentBeforePayment");
    expect(whatsappAgentRuntimeSource).toContain("sales_catalog.customer_billing_details_saved");
    expect(whatsappAgentRuntimeSource).toContain("formatRuntimeDataList");
    expect(whatsappAgentRuntimeSource).toContain("Posso usar esse mesmo endereco");
    expect(whatsappAgentRuntimeSource).toContain("Pix copia e cola:");
    expect(whatsappAgentRuntimeSource).toContain("gateway de pagamento desta empresa");
  });

  it("exposes Asaas operational env and admin monitoring", () => {
    expect(adminIntegrationsSource).toContain("[\"meta-ads\", \"google-growth\", \"asaas\", \"pagbank\", \"webhook-universal\"]");
    expect(adminIntegrationsSource).toContain("function buildAsaasStatus");
    expect(maintenanceVaultSource).toContain("id: \"asaas\"");
    expect(envExampleSource).toContain("ASAAS_AFFILIATE_URL=");
    expect(envExampleSource).toContain("ASAAS_WEBHOOK_ALERT_EMAIL=");
  });
});

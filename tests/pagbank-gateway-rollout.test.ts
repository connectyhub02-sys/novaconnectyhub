import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSource = read("supabase/migrations/0068_pagbank_payment_gateway.sql");
const paymentSessionsSource = read("src/lib/sales-catalog/payment-sessions.ts");
const integrationsSource = read("src/lib/client-os/integrations.ts");
const clientConsoleSource = read("src/components/connectyhub-os/client-integrations-console.tsx");
const pagBankGatewaySource = read("src/lib/sales-catalog/pagbank.ts");
const checkoutPageSource = read("src/app/checkout/[sessionId]/page.tsx");
const checkoutOptionsSource = read("src/components/checkout/checkout-payment-options.tsx");
const adminIntegrationsSource = read("src/lib/admin/client-integrations.ts");
const maintenanceVaultSource = read("src/lib/maintenance-vault.ts");
const envExampleSource = read(".env.example");

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("PagBank gateway rollout", () => {
  it("allows PagBank beside preserved Mercado Pago records in payment tables", () => {
    expect(migrationSource).toContain("check (provider in ('mercado_pago', 'pagbank'))");
    expect(migrationSource).toContain("'pagbank'");
    expect(migrationSource).toContain("'mercado-pago'");
    expect(migrationSource).toContain("\"standby\": true");
  });

  it("ships dedicated PagBank OAuth and webhook routes", () => {
    expect(existsSync("src/app/api/dashboard/sales-catalog/payments/pagbank/connect/route.ts")).toBe(true);
    expect(existsSync("src/app/api/dashboard/sales-catalog/payments/pagbank/callback/route.ts")).toBe(true);
    expect(existsSync("src/app/api/dashboard/sales-catalog/payments/pagbank/affiliate/route.ts")).toBe(true);
    expect(existsSync("src/app/api/webhooks/pagbank/route.ts")).toBe(true);
    expect(existsSync("src/lib/sales-catalog/pagbank.ts")).toBe(true);
  });

  it("uses PagBank for client-owned Pix sessions and keeps Mercado Pago for ConnectyHub-owned billing", () => {
    expect(paymentSessionsSource).toContain("return connectyHubOwned ? \"mercado_pago\" : \"pagbank\"");
    expect(paymentSessionsSource).toContain("createPagBankPixOrder");
    expect(paymentSessionsSource).toContain("extractPagBankPixData");
    expect(paymentSessionsSource).toContain("createMercadoPagoPixPayment");
  });

  it("shows one active PagBank connect action in the client integrations panel", () => {
    expect(integrationsSource).toContain("id: \"pagbank\"");
    expect(integrationsSource).toContain("actionLabel: \"Conectar PagBank\"");
    expect(integrationsSource).toContain("buildPagBankConnections");
    expect(clientConsoleSource).toContain("function PagBankGuidedCard");
    expect(clientConsoleSource).toContain("Conectar PagBank");
    expect(clientConsoleSource).toContain("Ja tenho conta");
    expect(clientConsoleSource).toContain("Nao tenho conta");
    expect(clientConsoleSource).toContain("Ja tenho conta abre a tela oficial de permissoes");
    expect(clientConsoleSource).toContain("buildPagBankAffiliateUrl");
    expect(clientConsoleSource).not.toContain("function MercadoPagoGuidedCard");
  });

  it("encodes PagBank OAuth scopes as plus-separated values for the provider", () => {
    expect(pagBankGatewaySource).toContain("PagBank expects between scopes");
    expect(pagBankGatewaySource).toContain("].join(\" \");");
    expect(pagBankGatewaySource).not.toContain("].join(\"+\");");
  });

  it("labels public checkout payment surfaces by provider", () => {
    expect(checkoutPageSource).toContain("formatCheckoutPaymentProviderLabel(session.provider)");
    expect(checkoutPageSource).toContain("loadMercadoPagoSecurity={session.provider === \"mercado_pago\" && canUseCard}");
    expect(checkoutOptionsSource).toContain("paymentProviderLabel");
    expect(checkoutOptionsSource).toContain("Abrir pagamento no {paymentProviderLabel}");
  });

  it("moves admin monitoring and platform credentials to PagBank without deleting Mercado Pago standby credentials", () => {
    expect(adminIntegrationsSource).toContain("[\"meta-ads\", \"google-growth\", \"pagbank\", \"webhook-universal\"]");
    expect(adminIntegrationsSource).toContain(".eq(\"provider\", \"pagbank\")");
    expect(maintenanceVaultSource).toContain("id: \"pagbank\"");
    expect(maintenanceVaultSource).toContain("PAGBANK_AFFILIATE_CONNECT_URL");
    expect(maintenanceVaultSource).toContain("id: \"mercado-pago\"");
    expect(maintenanceVaultSource).toContain("standby");
    expect(envExampleSource).toContain("PAGBANK_CLIENT_ID=");
    expect(envExampleSource).toContain("PAGBANK_AFFILIATE_CONNECT_URL=");
    expect(envExampleSource).toContain("MERCADO_PAGO_CLIENT_ID=");
  });
});

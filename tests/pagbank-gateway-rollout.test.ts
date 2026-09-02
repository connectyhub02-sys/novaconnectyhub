import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSource = read("supabase/migrations/0068_pagbank_payment_gateway.sql");
const platformBillingMigrationSource = read("supabase/migrations/0069_pagbank_platform_billing.sql");
const platformProductBillingCycleMigrationSource = read("supabase/migrations/0070_platform_product_billing_cycle.sql");
const renewalAndResponsibleMigrationSource = read("supabase/migrations/0071_platform_renewal_and_agent_responsibles.sql");
const pagBankBillingCardMethodsMigrationSource = read("supabase/migrations/0072_pagbank_billing_card_methods.sql");
const paymentSessionsSource = read("src/lib/sales-catalog/payment-sessions.ts");
const integrationsSource = read("src/lib/client-os/integrations.ts");
const clientConsoleSource = read("src/components/connectyhub-os/client-integrations-console.tsx");
const pagBankGatewaySource = read("src/lib/sales-catalog/pagbank.ts");
const checkoutPageSource = read("src/app/checkout/[sessionId]/page.tsx");
const checkoutOptionsSource = read("src/components/checkout/checkout-payment-options.tsx");
const publicCheckoutCardRouteSource = read("src/app/api/checkout/[sessionId]/card/route.ts");
const publicPagBankCardSessionRouteSource = read("src/app/api/checkout/[sessionId]/pagbank-card-session/route.ts");
const adminIntegrationsSource = read("src/lib/admin/client-integrations.ts");
const maintenanceVaultSource = read("src/lib/maintenance-vault.ts");
const envExampleSource = read(".env.example");
const planIntentSource = read("src/app/api/dashboard/billing/plan-intent/route.ts");
const billingPixRouteSource = read("src/app/api/dashboard/billing/checkout/[subscriptionId]/pix/route.ts");
const billingCardRouteSource = read("src/app/api/dashboard/billing/checkout/[subscriptionId]/card/route.ts");
const billingPagBankCardSessionRouteSource = read("src/app/api/dashboard/billing/checkout/[subscriptionId]/pagbank-card-session/route.ts");
const billingStatusRouteSource = read("src/app/api/dashboard/billing/checkout/[subscriptionId]/status/route.ts");
const platformBillingWebhookSource = read("src/lib/billing/platform-billing-webhook.ts");
const platformBillingAdminSource = read("src/lib/billing/platform-billing-admin.ts");
const dashboardSalesCatalogSource = read("src/app/api/dashboard/sales-catalog/route.ts");
const salesCatalogConsoleSource = read("src/components/connectyhub-os/sales-catalog-console.tsx");
const salesCatalogSharedSource = read("src/lib/sales-catalog/shared.ts");
const googleMapsCredentialsSource = read("src/lib/google-maps/credentials.ts");
const googleMapsConfigRouteSource = read("src/app/api/dashboard/sales-catalog/maps/config/route.ts");
const commerceAgentSource = read("src/lib/commerce-agent/server.ts");
const whatsappAgentRuntimeSource = read("src/lib/whatsapp/agent-runtime.ts");
const whatsappConsoleSource = read("src/components/connectyhub-os/whatsapp-console.tsx");
const platformProductsSource = read("src/lib/platform-products.ts");
const platformProductsApiSource = read("src/app/api/admin/platform-products/route.ts");
const platformProductsConsoleSource = read("src/components/connectyhub-os/platform-products-console.tsx");
const planCheckoutSource = read("src/lib/billing/plan-checkout.ts");
const billingPlanCheckoutComponentSource = read("src/components/connectyhub-os/billing-plan-checkout.tsx");
const pagBankCardFormSource = read("src/components/checkout/pagbank-card-form.tsx");
const billingPaymentMethodsSource = read("src/lib/billing/payment-methods.ts");
const trialAccessSource = read("src/lib/billing/trial.ts");
const trialNotificationsSource = read("src/lib/billing/trial-notifications.ts");
const renewalPolicySource = read("src/lib/billing/renewal-policy.ts");
const platformAutomationsSource = read("src/lib/automations/platform-automations.ts");
const platformAutomationsConsoleSource = read("src/components/connectyhub-os/platform-automations-center.tsx");
const paidLifecycleSource = read("src/lib/billing/paid-lifecycle-notifications.ts");
const responsibleHumanSource = read("src/lib/agents/responsible-human.ts");
const clientAgentsSource = read("src/lib/client-os/agents.ts");
const clientAgentsConsoleSource = read("src/components/connectyhub-os/client-agents-console.tsx");
const agentResponsiblesEditorSource = read("src/components/connectyhub-os/agent-responsibles-editor.tsx");
const whatsappWorkspaceSource = read("src/lib/whatsapp/client-workspace.ts");
const postPaymentSource = read("src/lib/sales-catalog/post-payment.ts");

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

  it("uses PagBank for client-owned Pix sessions and ConnectyHub-owned products", () => {
    expect(paymentSessionsSource).toContain("function resolvePaymentGatewayProvider(): PaymentGatewayProvider");
    expect(paymentSessionsSource).toContain("return \"pagbank\"");
    expect(paymentSessionsSource).toContain("loadPagBankPlatformBillingConfig");
    expect(paymentSessionsSource).toContain("createPagBankPixOrder");
    expect(paymentSessionsSource).toContain("extractPagBankPixData");
    expect(paymentSessionsSource).toContain("createMercadoPagoPixPayment");
    expect(pagBankGatewaySource).toContain("charges: [");
    expect(pagBankGatewaySource).toContain("type: \"PIX\"");
    expect(pagBankGatewaySource).toContain("Frete e ajustes");
    expect(pagBankGatewaySource).toContain("sanitizePagBankReferenceId");
    expect(pagBankGatewaySource).toContain("charge?.qr_code");
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
    expect(pagBankGatewaySource).toContain("pagBankDefaultScopeList");
    expect(pagBankGatewaySource).toContain("listMissingPagBankRequestedScopes");
    expect(pagBankGatewaySource).toContain("payments.split.read");
    expect(pagBankGatewaySource).toContain("PagBank expects between scopes");
    expect(pagBankGatewaySource).toContain(".join(\" \");");
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
    expect(maintenanceVaultSource).toContain("id: \"pagbank-billing\"");
    expect(maintenanceVaultSource).toContain("PAGBANK_AFFILIATE_CONNECT_URL");
    expect(maintenanceVaultSource).toContain("id: \"mercado-pago\"");
    expect(maintenanceVaultSource).toContain("standby");
    expect(envExampleSource).toContain("PAGBANK_CLIENT_ID=");
    expect(envExampleSource).toContain("PAGBANK_BILLING_ACCESS_TOKEN=");
    expect(envExampleSource).toContain("PAGBANK_BILLING_PUBLIC_KEY=");
    expect(envExampleSource).toContain("PAGBANK_BILLING_3DS_SESSION_URL=");
    expect(envExampleSource).toContain("PAGBANK_BILLING_SDK_ENV=");
    expect(envExampleSource).toContain("PAGBANK_AFFILIATE_CONNECT_URL=");
    expect(envExampleSource).toContain("MERCADO_PAGO_CLIENT_ID=");
  });

  it("uses PagBank as the default ConnectyHub plan billing provider", () => {
    expect(platformBillingMigrationSource).toContain("recurring_provider = 'pagbank'");
    expect(platformBillingMigrationSource).toContain("alter column billing_provider set default 'pagbank'");
    expect(platformBillingMigrationSource).toContain("'pagbank-billing'");
    expect(planIntentSource).toContain("loadPlatformBillingProvider");
    expect(planIntentSource).toContain(".select(\"recurring_provider\")");
    expect(billingPixRouteSource).toContain("createPagBankBillingPix");
    expect(billingPixRouteSource).toContain("processPlatformBillingPagBankWebhook");
    expect(existsSync("src/app/api/webhooks/pagbank/platform-billing/route.ts")).toBe(true);
    expect(platformBillingWebhookSource).toContain("processPlatformBillingPagBankWebhook");
    expect(platformBillingWebhookSource).toContain("provider: \"pagbank\"");
    expect(platformBillingAdminSource).toContain("providerLabel: \"PagBank\"");
  });

  it("adds PagBank transparent card checkout, 3DS and encrypted token storage for ConnectyHub billing", () => {
    expect(pagBankGatewaySource).toContain("createPagBankCardOrder");
    expect(pagBankGatewaySource).toContain("ensurePagBankCardPublicKey");
    expect(pagBankGatewaySource).toContain("createPagBankThreeDSSession");
    expect(pagBankGatewaySource).toContain("authentication_method");
    expect(pagBankGatewaySource).toContain("recurring: input.recurringType");
    expect(pagBankGatewaySource).toContain("store: input.storeCard");
    expect(maintenanceVaultSource).toContain("PAGBANK_BILLING_PUBLIC_KEY");
    expect(maintenanceVaultSource).toContain("PAGBANK_BILLING_3DS_SESSION_URL");
    expect(maintenanceVaultSource).toContain("PAGBANK_BILLING_SDK_ENV");
    expect(billingPagBankCardSessionRouteSource).toContain("createPagBankThreeDSSession");
    expect(billingPagBankCardSessionRouteSource).toContain("ensurePagBankCardPublicKey");
    expect(billingCardRouteSource).toContain("createPagBankCardOrder");
    expect(billingCardRouteSource).toContain("extractPagBankCardData");
    expect(billingCardRouteSource).toContain("saveDefaultPagBankBillingCardMethod");
    expect(billingCardRouteSource).toContain("processPlatformBillingPagBankWebhook");
    expect(billingPlanCheckoutComponentSource).toContain("PagBankCardForm");
    expect(billingPlanCheckoutComponentSource).toContain("billingProvider === \"pagbank\"");
    expect(pagBankCardFormSource).toContain("PagSeguro.encryptCard");
    expect(pagBankCardFormSource).toContain("PagSeguro.authenticate3DS");
    expect(pagBankCardFormSource).toContain("billingAddress");
    expect(pagBankBillingCardMethodsMigrationSource).toContain("create table if not exists public.billing_payment_methods");
    expect(pagBankBillingCardMethodsMigrationSource).toContain("provider_token_encrypted text not null");
    expect(billingPaymentMethodsSource).toContain("encryptCredentialValue(token)");
    expect(billingPaymentMethodsSource).toContain("decryptCredentialValue(row.provider_token_encrypted)");
  });

  it("extends PagBank card checkout to public product payments without treating recurring products as one-time", () => {
    expect(checkoutPageSource).toContain("canUsePagBankCard");
    expect(checkoutPageSource).toContain("pagBankCardEnabled");
    expect(checkoutPageSource).toContain("pagBankCardPaymentMethodTypes");
    expect(checkoutPageSource).toContain("paymentProvider={paymentProvider}");
    expect(checkoutOptionsSource).toContain("PagBankCardForm");
    expect(checkoutOptionsSource).toContain("pagBankCardPaymentMethodTypes");
    expect(checkoutOptionsSource).toContain("cardSessionPath={`/api/checkout/${sessionId}/pagbank-card-session`}");
    expect(paymentSessionsSource).toContain("method === \"credit_card\" || method === \"debit_card\"");
    expect(pagBankCardFormSource).toContain("PaymentTypeButton");
    expect(pagBankCardFormSource).toContain("payment_method_type: activePaymentMethodType");
    expect(pagBankCardFormSource).toContain("type: input.paymentMethodType");
    expect(publicPagBankCardSessionRouteSource).toContain("ensurePagBankCardPublicKey");
    expect(publicPagBankCardSessionRouteSource).toContain("createPagBankThreeDSSession");
    expect(publicCheckoutCardRouteSource).toContain("processPagBankPublicCardPayment");
    expect(publicCheckoutCardRouteSource).toContain("createPagBankCardOrder");
    expect(publicCheckoutCardRouteSource).toContain("extractPagBankCardData");
    expect(publicCheckoutCardRouteSource).toContain("hasRecurringSalesCatalogOrderItem");
    expect(publicCheckoutCardRouteSource).toContain("Produto recorrente precisa do fluxo de cobranca recorrente");
  });

  it("exposes maintainable PagBank payment preferences for client stores", () => {
    expect(salesCatalogSharedSource).toContain("SalesCatalogPagBankSettings");
    expect(salesCatalogSharedSource).toContain("salesCatalogPagBankPaymentMethodOptions");
    expect(salesCatalogSharedSource).toContain("recurringEnabled: boolean");
    expect(paymentSessionsSource).toContain("pagbank_settings");
    expect(paymentSessionsSource).toContain("recurring_enabled: settings.recurringEnabled");
    expect(dashboardSalesCatalogSource).toContain("normalizePagBankSettings");
    expect(dashboardSalesCatalogSource).toContain("serializePagBankSettings");
    expect(dashboardSalesCatalogSource).toContain("save_pagbank_settings");
    expect(dashboardSalesCatalogSource).toContain("PagBank regra do agente");
    expect(dashboardSalesCatalogSource).toContain("recurring_enabled: settings.recurringEnabled");
    expect(integrationsSource).toContain("pagBankPreferences");
    expect(clientConsoleSource).toContain("Preferencias de pagamento");
    expect(clientConsoleSource).toContain("Pagamento recorrente");
    expect(clientConsoleSource).toContain("Salvar preferencias PagBank");
    expect(clientConsoleSource).toContain("togglePagBankPreferenceMethod");
    expect(clientConsoleSource).toContain("Nome no extrato");
    expect(clientConsoleSource).toContain("pagBankInstallmentOptions");
    expect(clientConsoleSource).toContain("buildPagBankInterestFreeOptions");
    expect(salesCatalogConsoleSource).not.toContain("PagBank Checkout");
    expect(salesCatalogConsoleSource).not.toContain("togglePagBankPaymentMethod");
    expect(salesCatalogConsoleSource).toContain("recurringEnabled: settingsDraft.pagBank.recurringEnabled");
  });

  it("separates recurring plans from one-time or recurring ConnectyHub products", () => {
    expect(platformProductBillingCycleMigrationSource).toContain("billing_cycle text not null default 'one_time'");
    expect(platformProductBillingCycleMigrationSource).toContain("billing_interval text not null default 'month'");
    expect(platformProductBillingCycleMigrationSource).toContain("check (billing_cycle in ('one_time', 'recurring'))");
    expect(platformProductsSource).toContain("PlatformProductBillingCycle");
    expect(platformProductsSource).toContain("billingCycle: normalizeBillingCycle");
    expect(platformProductsApiSource).toContain("billing_cycle: billingCycle");
    expect(platformProductsApiSource).toContain("billing_interval: billingInterval");
    expect(platformProductsConsoleSource).toContain("Modelo de cobranca");
    expect(platformProductsConsoleSource).toContain("Pagamento unico");
    expect(platformProductsConsoleSource).toContain("Recorrente");
    expect(planCheckoutSource).toContain("billingCycle === \"one_time\"");
  });

  it("keeps client product billing model and agent payment policy explicit", () => {
    expect(salesCatalogSharedSource).toContain("formatSalesCatalogBillingCycleWithInterval");
    expect(salesCatalogSharedSource).toContain("Cobranca:");
    expect(dashboardSalesCatalogSource).toContain("billing_cycle: billingCycle");
    expect(dashboardSalesCatalogSource).toContain("billing_interval: billingInterval");
    expect(salesCatalogConsoleSource).toContain("Modelo de cobranca");
    expect(salesCatalogConsoleSource).toContain("Pagamento unico");
    expect(salesCatalogConsoleSource).toContain("Recorrente");
    expect(commerceAgentSource).toContain("Metodos PagBank habilitados");
    expect(commerceAgentSource).toContain("O agente so pode oferecer formas de pagamento habilitadas");
    expect(whatsappAgentRuntimeSource).toContain("Metodos PagBank habilitados");
    expect(whatsappAgentRuntimeSource).toContain("Pix PagBank: depois da confirmacao do pedido");
    expect(whatsappAgentRuntimeSource).toContain("Nunca peca numero, validade, CVV ou dados sensiveis de cartao pelo WhatsApp");
    expect(whatsappAgentRuntimeSource).toContain("cobranca interna");
  });

  it("delivers PagBank Pix directly in WhatsApp and blocks one-time Pix for recurring products", () => {
    expect(whatsappAgentRuntimeSource).toContain("shouldSendSalesCatalogPixInsideWhatsapp");
    expect(whatsappAgentRuntimeSource).toContain("sendSalesCatalogPixDirectWhatsapp");
    expect(whatsappAgentRuntimeSource).toContain("Pix copia e cola:");
    expect(whatsappAgentRuntimeSource).toContain("whatsapp_pix_code");
    expect(whatsappAgentRuntimeSource).toContain("agent_pix_payment");
    expect(whatsappAgentRuntimeSource).toContain("billing_cycles: Array.from(new Set(items.map((item) => item.billingCycle)))");
    expect(paymentSessionsSource).toContain("hasRecurringSalesCatalogOrderItem(orderMetadata, items)");
    expect(paymentSessionsSource).toContain("Produto recorrente precisa do fluxo de cobranca recorrente antes de gerar Pix unico.");
  });

  it("binds catalog freight and pickup offers to explicit store settings", () => {
    expect(salesCatalogSharedSource).toContain("shippingEnabled: boolean");
    expect(dashboardSalesCatalogSource).toContain("shipping_enabled: shippingEnabled");
    expect(dashboardSalesCatalogSource).toContain("Complete valor, prazo minimo e prazo maximo dos estados ativos");
    expect(dashboardSalesCatalogSource).toContain("deixe os dois vazios para atender o estado inteiro");
    expect(dashboardSalesCatalogSource).toContain("todo o estado");
    expect(dashboardSalesCatalogSource).toContain("Frete por entrega esta desativado para este catalogo");
    expect(salesCatalogConsoleSource).toContain("Frete por entrega");
    expect(salesCatalogConsoleSource).toContain("Nao entrego");
    expect(salesCatalogConsoleSource).toContain("CEP de origem opc.");
    expect(salesCatalogConsoleSource).toContain("CEP inicial e final sao opcionais");
    expect(salesCatalogConsoleSource).toContain("disabled={!rule.active}");
    expect(salesCatalogConsoleSource).toContain("shippingDraft.shippingEnabled");
    expect(whatsappAgentRuntimeSource).toContain("buildSalesCatalogShippingPolicyLines");
    expect(whatsappAgentRuntimeSource).toContain("Nao peca CEP para calcular frete");
    expect(whatsappAgentRuntimeSource).toContain("Nao ofereca retirada local");
    expect(whatsappAgentRuntimeSource).toContain("const canShip = Boolean(shippingSettings?.configured && shippingSettings.shippingEnabled)");
    expect(whatsappAgentRuntimeSource).toContain("const canPickup = Boolean(shippingSettings?.configured && shippingSettings.localPickup)");
  });

  it("adds Google Maps powered local delivery zones for client catalog agents", () => {
    expect(salesCatalogSharedSource).toContain("SalesCatalogLocalDeliveryZone");
    expect(salesCatalogSharedSource).toContain("localDeliveryEnabled: boolean");
    expect(maintenanceVaultSource).toContain("id: \"google-maps\"");
    expect(maintenanceVaultSource).toContain("GOOGLE_MAPS_BROWSER_API_KEY");
    expect(maintenanceVaultSource).toContain("GOOGLE_MAPS_SERVER_API_KEY");
    expect(envExampleSource).toContain("GOOGLE_MAPS_BROWSER_API_KEY=");
    expect(envExampleSource).toContain("GOOGLE_MAPS_SERVER_API_KEY=");
    expect(googleMapsCredentialsSource).toContain("loadGoogleMapsCredentials");
    expect(googleMapsConfigRouteSource).toContain("browserApiKey");
    expect(googleMapsConfigRouteSource).toContain("serverConfigured");
    expect(dashboardSalesCatalogSource).toContain("local_delivery_enabled: localDeliveryEnabled");
    expect(dashboardSalesCatalogSource).toContain("normalizeLocalDeliveryZones");
    expect(dashboardSalesCatalogSource).toContain("Complete a area atendida das zonas locais");
    expect(salesCatalogConsoleSource).toContain("Entrega local por area");
    expect(salesCatalogConsoleSource).toContain("LocalDeliveryMapEditor");
    expect(salesCatalogConsoleSource).toContain("GOOGLE_MAPS_BROWSER_API_KEY");
    expect(whatsappAgentRuntimeSource).toContain("maybeAttachSalesCatalogLocalDeliveryToOrder");
    expect(whatsappAgentRuntimeSource).toContain("`- Entrega local: ${settings.localDeliveryEnabled");
    expect(whatsappAgentRuntimeSource).toContain("zonas locais ativas");
  });

  it("adds a configurable WhatsApp renewal policy for ConnectyHub billing", () => {
    expect(renewalPolicySource).toContain("pixReminderStartDays: 3");
    expect(renewalPolicySource).toContain("cardChargeAttemptDays: 3");
    expect(platformAutomationsSource).toContain("renewalPolicy");
    expect(platformAutomationsSource).toContain("paid_plan_renewal_reminder");
    expect(platformAutomationsConsoleSource).toContain("Regua financeira");
    expect(platformAutomationsConsoleSource).toContain("/api/admin/automations/renewal-policy");
    expect(paidLifecycleSource).toContain("loadRenewalPolicy");
    expect(paidLifecycleSource).toContain("ensureLifecycleRenewalCheckout");
    expect(paidLifecycleSource).toContain("maybeAttemptPagBankCardRenewal");
    expect(paidLifecycleSource).toContain("loadDefaultPagBankBillingCardMethod");
    expect(paidLifecycleSource).toContain("recurringType: \"SUBSEQUENT\"");
    expect(paidLifecycleSource).toContain("paid_lifecycle_renewal_checkout");
    expect(paidLifecycleSource).toContain("renewal_invoice_id");
    expect(paidLifecycleSource).toContain("payment_card_retry_failed");
    expect(platformBillingWebhookSource).toContain("dias_carencia");
    expect(platformBillingWebhookSource).toContain("enqueueResponsibleBillingNotifications");
    expect(platformBillingWebhookSource).toContain("recipient_kind: \"agent_responsible\"");
    expect(platformBillingWebhookSource).toContain("Cliente sem telefone no perfil.");
    expect(renewalAndResponsibleMigrationSource).toContain("paid_plan_due_today");
    expect(renewalAndResponsibleMigrationSource).toContain("renewal_policy");
  });

  it("requires a responsible human for client WhatsApp agents and syncs it into behavior", () => {
    expect(responsibleHumanSource).toContain("agentResponsibleHumanMetadataKey");
    expect(responsibleHumanSource).toContain("agentResponsibleHumansMetadataKey");
    expect(responsibleHumanSource).toContain("mergeResponsibleHumansIntoBehaviorConfig");
    expect(clientAgentsSource).toContain("responsibleHumanPhone");
    expect(clientAgentsSource).toContain("requireAtLeastOne: true");
    expect(clientAgentsConsoleSource).toContain("AgentResponsiblesEditor");
    expect(agentResponsiblesEditorSource).toContain("Responsaveis humanos");
    expect(agentResponsiblesEditorSource).toContain("Todos os campos sao obrigatorios");
    expect(agentResponsiblesEditorSource).toContain("Responsavel pendente");
    expect(whatsappConsoleSource).toContain("responsibleHumanPhone");
    expect(whatsappConsoleSource).toContain("AgentResponsiblesEditor");
    expect(whatsappWorkspaceSource).toContain("readAgentResponsibleHuman");
    expect(whatsappWorkspaceSource).toContain("mergeResponsibleHumansIntoBehaviorConfig");
    expect(whatsappWorkspaceSource).toContain("serializeAgentResponsibleHumans");
    expect(renewalAndResponsibleMigrationSource).toContain("responsible_human");
  });

  it("notifies the agent responsible human when a catalog payment is approved", () => {
    expect(postPaymentSource).toContain("maybeNotifyResponsiblePaymentApproved");
    expect(postPaymentSource).toContain("sales_catalog.payment_responsible_notification_sent");
    expect(postPaymentSource).toContain("payment_responsible_whatsapp_notified_at");
    expect(postPaymentSource).toContain("resolveResponsiblePaymentPhone");
    expect(postPaymentSource).toContain("readAgentResponsibleHuman");
    expect(postPaymentSource).toContain("loadResponsiblePaymentAgent");
  });

  it("blocks zero-credit trials and keeps trial start notifications deduped", () => {
    expect(trialAccessSource).toContain("state: \"trial_no_credits\"");
    expect(trialAccessSource).toContain("canUseBillableFeatures: false");
    expect(trialAccessSource).toContain("Creditos do teste acabaram");
    expect(trialNotificationsSource).toContain("buildTrialNotificationDedupeKey(trigger, row.organization_id)");
    expect(trialNotificationsSource).toContain("return `trial:started:${organizationId}`;");
  });

  it("creates renewal and plan-change checkouts without changing the active plan first", () => {
    expect(planIntentSource).toContain("createCheckoutForExistingSubscription");
    expect(planIntentSource).toContain("isRenewableSubscription(existingSubscription.status)");
    expect(planIntentSource).toContain("checkoutKind: BillingCheckoutKind");
    expect(planIntentSource).toContain("checkout_kind: input.checkoutKind");
    expect(planIntentSource).toContain("target_plan_code: input.plan.plan_code");
    expect(planIntentSource).toContain("A troca sera aplicada apos o pagamento aprovado");
    expect(planCheckoutSource).toContain("export type BillingCheckoutKind = \"initial\" | \"renewal\" | \"plan_change\"");
    expect(planCheckoutSource).toContain("targetPlanCode: string");
    expect(planCheckoutSource).toContain("[\"pending\", \"incomplete\", \"past_due\", \"active\"].includes(intent.subscription.status)");
  });

  it("applies the target plan and grants credits per paid invoice", () => {
    expect(platformBillingWebhookSource).toContain("const targetPlanCode = normalizePlanCode(checkoutMetadata.target_plan_code)");
    expect(platformBillingWebhookSource).toContain("const previousCreditTransactionId = readString(paymentPayload?.credit_transaction_id)");
    expect(platformBillingWebhookSource).toContain("p_plan_code: activatedPlanCode");
    expect(platformBillingWebhookSource).toContain("plan_id: plan.id");
    expect(platformBillingWebhookSource).toContain("plan_code: activatedPlanCode");
    expect(platformBillingWebhookSource).toContain("included_credits_granted: includedCredits");
  });

  it("does not treat active subscriptions as confirmed while a renewal payment is pending", () => {
    expect(billingStatusRouteSource).toContain("return intent.invoice.status === \"paid\"");
    expect(billingStatusRouteSource).not.toContain("return intent.subscription.status === \"active\"");
    expect(billingPlanCheckoutComponentSource).toContain("[\"pending\", \"incomplete\", \"past_due\", \"active\"].includes(currentSubscriptionStatus)");
    expect(billingPlanCheckoutComponentSource).toContain("const checkoutConfirmed = currentPaymentStatus === \"approved\";");
    expect(billingPlanCheckoutComponentSource).not.toContain("data?.subscriptionStatus === \"active\"");
  });
});

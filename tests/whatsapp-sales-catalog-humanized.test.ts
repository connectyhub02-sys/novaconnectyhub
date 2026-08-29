import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeSource = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");

function sourceBetween(start: string, end: string) {
  const startIndex = runtimeSource.indexOf(start);
  const endIndex = runtimeSource.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return runtimeSource.slice(startIndex, endIndex);
}

describe("WhatsApp sales catalog humanized replies", () => {
  it("keeps catalog data as internal memory instead of customer copy", () => {
    const builder = sourceBetween(
      "function buildSalesCatalogLines",
      "function buildSalesCatalogCommerceLines",
    );

    expect(builder).toContain("memoria interna");
    expect(builder).toContain("Nunca copie a ficha tecnica completa");
    expect(builder).toContain("responda em ate 2 mensagens curtas");
    expect(builder).toContain("resumo interno: ${preview(item.description, 180)}");
    expect(builder).toContain("formatRuntimeSalesCatalogDestinationForPrompt(item)");
    expect(builder).not.toContain("formatSalesCatalogInline");
  });

  it("renders product tags as short customer mentions and removes internal fields", () => {
    const renderer = sourceBetween(
      "function renderSalesCatalogTags",
      "function collectSalesCatalogAttachments",
    );

    expect(renderer).toContain("formatSalesCatalogCustomerMention(item)");
    expect(renderer).toContain("referencesSalesCatalogItem(normalizedOriginalText, item)");
    expect(renderer).toContain("function sanitizeSalesCatalogCustomerText");
    expect(renderer).toContain("destino da venda");
    expect(renderer).toContain("estoque e disponibilidade");
    expect(renderer).not.toContain("formatSalesCatalogInline(item)");
  });

  it("gates catalog media and checks lead purchase intent before checkout", () => {
    const delivery = sourceBetween("async function sendAgentResponse", "type CompanyLocationReply");
    const catalogRuntime = sourceBetween(
      "function collectSalesCatalogAttachments",
      "async function persistSalesCatalogUnavailableOrderAttempt",
    );

    expect(delivery).toContain("shouldSendSalesCatalogMediaAttachments(latestInbound, cleanText)");
    expect(delivery).toContain("buildSalesCatalogOrderIntentText(latestInbound, cleanText)");
    expect(delivery).toContain("intentText: orderIntentText");
    expect(catalogRuntime).toContain("attachments.length >= 2");
    expect(catalogRuntime).toContain("function shouldSendSalesCatalogMediaAttachments");
    expect(catalogRuntime).toContain("intentText?: string");
    expect(catalogRuntime).toContain("const intentText = input.intentText ?? input.text");
    expect(catalogRuntime).toContain("hasSalesCatalogOrderIntent(intentText)");
  });

  it("requires a confirmed order preview before creating checkout links", () => {
    const delivery = sourceBetween("async function sendAgentResponse", "type CompanyLocationReply");
    const checkoutRuntime = sourceBetween(
      "type RuntimeSalesCatalogOrderSelection",
      "async function persistSalesCatalogUnavailableOrderAttempt",
    );

    expect(delivery).toContain("hasRecentSalesCatalogCheckoutConfirmation(context, orderIntentText)");
    expect(delivery).toContain("shouldRequestSalesCatalogCheckoutConfirmation");
    expect(delivery).toContain("buildSalesCatalogOrderConfirmationPrompt(checkoutOrderSelections)");
    expect(checkoutRuntime).toContain("source: \"current_response\" | \"recent_lead_message\" | \"confirmation_preview\"");
    expect(checkoutRuntime).toContain("salesCatalogCheckoutConfirmationWindowMs");
    expect(checkoutRuntime).toContain("Posso fechar seu pedido e te mandar o link de pagamento?");
    expect(checkoutRuntime).toContain("if (!hasRecentSalesCatalogCheckoutConfirmation(input.context, intentText))");
  });

  it("sends checkout links even when payment is deferred for shipping", () => {
    const deliveryText = sourceBetween(
      "function prepareSalesCatalogDeliveryText",
      "function hasSubstantiveSalesCatalogAnswer",
    );
    const checkoutRuntime = sourceBetween(
      "async function maybeCreateSalesCatalogPaymentLink",
      "async function maybeSendExistingSalesCatalogCheckoutLink",
    );
    const paymentSender = sourceBetween(
      "async function sendSalesCatalogPaymentLink",
      "async function maybeSendSalesCatalogProductPageLinks",
    );

    expect(deliveryText).toContain("const closing = input.hasOrderIntent\n    ? \"\"");
    expect(checkoutRuntime).not.toContain("if (result.paymentDeferred)");
    expect(checkoutRuntime).toContain("paymentDeferred: result.paymentDeferred === true");
    expect(checkoutRuntime).toContain("paymentDeferredReason: result.paymentDeferredReason ?? null");
    expect(paymentSender).toContain("confirma entrega/frete antes do pagamento");
  });

  it("resends existing checkout links before handing payment-link follow-ups to the model", () => {
    const runtime = sourceBetween("async function processWhatsappAgentRun", "async function loadRunContext");
    const checkoutRecovery = sourceBetween(
      "async function maybeSendExistingSalesCatalogCheckoutLink",
      "function findRecentPendingSalesCatalogCheckoutOrder",
    );
    const followUpDetection = sourceBetween(
      "function isSalesCatalogPaymentLinkFollowUp",
      "async function sendSalesCatalogPaymentLink",
    );

    expect(runtime).toContain("maybeSendExistingSalesCatalogCheckoutLink");
    expect(runtime).toContain("reason: \"sales_catalog_existing_checkout_link\"");
    expect(checkoutRecovery).toContain(".from(\"sales_catalog_payment_sessions\")");
    expect(checkoutRecovery).toContain("sendSalesCatalogPaymentLink");
    expect(followUpDetection).toContain("hasRecentSalesCatalogCheckoutPromise");
    expect(followUpDetection).toContain("link de pagamento");
  });

  it("keeps checkout payment links out of reusable agent links", () => {
    const loader = sourceBetween(
      "async function loadOrganizationLinkButtons",
      "async function loadAgentLearnings",
    );

    expect(loader).toContain("tags.has(\"sales_catalog_checkout\")");
    expect(loader).toContain("tags.has(\"sales_catalog_order\")");
    expect(loader).toContain("asString(metadata.payment_session_id) !== null");
    expect(loader).toContain("source === \"sales_catalog_checkout\"");
    expect(loader).toContain("salesDestination === \"connectyhub_checkout\"");
    expect(loader).toContain("loadPlatformSectorLinkButtons");
    expect(loader).toContain(".filter((row) => !isSalesCatalogRuntimeLinkButton(row))");
  });

  it("adds the global payment confirmation rule to every agent prompt", () => {
    const instruction = sourceBetween(
      "function buildSystemInstruction",
      "function buildLeadNameContext",
    );
    const globalRule = sourceBetween(
      "function buildGlobalCheckoutConfirmationLines",
      "function buildLinkButtonLines",
    );

    expect(instruction).toContain("REGRA GLOBAL DE FECHAMENTO E PAGAMENTO");
    expect(globalRule).toContain("vale para todos os agentes");
    expect(globalRule).toContain("inclusive agentes internos");
    expect(globalRule).toContain("Nunca reutilize link de checkout/pagamento antigo ou de outro lead");
  });

  it("preserves substantive product explanations before offering product pages", () => {
    const delivery = sourceBetween("async function sendAgentResponse", "type CompanyLocationReply");
    const renderer = sourceBetween(
      "function renderSalesCatalogTags",
      "async function recordSalesCatalogOrderIntent",
    );

    expect(delivery).toContain("const shouldOfferProductPageLinks = !shouldRequestCheckoutConfirmation && shouldSendSalesCatalogProductPageLinks(latestInbound, cleanText);");
    expect(delivery).toContain("!hasOrderIntent && shouldOfferProductPageLinks");
    expect(delivery).toContain("const hasCatalogAction = hasOrderIntent || catalogAttachments.length > 0 || shouldOfferProductPageLinks;");
    expect(renderer).toContain("hasSubstantiveSalesCatalogAnswer(input.text)");
    expect(renderer).toContain("return input.text;");
    expect(renderer).toContain("function shouldSendSalesCatalogProductPageLinks");
    expect(renderer).toContain("latestInbound?.text_content");
  });
});

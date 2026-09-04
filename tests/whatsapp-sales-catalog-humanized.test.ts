import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeSource = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");
const paymentSessionsSource = readFileSync("src/lib/sales-catalog/payment-sessions.ts", "utf8");

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
    expect(renderer).toContain("sanitizeCustomerVisibleInternalTags(rendered)");
    expect(renderer).toContain("function sanitizeSalesCatalogCustomerText");
    expect(renderer).toContain("destino da venda");
    expect(renderer).toContain("estoque e disponibilidade");
    expect(renderer).not.toContain("formatSalesCatalogInline(item)");
  });

  it("strips complete and dangling internal tags before WhatsApp delivery", () => {
    const sanitizer = sourceBetween(
      "function sanitizeCustomerVisibleInternalTags",
      "function buildLeadAwareTrackingUrl",
    );

    expect(runtimeSource).toContain("const completeCustomerVisibleInternalTagRegex");
    expect(runtimeSource).toContain("const danglingCustomerVisibleInternalTagRegex");
    expect(runtimeSource).toContain("link|checkout|produto");
    expect(sanitizer).toContain(".replace(completeCustomerVisibleInternalTagRegex, \"\")");
    expect(sanitizer).toContain(".replace(danglingCustomerVisibleInternalTagRegex, \"\")");
    expect(sanitizer).toContain(".trimEnd()");
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

  it("requires a confirmed order preview before creating payment requests", () => {
    const delivery = sourceBetween("async function sendAgentResponse", "type CompanyLocationReply");
    const checkoutRuntime = sourceBetween(
      "type RuntimeSalesCatalogOrderSelection",
      "async function persistSalesCatalogUnavailableOrderAttempt",
    );

    expect(delivery).toContain("hasRecentSalesCatalogCheckoutConfirmation(context, orderIntentText)");
    expect(delivery).toContain("shouldRequestSalesCatalogCheckoutConfirmation");
    expect(delivery).toContain("buildSalesCatalogOrderConfirmationPrompt({");
    expect(checkoutRuntime).toContain("| \"current_response\"");
    expect(checkoutRuntime).toContain("| \"cart_draft\"");
    expect(checkoutRuntime).toContain("| \"confirmation_preview\"");
    expect(checkoutRuntime).toContain("| \"recent_assistant_recommendation\"");
    expect(checkoutRuntime).toContain("salesCatalogCheckoutConfirmationWindowMs");
    expect(checkoutRuntime).toContain("Posso fechar seu pedido e gerar o pagamento?");
    expect(checkoutRuntime).toContain("if (!hasRecentSalesCatalogCheckoutConfirmation(input.context, intentText))");
  });

  it("uses the confirmed order preview as the closed cart source", () => {
    const delivery = sourceBetween("async function sendAgentResponse", "type CompanyLocationReply");
    const checkoutRuntime = sourceBetween(
      "function resolveSalesCatalogOrderSelections",
      "function isRuntimeCheckoutOrderSelection",
    );

    expect(delivery).toContain("const deliveryCatalogItems = hasConfirmedCheckoutIntent && checkoutOrderSelections.length > 0");
    expect(delivery).toContain("items: deliveryCatalogItems");
    expect(checkoutRuntime).toContain("const confirmationPreviewText = confirmedCheckoutIntent");
    expect(checkoutRuntime).toContain("if (confirmationPreviewText)");
    expect(checkoutRuntime).toContain("\"confirmation_preview\",");
    expect(checkoutRuntime).toContain("buildRecentSalesCatalogCartDraftPreviewText");
    expect(checkoutRuntime).toContain("\"cart_draft\",");
    expect(checkoutRuntime).toContain("selectRecentSingleSalesCatalogAssistantRecommendation");
    expect(runtimeSource).toContain("isSalesCatalogOrderPreviewHeaderText");
    expect(runtimeSource).toContain("top|perfeito|show|beleza|blz|combinado");
    expect(runtimeSource).toContain("\\bprevia\\b.{0,100}\\bpedido\\b");
  });

  it("reconstructs split checkout prompts and ignores assistant-only extra items while closing", () => {
    const delivery = sourceBetween("async function sendAgentResponse", "type CompanyLocationReply");
    const checkoutRuntime = sourceBetween(
      "function buildRecentSalesCatalogCheckoutConfirmationPreviewText",
      "function isSalesCatalogMessageOutsideCartWindow",
    );
    const paymentPrompt = sourceBetween(
      "function hasRecentSalesCatalogPaymentMethodChoicePrompt",
      "async function sendSalesCatalogPaymentLink",
    );

    expect(delivery).toContain("const leadCatalogItems = selectSalesCatalogItemsFromText(context.salesCatalog, orderIntentText)");
    expect(delivery).toContain("hasOrderIntent && !shouldUseAssistantCatalogItems ? [] : assistantCatalogItems");
    expect(delivery).toContain("suppressDuplicateSalesCatalogOrderProductMentions(rawDeliveryText, deliveryCatalogItems)");
    expect(checkoutRuntime).toContain("function buildRecentOutboundMessageBlocks");
    expect(checkoutRuntime).toContain("candidate.text");
    expect(checkoutRuntime).toContain("text_content: block.text");
    expect(checkoutRuntime).toContain("function isSalesCatalogCartDraftPreviewText");
    expect(checkoutRuntime).toContain("function hasSalesCatalogCartDraftPreviewDetails");
    expect(paymentPrompt).toContain("buildRecentOutboundMessageBlocks(messages, latestInbound)");
    expect(paymentPrompt).toContain("normalizeSearch(messageBlock.text)");
    expect(runtimeSource).toContain("function suppressDuplicateSalesCatalogOrderProductMentions");
    expect(runtimeSource).toContain("isStandaloneSalesCatalogProductMentionLine");
  });

  it("does not let prerequisite replies introduce assistant-only checkout items", () => {
    const delivery = sourceBetween("async function sendAgentResponse", "type CompanyLocationReply");
    const checkoutRuntime = sourceBetween(
      "function selectSalesCatalogOrderSelectionsFromText",
      "function resolveSalesCatalogMentionQuantity",
    );
    const assistantItemGuard = sourceBetween(
      "function shouldUseAssistantSalesCatalogItemsForOrderIntent",
      "function mergeRuntimeSalesCatalogItems",
    );

    expect(delivery).toContain("shouldUseAssistantSalesCatalogItems");
    expect(delivery).toContain("hasOrderIntent && !shouldUseAssistantCatalogItems ? [] : assistantCatalogItems");
    expect(assistantItemGuard).toContain("resolvesSalesCatalogPaymentPrerequisiteText(input.intentText, input.latestInbound)");
    expect(assistantItemGuard).toContain("detectSalesCatalogPreferredPaymentMethod(input.intentText)");
    expect(checkoutRuntime).toContain("extractSalesCatalogOrderItemLinesText(text)");
    expect(checkoutRuntime).toContain("selectSalesCatalogItemsForOrderText(items, selectionText)");
    expect(checkoutRuntime).toContain("referencesSalesCatalogItemByExactCandidate");
    expect(checkoutRuntime).toContain("isStrongSalesCatalogOrderToken");
  });

  it("does not treat package size as a purchased quantity", () => {
    const quantityParser = sourceBetween(
      "function parseRuntimeOrderQuantityFromText",
      "function hasRuntimeOrderFractionSignal",
    );

    expect(quantityParser).toContain("const bareDigitBefore");
    expect(quantityParser).toContain("\\d{1,2}");
    expect(quantityParser).toContain("(?:x|un|unid|unidade|unidades|peca|pecas|peça|peças|item|itens|pizza|pizzas|caixa|caixas|ampola|ampolas)");
    expect(quantityParser).not.toContain("const digitBefore = before.match(/(?:^|\\s)(\\d{1,3})\\s*(?:x|un|unid|unidade|unidades|peca|pecas|peça|peças|item|itens|pizza|pizzas|caixa|caixas|ampola|ampolas)?\\s*$/);");
  });

  it("asks for the payment method before creating payment when multiple methods are enabled", () => {
    const delivery = sourceBetween("async function sendAgentResponse", "type CompanyLocationReply");
    const checkoutRuntime = sourceBetween(
      "function buildSalesCatalogOrderConfirmationPrompt",
      "function buildSalesCatalogOrderPreviewItem",
    );
    const orderRecorder = sourceBetween(
      "async function recordSalesCatalogOrderIntent",
      "async function maybeCreateSalesCatalogPaymentLink",
    );

    expect(delivery).toContain("paymentMethodChoicePrompt");
    expect(delivery).toContain("shouldWaitForPaymentMethodChoice");
    expect(delivery).toContain("shouldUseControlledPaymentStepText");
    expect(delivery).toContain("paymentMethodChoicePrompt ?? (");
    expect(delivery).toContain("buildSalesCatalogControlledPaymentStepText()");
    expect(delivery).toContain("shouldWaitForPaymentMethodChoice\n      ? null\n      : await recordSalesCatalogOrderIntent");
    expect(checkoutRuntime).toContain("function buildSalesCatalogPaymentMethodChoicePrompt");
    expect(checkoutRuntime).toContain("function shouldUseSalesCatalogControlledPaymentStepText");
    expect(checkoutRuntime).toContain("Qual forma de pagamento voce prefere");
    expect(checkoutRuntime).toContain("No Pix eu envio o codigo para copiar por aqui");
    expect(checkoutRuntime).toContain("Vou seguir com o proximo passo do pagamento usando os dados do pedido");
    expect(checkoutRuntime).toContain("getEnabledSalesCatalogRuntimePaymentChoices");
    expect(orderRecorder).toContain("resolveSalesCatalogConfirmedPaymentPreference");
    expect(orderRecorder).toContain("getEnabledSalesCatalogRuntimePaymentChoices(input.context.salesCatalogSettings).length > 1");
    expect(orderRecorder).toContain("buildRecentSalesCatalogCheckoutInboundMemoryText");
    expect(orderRecorder).toContain("shippingIntentText");
    expect(orderRecorder).toContain("resolveInitialSalesCatalogOrderShipping");
    expect(checkoutRuntime).toContain("buildSalesCatalogOrderConfirmationShippingLine");
    expect(checkoutRuntime).toContain("Taxa de entrega");
    expect(checkoutRuntime).toContain("Frete");
  });

  it("sends checkout links only when payment needs the checkout surface", () => {
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
    expect(paymentSender).toContain("shouldSendSalesCatalogPixInsideWhatsapp");
    expect(paymentSender).toContain("sendSalesCatalogPixDirectWhatsapp");
    expect(paymentSender).toContain("sendWhatsappPaymentRequest");
    expect(runtimeSource).toContain("/send/request-payment");
    expect(paymentSender).toContain("pixCode");
    expect(paymentSender).toContain("whatsapp_pix_payment_request");
    expect(paymentSender).toContain("agent_pix_payment_request");
    expect(paymentSender).toContain("paymentLink");
    expect(paymentSender).toContain("pix_copy_button_and_payment_request_failed");
    expect(paymentSender).toContain("buildSalesCatalogPixCopyButtonChoice");
    expect(paymentSender).toContain("Copiar codigo Pix|copy:");
    expect(paymentSender).toContain("whatsapp_pix_copy_button");
    expect(paymentSender).toContain("agent_pix_copy_button");
    expect(paymentSender).toContain("buildSalesCatalogPixCodeOnlyWhatsappText");
    expect(paymentSender).toContain("codigo Pix sozinho");
    expect(paymentSender).toContain("whatsapp_pix_code_separate_message");
    expect(paymentSender).toContain("agent_pix_payment_fallback_intro");
    expect(paymentSender).toContain("agent_pix_payment_fallback_code");
    expect(paymentSender).toContain("Assim que voce realizar o pagamento, eu te atualizo por aqui.");
    expect(paymentSender).not.toContain("Assim que o ${payment.providerLabel} confirmar");
    expect(paymentSender).toContain("sendSalesCatalogPaymentDeferredWhatsapp");
    expect(paymentSender).toContain("sendSalesCatalogPaymentUnavailableWhatsapp");
    expect(paymentSender).toContain("notifyResponsibleHumanAboutPaymentIssue");
    expect(paymentSender).toContain("resolveHumanHandoffNotificationNumbers(input.context, \"payment_issue\")");
    expect(paymentSender).toContain("payment_gateway_unavailable");
    expect(paymentSender).toContain("delivery_unavailable");
    expect(paymentSender).toContain("sales_catalog_delivery_unavailable");
    expect(paymentSender).toContain("gatewayUnavailable");
    expect(paymentSender).toContain("shouldResolveSalesCatalogPixInsideWhatsapp");
    expect(paymentSender).toContain("pix_code_missing");
    expect(paymentSender).toContain("runtimeSalesCatalogOrderNeedsCustomerNameBeforePayment");
    expect(paymentSender).toContain("runtimeSalesCatalogOrderNeedsCustomerEmailBeforePayment");
    expect(paymentSender).toContain("runtimeSalesCatalogOrderNeedsCustomerDocumentBeforePayment");
    expect(paymentSender).toContain("Antes de gerar o pagamento, preciso confirmar seus dados do pedido.");
    expect(paymentSender).toContain("nome completo");
    expect(paymentSender).toContain("e-mail");
    expect(paymentSender).toContain("CPF ou CNPJ");
    expect(paymentSender).toContain("endereco completo com rua, numero, bairro, cidade, CEP");
    expect(paymentSender).toContain("Depois disso, eu confirmo o endereco completo para calcular a entrega.");
    expect(paymentSender).not.toContain("Se for entrega por frete");
    expect(paymentSender).not.toContain("confirmar a forma de entrega desse pedido");
    expect(runtimeSource).toContain("urlChoiceFormat ?? \"plain\"");
    expect(runtimeSource).toContain("normalizeInteractiveButtonChoice(choice, \"prefixed\")");
    expect(runtimeSource).toContain("repairIncompleteAssistantEnding");
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
    expect(followUpDetection).toContain("codigo pix");
    expect(followUpDetection).toContain("nao abriu");
    expect(followUpDetection).toContain("ainda nao");
    expect(followUpDetection).toContain("resolvesSalesCatalogPaymentPrerequisiteText");
    expect(runtimeSource).toContain("extractRuntimeCustomerNameFromStructuredReply");
    expect(checkoutRecovery).toContain("sendSalesCatalogExistingOrderConfirmationWhatsapp");
    expect(checkoutRecovery).toContain("payment_prerequisite_resolved_without_final_confirmation");
    expect(checkoutRecovery).toContain("preferredMethod === \"card\" && currentMethod !== \"card\"");
    expect(checkoutRecovery).toContain("readStoredSalesCatalogPaymentPreference");
    expect(checkoutRecovery).toContain("gatewayUnavailable");
    expect(checkoutRecovery).toContain("if (paymentDeferred || gatewayUnavailable)");
  });

  it("preserves the preferred payment method while delivery data is pending", () => {
    expect(paymentSessionsSource).toContain("const preferredMethod = input.preferredMethod === \"card\" ? \"card\" : \"pix\";");
    expect(paymentSessionsSource).toContain("const sessionMethod = preferredMethod === \"card\" ? \"card\" : \"pix\";");
    expect(paymentSessionsSource).toContain("method: sessionMethod");
    expect(paymentSessionsSource).toContain("needsCustomerNameBeforePayment");
    expect(paymentSessionsSource).toContain("customer_name_required");
    expect(paymentSessionsSource).toContain("lead_details_required");
    expect(paymentSessionsSource).toContain("paymentMethodType: \"card\"");
    expect(paymentSessionsSource).toContain("latest_payment_method: input.paymentMethodType ?? \"pix\"");
    expect(paymentSessionsSource).toContain("preferredMethod,");
    expect(paymentSessionsSource).toContain("preferred_payment_method: input.preferredMethod");
    expect(runtimeSource).toContain("readStoredSalesCatalogPaymentPreference(metadata)");
    expect(runtimeSource).toContain("appendCheckoutPaymentMethod(baseUrl, \"card\")");
  });

  it("stores clean delivery addresses and confirms saved addresses on future orders", () => {
    const shippingRuntime = sourceBetween(
      "async function maybeAttachSalesCatalogShippingQuoteToOrder",
      "async function maybeAttachSalesCatalogPickupToOrder",
    );
    const leadMemory = sourceBetween(
      "function buildLeadMemoryLines",
      "function buildCrossAgentConversationLines",
    );

    expect(runtimeSource).toContain("sanitizeRuntimeDeliveryAddress");
    expect(runtimeSource).toContain("cleanRuntimeDeliveryAddressLine");
    expect(runtimeSource).toContain("readLeadSavedDeliveryAddress");
    expect(runtimeSource).toContain("Tenho um endereco de entrega salvo");
    expect(runtimeSource).toContain("maybeAttachSavedSalesCatalogDeliveryToOrder");
    expect(runtimeSource).toContain("maybeAttachSalesCatalogCustomerNameToOrder");
    expect(runtimeSource).toContain("persistLeadCustomerNameSnapshot");
    expect(runtimeSource).toContain("extractRuntimeCustomerName");
    expect(runtimeSource).toContain("extractRuntimeCustomerNameFromStructuredReply");
    expect(runtimeSource).toContain("loadLatestLeadMetadataForRuntimeUpdate");
    expect(runtimeSource).toContain("sales_catalog.customer_name_saved");
    expect(runtimeSource).toContain("sales_catalog.saved_delivery_address_reused");
    expect(shippingRuntime).toContain("isRuntimeSavedDeliveryAffirmation");
    expect(shippingRuntime).toContain("hasRecentSavedDeliveryConfirmationPrompt");
    expect(leadMemory).toContain("Endereco de entrega salvo");
    expect(leadMemory).toContain("confirme se pode usar esse mesmo endereco");
  });

  it("uses agent responsible humans for handoff notifications before legacy behavior numbers", () => {
    const resolver = sourceBetween(
      "function resolveHumanHandoffNotificationNumbers",
      "async function sendHumanHandoffNotificationNowOrQueue",
    );
    const humanRequest = sourceBetween(
      "async function handleLeadHumanHandoffRequest",
      "async function sendHumanHandoffNotificationNowOrQueue",
    );

    expect(runtimeSource).toContain("readAgentResponsibleHumans");
    expect(resolver).toContain("responsible.notifyPayments || responsible.notifyOperational");
    expect(resolver).toContain("responsible.notifyOperational");
    expect(resolver).toContain("context.behavior.humanHandoffNotificationNumbers");
    expect(humanRequest).toContain("resolveHumanHandoffNotificationNumbers(context, \"handoff\")");
  });

  it("never lets internal checkout placeholders leak into WhatsApp messages", () => {
    const tagRenderer = sourceBetween(
      "function renderLinkButtonTags",
      "function findLinkButtonByReference",
    );

    expect(runtimeSource).toContain("const linkButtonTagRegex = /\\{\\{\\s*(?:link|checkout)_");
    expect(tagRenderer).toContain("findLinkButtonByReference(reference, linkButtons)");
    expect(tagRenderer).toContain("return link ? buildLeadAwareTrackingUrl(link, input) : \"\";");
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
    expect(globalRule).toContain("pergunte a forma de pagamento antes de gerar Pix");
    expect(globalRule).toContain("Nunca reutilize link, Pix ou pagamento antigo ou de outro lead");
  });

  it("preserves substantive product explanations before offering product pages", () => {
    const delivery = sourceBetween("async function sendAgentResponse", "type CompanyLocationReply");
    const renderer = sourceBetween(
      "function renderSalesCatalogTags",
      "async function recordSalesCatalogOrderIntent",
    );

    expect(delivery).toContain("const shouldOfferProductPageLinks = !shouldRequestCheckoutConfirmation");
    expect(delivery).toContain("&& !shouldWaitForPaymentMethodChoice");
    expect(delivery).toContain("&& shouldSendSalesCatalogProductPageLinks(latestInbound, cleanText);");
    expect(delivery).toContain("!hasOrderIntent && shouldOfferProductPageLinks");
    expect(delivery).toContain("const hasCatalogAction = hasOrderIntent || catalogAttachments.length > 0 || shouldOfferProductPageLinks;");
    expect(renderer).toContain("hasSubstantiveSalesCatalogAnswer(input.text)");
    expect(renderer).toContain("return input.text;");
    expect(renderer).toContain("function shouldSendSalesCatalogProductPageLinks");
    expect(renderer).toContain("latestInbound?.text_content");
  });
});

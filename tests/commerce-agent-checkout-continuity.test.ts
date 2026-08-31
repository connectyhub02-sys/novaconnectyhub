import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const checkoutPageSource = readFileSync("src/app/checkout/[sessionId]/page.tsx", "utf8");
const paymentSessionsSource = readFileSync("src/lib/sales-catalog/payment-sessions.ts", "utf8");
const commerceAgentServerSource = readFileSync("src/lib/commerce-agent/server.ts", "utf8");
const commerceAgentDockSource = readFileSync("src/components/commerce-agent/commerce-agent-dock.tsx", "utf8");
const trackingRouteSource = readFileSync("src/app/api/track/route.ts", "utf8");
const whatsappRuntimeSource = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("Commerce Agent checkout continuity", () => {
  it("publishes the WhatsApp agent identity in checkout tracking context", () => {
    const contextBuilder = sourceBetween(
      checkoutPageSource,
      "function buildCheckoutPublicTrackingContext",
      "function safeJson",
    );

    expect(contextBuilder).toContain("const orderMetadata = readRecord(input.order.metadata)");
    expect(contextBuilder).toContain("const sessionMetadata = readRecord(input.session.metadata)");
    expect(contextBuilder).toContain("agent_id: resolveCheckoutAgentId(orderMetadata, sessionMetadata)");
    expect(contextBuilder).toContain("readString(orderMetadata.agent_id)");
    expect(contextBuilder).toContain("readString(sessionMetadata.agent_id)");
  });

  it("keeps the agent identity on payment sessions and tracked checkout links", () => {
    const paymentCreator = sourceBetween(
      paymentSessionsSource,
      "export async function createSalesCatalogPixPaymentSession",
      "async function persistCheckoutOrderReference",
    );
    const trackedLinkCreator = sourceBetween(
      paymentSessionsSource,
      "async function createPaymentSessionTrackedLink",
      "function summarizePaymentItems",
    );

    expect(paymentCreator).toContain("const agentId = resolveOrderAgentId(orderMetadata)");
    expect(paymentCreator).toContain("agent_id: agentId");
    expect(trackedLinkCreator).toContain("agent_id: resolveOrderAgentId(readRecord(input.order.metadata))");
  });

  it("allows checkout sessions and tracked links to authorize the dock when the public token is unavailable", () => {
    const resolver = sourceBetween(
      commerceAgentServerSource,
      "export async function resolveCommerceAgentContext",
      "export async function buildCommerceAgentSessionPayload",
    );
    const checkoutValidator = sourceBetween(
      commerceAgentServerSource,
      "async function validateCheckoutCommerceAgentContext",
      "async function loadCommerceAgent",
    );

    expect(resolver).toContain("validateCheckoutCommerceAgentContext");
    expect(resolver).toContain("validateTrackedLinkCommerceAgentContext");
    expect(resolver).toContain("!hasValidTrackingToken && !hasValidCheckoutContext && !hasValidTrackedLinkContext");
    expect(checkoutValidator).toContain("input.surface !== \"checkout\"");
    expect(checkoutValidator).toContain(".from(\"sales_catalog_payment_sessions\")");
    expect(checkoutValidator).toContain("data.order_id === input.orderId");

    const trackedLinkValidator = sourceBetween(
      commerceAgentServerSource,
      "async function validateTrackedLinkCommerceAgentContext",
      "async function loadCommerceAgent",
    );

    expect(trackedLinkValidator).toContain(".from(\"intelligence_memory\")");
    expect(trackedLinkValidator).toContain(".contains(\"tags\", [\"tracked_link_button\"])");
    expect(trackedLinkValidator).toContain("input.trackingLinkId");
  });

  it("uses the WhatsApp agent photo and keeps the minimized dock as a circular avatar", () => {
    expect(commerceAgentServerSource).toContain("readWhatsappInstanceProfileImageUrl(whatsappInstance?.metadata)");
    expect(commerceAgentServerSource).toContain(".select(\"phone_number, metadata\")");

    expect(commerceAgentDockSource).toContain("aria-live=\"polite\"");
    expect(commerceAgentDockSource).toContain("size=\"coin\"");
    expect(commerceAgentDockSource).toContain("rounded-full");
    expect(commerceAgentServerSource).toContain("estou aqui. Se precisar de ajuda, clica na minha foto");
    expect(commerceAgentDockSource).not.toContain("import { Bot");
  });

  it("grounds storefront replies in the WhatsApp conversation and commerce context", () => {
    expect(commerceAgentServerSource).toContain("loadGeminiCredentials(input.context.client)");
    expect(commerceAgentServerSource).toContain("loadWhatsappConversationMessages");
    expect(commerceAgentServerSource).toContain("HISTORICO RECENTE DO WHATSAPP");
    expect(commerceAgentServerSource).toContain("PEDIDO/CHECKOUT ATUAL");
    expect(commerceAgentServerSource).toContain("OFERTA CONTEXTUAL POSSIVEL");
    expect(commerceAgentServerSource).toContain("Nao repita a ultima resposta");
    expect(commerceAgentServerSource).toContain("buildFallbackCommerceAgentReply");
  });

  it("hydrates lead and agent identity from an active commerce session when navigation drops URL params", () => {
    const resolver = sourceBetween(
      commerceAgentServerSource,
      "export async function resolveCommerceAgentContext",
      "export async function buildCommerceAgentSessionPayload",
    );

    expect(resolver).toContain("findCommerceSessionContext");
    expect(resolver).toContain("hasValidHydratedSessionContext");
    expect(resolver).toContain("readString(hydratedSession?.lead_id)");
    expect(resolver).toContain("readUuid(hydratedSessionMetadata?.agent_id)");
    expect(resolver).toContain("requestedCommerceSessionId ?? hydratedSession?.id ?? null");
  });

  it("rehydrates a returning browser from persistent lead web identity", () => {
    const resolver = sourceBetween(
      commerceAgentServerSource,
      "export async function resolveCommerceAgentContext",
      "export async function buildCommerceAgentSessionPayload",
    );
    const identityLookup = sourceBetween(
      commerceAgentServerSource,
      "async function findLeadWebIdentityContext",
      "async function findLatestCommerceSessionByLeadIdentity",
    );

    expect(resolver).toContain("restored_from_identity");
    expect(resolver).toContain("returningVisitor");
    expect(resolver).toContain("!hasExplicitLeadContext");
    expect(identityLookup).toContain(".from(\"lead_web_identities\")");
    expect(identityLookup).toContain("identity_type.eq.");
    expect(commerceAgentServerSource).toContain("MEMORIA PERSISTENTE DO LEAD NA CONNECTYHUB");
    expect(commerceAgentServerSource).toContain("bem-vindo de volta");
  });

  it("preserves known browser identity during anonymous commerce tracking events", () => {
    const trackerSync = sourceBetween(
      trackingRouteSource,
      "async function syncCommerceTrackingContext",
      "async function findCommerceSession",
    );
    const identityUpsert = sourceBetween(
      trackingRouteSource,
      "async function upsertTrackingLeadWebIdentity",
      "function escapeSupabaseOrValue",
    );

    expect(trackingRouteSource).toContain("requestedLeadId ?? restoredIdentity?.lead_id");
    expect(trackerSync).toContain("resolvedLeadId = leadId ?? restoredIdentity?.lead_id ?? null");
    expect(trackerSync).toContain("resolvedAgentId");
    expect(trackerSync).toContain("upsertTrackingLeadWebIdentity");
    expect(identityUpsert).toContain("lead_id: input.leadId ?? existing?.lead_id ?? null");
    expect(identityUpsert).toContain("agent_id: input.agentId ?? readString(existingMetadata.agent_id)");
  });

  it("feeds storefront memory back into the WhatsApp agent runtime", () => {
    expect(whatsappRuntimeSource).toContain("loadLeadCommerceStoreContext");
    expect(whatsappRuntimeSource).toContain("commerceStoreContext");
    expect(whatsappRuntimeSource).toContain("MEMORIA DA LOJA CONNECTYHUB");
    expect(whatsappRuntimeSource).toContain(".from(\"commerce_agent_messages\")");
    expect(whatsappRuntimeSource).toContain("Use esta memoria para continuar no WhatsApp sem recome");
  });

  it("requires billable access and meters Gemini replies to the store organization", () => {
    const generator = sourceBetween(
      commerceAgentServerSource,
      "async function generateCommerceAgentReply",
      "async function callGeminiCommerceAgent",
    );

    expect(generator).toContain("await assertBillableAccess");
    expect(generator).toContain("organizationId: input.context.organization.id");
    expect(generator).toContain("await meterGeminiGenerationUsage");
    expect(generator).toContain("billing_owner: \"store_organization\"");
    expect(generator).toContain("bill_to_organization_id: input.context.organization.id");
    expect(generator).toContain("throw new CommerceAgentBillingError");
    expect(generator).not.toContain(".catch(() => null)");
  });

  it("keeps page context hidden while showing contextual whispers per navigation", () => {
    expect(commerceAgentServerSource).toContain("recordCommerceAgentPageContext");
    expect(commerceAgentServerSource).toContain("role: \"system\"");
    expect(commerceAgentServerSource).toContain("message.role === \"lead\" || message.role === \"assistant\"");
    expect(commerceAgentServerSource).toContain("vi que voce abriu");
    expect(commerceAgentDockSource).toContain("${pathname ?? \"\"}?${search}");
    expect(commerceAgentDockSource).toContain("message.role !== \"system\"");
    expect(commerceAgentDockSource).toContain("digitando");
  });
});

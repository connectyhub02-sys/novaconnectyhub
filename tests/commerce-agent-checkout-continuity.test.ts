import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const checkoutPageSource = readFileSync("src/app/checkout/[sessionId]/page.tsx", "utf8");
const paymentSessionsSource = readFileSync("src/lib/sales-catalog/payment-sessions.ts", "utf8");
const commerceAgentServerSource = readFileSync("src/lib/commerce-agent/server.ts", "utf8");

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
});

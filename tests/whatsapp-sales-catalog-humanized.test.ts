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
});

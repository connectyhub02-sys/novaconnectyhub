import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sales-catalog/importer", () => ({}));

import {
  buildWhatsappCatalogImportDrafts,
  fetchWhatsappCatalogPages,
} from "../src/lib/sales-catalog/whatsapp-sync";

const context = {
  catalogJid: "5511999999999@s.whatsapp.net",
  whatsappInstanceId: "test-instance",
  agentId: "test-agent",
  now: "2026-09-11T19:47:00Z",
};
const credentials = { baseUrl: "https://provider.example", adminToken: "unused", webhookSecret: null, webhookUrl: null };
// Sanitized shape observed through the provider documentation on 11/09.
const flatProduct = {
  id: "house-1",
  name: "Casa Ipiranga",
  description: "Imóvel por R$ 850 mil.",
  price: "850000000",
  currency: "BRL",
  is_hidden: false,
  retailer_id: "house-sku",
  product_availability: "IN_STOCK",
  status_info: { status: "APPROVED" },
  media: { images: [{ id: "photo-1", original_image_url: "https://images.example/original.jpg", request_image_url: "https://images.example/thumb.jpg" }] },
};

afterEach(() => vi.unstubAllGlobals());

describe("WhatsApp catalog provider payload", () => {
  it("builds a review draft with the real price, original photo and retailer SKU", () => {
    const { drafts, skipped } = buildWhatsappCatalogImportDrafts({ ...context, products: [flatProduct] });
    expect(skipped).toBe(0);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      title: "Casa Ipiranga", price: "850.000,00", currency: "BRL",
      imageUrl: "https://images.example/original.jpg", importExternalImage: true,
      category: null,
      sourceEvidence: { whatsapp_catalog_status: "APPROVED", whatsapp_catalog_availability: "IN_STOCK", whatsapp_catalog_retailer_id: "house-sku" },
    });
    expect(drafts[0].skus[0]).toMatchObject({ price: "850.000,00" });
  });

  it.each(["Url", "URL", "url"])("imports the product's external link from %s without changing the selected destination", (field) => {
    const productUrl = "https://imoveis.example/casa-ipiranga?ref=whatsapp";
    const { drafts } = buildWhatsappCatalogImportDrafts({ ...context, products: [{ ...flatProduct, [field]: productUrl }] });
    expect(drafts[0]).toMatchObject({ productUrl, salesDestination: "connectyhub_checkout", sourceEvidence: { whatsapp_catalog_url: productUrl } });
  });

  it.each([
    ["220000000", "220.000,00"], ["2590100", "2.590,10"], ["19990", "19,99"], ["0", "0,00"],
  ])("converts flat provider price %s from thousandths", (price, expected) => {
    const { drafts } = buildWhatsappCatalogImportDrafts({ ...context, products: [{ ...flatProduct, price, description: "" }] });
    expect(drafts[0].price).toBe(expected);
  });

  it("preserves hidden status, non-BRL currency and the request photo fallback", () => {
    const { drafts } = buildWhatsappCatalogImportDrafts({ ...context, products: [{
      ...flatProduct, currency: "USD", is_hidden: true,
      media: { images: [{ request_image_url: "https://images.example/fallback.jpg" }] },
    }] });
    expect(drafts[0]).toMatchObject({ currency: "USD", imageUrl: "https://images.example/fallback.jpg", inventory: { status: "out_of_stock" } });
    expect(drafts[0].warnings).toContain("Produto esta oculto no catalogo WhatsApp. Revise antes de publicar na loja.");
  });

  it("preserves legacy nested prices and PascalCase images", () => {
    const { drafts } = buildWhatsappCatalogImportDrafts({ ...context, products: [{
      ID: "legacy-1", Name: "Legacy", Price: { Amount: "259010", Currency: "BRL" },
      Images: [{ OriginalImageUrl: "https://images.example/legacy.jpg" }],
    }] });
    expect(drafts[0]).toMatchObject({ price: "2.590,10", imageUrl: "https://images.example/legacy.jpg" });
  });

  it.each([
    { Price: "259010", Currency: "BRL" },
    { price: { amount: "259010", currency: "BRL" } },
  ])("preserves other legacy cents shapes: %j", (legacyPrice) => {
    const { drafts } = buildWhatsappCatalogImportDrafts({ ...context, products: [{ id: "legacy", name: "Legacy", ...legacyPrice }] });
    expect(drafts[0].price).toBe("2.590,10");
  });

  it("keeps missing or unsafe prices in review instead of inventing a price", () => {
    const { drafts } = buildWhatsappCatalogImportDrafts({ ...context, products: [
      { ...flatProduct, price: undefined }, { ...flatProduct, price: "99999999999999999999" },
    ] });
    for (const draft of drafts) {
      expect(draft.price).toBeNull();
      expect(draft.warnings).toContain("Preco nao encontrado no catalogo WhatsApp. Informe o preco antes de publicar.");
    }
  });

  it("follows the returned next cursor and creates drafts from both pages", async () => {
    const cursor = "opaque+/cursor==";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ response: { products: [flatProduct], next: cursor } }))
      .mockResolvedValueOnce(Response.json({ response: { products: [flatProduct, { ...flatProduct, id: "house-2", price: "220000000" }], next: "" } }));
    vi.stubGlobal("fetch", fetchMock);
    const fetched = await fetchWhatsappCatalogPages(credentials, "test-token", context.catalogJid);
    expect(fetched).toMatchObject({ pages: 2, hasMore: false });
    expect(fetched.products).toHaveLength(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ jid: context.catalogJid });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ jid: context.catalogJid, after: cursor });
    const { drafts } = buildWhatsappCatalogImportDrafts({ ...context, products: fetched.products });
    expect(drafts.map(draft => draft.price)).toEqual(["850.000,00", "220.000,00"]);
    expect(drafts.every(draft => draft.importExternalImage)).toBe(true);
  });

  it("continues to follow legacy Paging.After", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ response: { Products: [flatProduct], Paging: { After: "legacy-cursor" } } }))
      .mockResolvedValueOnce(Response.json({ response: { Products: [], Paging: {} } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchWhatsappCatalogPages(credentials, "test-token", context.catalogJid)).toMatchObject({ pages: 2, hasMore: false });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).after).toBe("legacy-cursor");
  });

  it("reports that more pages remain when the configured page cap is reached", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ response: { products: [flatProduct], next: "more-pages" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchWhatsappCatalogPages(credentials, "test-token", context.catalogJid, { maxPages: 1 })).toMatchObject({ pages: 1, hasMore: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

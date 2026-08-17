import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/access-control", () => ({
  assertOrganizationOperationalAccess: vi.fn(),
}));
vi.mock("@/lib/billing/gemini-metering", () => ({
  meterGeminiGenerationUsage: vi.fn(),
}));
vi.mock("@/lib/gemini/credentials", () => ({
  loadGeminiCredentials: vi.fn(),
}));
vi.mock("@/lib/sales-catalog/shared", () => ({
  buildSalesCatalogContent: vi.fn(() => ""),
  createSalesCatalogTag: vi.fn(() => "PRODUTO_TESTE"),
  emptySalesCatalogProductFulfillment: vi.fn(() => ({
    mode: "physical",
    schedulingRequired: false,
    serviceDuration: null,
    deliveryInstructions: null,
    accessInstructions: null,
  })),
  emptySalesCatalogProductInventory: vi.fn(() => ({
    status: "in_stock",
    quantity: null,
    lowStockThreshold: null,
    allowBackorder: false,
    notes: null,
  })),
  emptySalesCatalogProductOffer: vi.fn(() => ({
    salePrice: null,
    saleStartsAt: null,
    saleEndsAt: null,
    couponCode: null,
    couponDescription: null,
    callToAction: null,
    notes: null,
  })),
  emptySalesCatalogProductShipping: vi.fn(() => ({
    weightGrams: null,
    dimensions: { lengthCm: null, widthCm: null, heightCm: null },
    profile: "default",
    notes: null,
  })),
  getSalesCatalogReadiness: vi.fn(() => ({ score: 1, missing: [] })),
  resolveSalesCatalogMediaKind: vi.fn(() => "image"),
}));
vi.mock("@/lib/storage/quotas", () => ({
  assertStorageUploadAllowed: vi.fn(),
  recordOrganizationStorageUsage: vi.fn(),
}));
vi.mock("@/lib/storage/r2", () => ({
  loadR2Config: vi.fn(),
  putR2Object: vi.fn(),
}));
vi.mock("@/lib/tracking/tracked-links", () => ({
  buildTrackedLinkUrl: vi.fn(),
  createTrackedLinkSlug: vi.fn(),
  createTrackedLinkTag: vi.fn(),
  normalizeHttpUrl: vi.fn((url: string) => url),
}));

import {
  buildQueuedSourceInput,
  hasSalesCatalogImportCheckoutPrice,
} from "../src/lib/sales-catalog/importer";

describe("sales catalog importer", () => {
  it("does not duplicate queued file excerpts into processing text", () => {
    const excerpt = "Nome,Preco\nProduto A,237,99";
    const result = buildQueuedSourceInput(
      { input_url: null } as never,
      [{
        source_url: null,
        text_excerpt: excerpt,
        file_name: "woocommerce.csv",
        content_type: "text/csv",
        file_size: excerpt.length,
        metadata: {
          inline_base64: Buffer.from(excerpt, "utf8").toString("base64"),
        },
      }] as never,
    );

    expect(result.text).toBe("");
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.text).toBe(excerpt);
  });

  it("keeps queued text excerpts when the source is not a reconstructed file", () => {
    const result = buildQueuedSourceInput(
      { input_url: "https://example.com/catalogo" } as never,
      [{
        source_url: "https://example.com/catalogo",
        text_excerpt: "Produto A - R$ 237,99",
        file_name: null,
        content_type: null,
        file_size: null,
        metadata: null,
      }] as never,
    );

    expect(result.text).toBe("Produto A - R$ 237,99");
    expect(result.sourceUrl).toBe("https://example.com/catalogo");
    expect(result.files).toEqual([]);
  });

  it("requires a positive checkout price on the item, offer, or active SKU", () => {
    expect(hasSalesCatalogImportCheckoutPrice({
      price: null,
      offer: { salePrice: null },
      skus: [],
    } as never)).toBe(false);

    expect(hasSalesCatalogImportCheckoutPrice({
      price: "R$ 237,99",
      offer: { salePrice: null },
      skus: [],
    } as never)).toBe(true);

    expect(hasSalesCatalogImportCheckoutPrice({
      price: null,
      offer: { salePrice: "199,90" },
      skus: [],
    } as never)).toBe(true);

    expect(hasSalesCatalogImportCheckoutPrice({
      price: null,
      offer: { salePrice: null },
      skus: [{ status: "active", price: "399,80", salePrice: null }],
    } as never)).toBe(true);

    expect(hasSalesCatalogImportCheckoutPrice({
      price: null,
      offer: { salePrice: null },
      skus: [{ status: "archived", price: "399,80", salePrice: null }],
    } as never)).toBe(false);
  });
});

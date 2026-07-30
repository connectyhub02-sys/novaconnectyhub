import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildGoogleOAuthAssetInputs,
  buildMetaOAuthAssetInputs,
  normalizeGoogleCustomerId,
  normalizeMetaAdAccountId,
} from "./growth-integrations";

describe("growth integration assets", () => {
  it("normalizes Meta ad account ids with act_ prefix", () => {
    expect(normalizeMetaAdAccountId("123456789")).toBe("act_123456789");
    expect(normalizeMetaAdAccountId("act_123456789")).toBe("act_123456789");
  });

  it("builds selected Meta OAuth assets", () => {
    const assets = buildMetaOAuthAssetInputs({
      assets: {
        adAccountId: "123",
        adAccounts: [
          { id: "123", label: "Conta principal", status: "1" },
          { id: "456", label: "Conta secundaria", status: "1" },
        ],
        instagramAccounts: [{ id: "ig_1", label: "connectyhub", parentId: "page_1" }],
        pageId: "page_1",
        pages: [{ id: "page_1", label: "ConnectyHub" }],
      },
      permissions: ["ads_read", "pages_show_list"],
    });

    expect(assets).toHaveLength(4);
    expect(assets.find((asset) => asset.externalId === "act_123")?.isSelected).toBe(true);
    expect(assets.find((asset) => asset.externalId === "act_456")?.isSelected).toBe(false);
    expect(assets.find((asset) => asset.assetType === "facebook_page")?.isSelected).toBe(true);
    expect(assets.find((asset) => asset.assetType === "instagram_business_account")?.parentExternalId).toBe("page_1");
  });

  it("normalizes Google customer ids and selects the chosen customer", () => {
    expect(normalizeGoogleCustomerId("customers/123-456-7890")).toBe("1234567890");

    const assets = buildGoogleOAuthAssetInputs({
      accessibleCustomers: ["customers/111-222-3333", "4445556666"],
      scopes: ["https://www.googleapis.com/auth/adwords"],
      selectedCustomerId: "444-555-6666",
    });

    expect(assets).toHaveLength(2);
    expect(assets.find((asset) => asset.externalId === "1112223333")?.isSelected).toBe(false);
    expect(assets.find((asset) => asset.externalId === "4445556666")?.isSelected).toBe(true);
  });
});

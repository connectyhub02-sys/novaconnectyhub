import { describe, expect, it } from "vitest";
import { chooseGoogleAdsCustomer, formatGoogleAdsCustomerId } from "../src/lib/google/customer-selection";

describe("Google Ads account selection", () => {
  it("picks automatically only when the login reaches a single account", () => {
    expect(chooseGoogleAdsCustomer(["5753432299"])).toBe("5753432299");
    expect(chooseGoogleAdsCustomer([])).toBe("");
    // A login with own, client and manager accounts must choose; never the first one returned.
    expect(chooseGoogleAdsCustomer(["2801241888", "6858645062", "5753432299"])).toBe("");
  });
  it("keeps a previous choice that is still accessible after reconnecting", () => {
    expect(chooseGoogleAdsCustomer(["2801241888", "5753432299"], "5753432299")).toBe("5753432299");
    expect(chooseGoogleAdsCustomer(["2801241888", "6858645062"], "5753432299")).toBe("");
  });
  it("formats customer IDs as Google shows them", () => {
    expect(formatGoogleAdsCustomerId("5753432299")).toBe("575-343-2299");
    expect(formatGoogleAdsCustomerId("123")).toBe("123");
  });
});

import { describe, expect, it } from "vitest";
import { requiresSalesCatalogShippingBeforePayment } from "@/lib/sales-catalog/checkout-guards";

const physicalItems = [{ fulfillment: { mode: "physical" } }];

describe("sales catalog checkout guards", () => {
  it("keeps physical delivery blocked when only shipping quote and CEP are present", () => {
    expect(requiresSalesCatalogShippingBeforePayment({
      destination_address: null,
      shipping_method: "PAC",
      shipping_total: "29,90",
    }, physicalItems)).toBe(true);
  });

  it("allows physical delivery after shipping and complete address are present", () => {
    expect(requiresSalesCatalogShippingBeforePayment({
      destination_address: "Rua das Flores, 123, Centro, Itajai - SC",
      shipping_method: "PAC",
      shipping_total: "29,90",
    }, physicalItems)).toBe(false);
  });

  it("allows local pickup without delivery address", () => {
    expect(requiresSalesCatalogShippingBeforePayment({
      destination_address: null,
      shipping_method: "Retirada na loja",
      shipping_total: "0,00",
    }, physicalItems)).toBe(false);
  });

  it("does not block digital items", () => {
    expect(requiresSalesCatalogShippingBeforePayment({
      destination_address: null,
      shipping_method: null,
      shipping_total: null,
    }, [{ fulfillment: { mode: "digital" } }])).toBe(false);
  });
});

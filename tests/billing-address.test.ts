import { describe, expect, it } from "vitest";
import { emptyBillingAddress, parseBillingAddress } from "../src/lib/billing/billing-address";
const address = { postalCode: "01001-000", street: "Praça da Sé", number: "10", complement: "", neighborhood: "Sé", city: "São Paulo", state: "sp", country: "br" };
describe("billing address", () => {
  it("requires the full address and normalizes only known fields", () => {
    expect(parseBillingAddress({ ...address, cardNumber: "never store", ccv: "123", organizationId: "other" })).toEqual({ ...address, postalCode: "01001000", state: "SP", country: "BR" });
    expect(() => parseBillingAddress({ ...emptyBillingAddress, postalCode: "01001000", number: "10" })).toThrow();
  });
  it.each(["street", "number", "neighborhood", "city", "state", "country"])("rejects missing %s", key => expect(() => parseBillingAddress({ ...address, [key]: "" })).toThrow());
  it("allows a blank complement and rejects invalid CEP/UF/country", () => {
    expect(parseBillingAddress(address).complement).toBe("");
    for (const bad of [{ postalCode: "00000000" }, { state: "XX" }, { country: "US" }]) expect(() => parseBillingAddress({ ...address, ...bad })).toThrow();
  });
});

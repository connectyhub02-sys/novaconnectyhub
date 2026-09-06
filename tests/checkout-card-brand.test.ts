import { describe, expect, it } from "vitest";
import { detectCheckoutCardBrand } from "@/lib/sales-catalog/card-brand";

describe("checkout card brand hints", () => {
  it.each([
    ["4111 1111 1111 1111", "visa"], ["5555555555554444", "mastercard"],
    ["222100", "mastercard"], ["272099", "mastercard"],
    ["401178", "elo"], ["506699", "elo"], ["378282246310005", "american-express"],
    ["601111", "discover"], ["606282", "hipercard"], ["356600", "jcb"],
  ])("identifies %s without requiring a submitted payment", (number, expected) => {
    expect(detectCheckoutCardBrand(number)).toBe(expected);
  });

  it.each(["", "4", "40117", "6", "999999", "4111x1111", "41111111111111111111"])("does not guess an ambiguous or unknown brand for %s", number => {
    expect(detectCheckoutCardBrand(number)).toBeNull();
  });

  it("updates after editing, pasting and clearing the number", () => {
    expect(["40117", "401178", "4111-1111-1111-1111", ""].map(detectCheckoutCardBrand)).toEqual([null, "elo", "visa", null]);
  });
});

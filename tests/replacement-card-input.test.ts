import { describe, expect, it } from "vitest";
import { formatReplacementCardField as format, validateReplacementCardField as validate, validReplacementDocument, parseReplacementCardDetails } from "../src/lib/billing/replacement-card-input";

describe("replacement card masks and validation", () => {
  it("strips non-digits and groups Visa and Amex numbers", () => {
    expect(format("number", "4111x1111-1111 1111")).toBe("4111 1111 1111 1111");
    expect(format("number", "378282246310005")).toBe("3782 822463 10005");
    expect(format("ccv", "a12345")).toBe("1234");
    expect(format("expiry", "1235")).toBe("12/35");
    expect(format("postalCode", "01001000abc")).toBe("01001-000");
    expect(format("phone", "+55 11 99999-9999")).toBe("(11) 99999-9999");
    expect(format("phone", "55999999999")).toBe("(55) 99999-9999");
  });
  it.each(["123.456.789-09", "11.222.333/0001-81"])("validates document checksums: %s", value => expect(validReplacementDocument(value)).toBe(true));
  it.each(["12345678900", "11222333000180", "00000000000", "11111111111111"])("rejects invalid document %s", value => expect(validReplacementDocument(value)).toBe(false));
  it("validates expiry, Luhn and brand-specific security code", () => {
    expect(validate("number", "4111111111111112")).toBeTruthy();
    expect(validate("expiry", "01/20")).toBeTruthy();
    expect(validate("expiry", "13/35")).toBeTruthy();
    expect(validate("expiry", "12/35")).toBeNull();
    expect(validate("ccv", "123", "378282246310005")).toBeTruthy();
    expect(validate("ccv", "1234", "378282246310005")).toBeNull();
    expect(validate("ccv", "1234", "4111111111111111")).toBeTruthy();
    expect(validate("phone", "00123456789")).toBeTruthy();
    expect(validate("postalCode", "00000000")).toBeTruthy();
  });
  it("enforces the same document rules on the API parser", () => {
    const card = { number: "4111111111111111", holderName: "Pessoa Teste", expiryMonth: "12", expiryYear: "2035", ccv: "123" };
    const holder = { name: "Pessoa Teste", email: "teste@example.test", cpfCnpj: "12345678900", phone: "11999999999", postalCode: "01001000", addressNumber: "10" };
    expect(() => parseReplacementCardDetails(card, holder)).toThrow("CPF ou CNPJ");
    expect(parseReplacementCardDetails(card, { ...holder, cpfCnpj: "123.456.789-09" }).holder.cpfCnpj).toBe("12345678909");
  });
});

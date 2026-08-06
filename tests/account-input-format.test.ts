import { describe, expect, it } from "vitest";
import { formatCnpjInput, formatCpfCnpjInput, formatCpfInput } from "../src/lib/account/input-format";

describe("account input formatters", () => {
  it("formats CPF values", () => {
    expect(formatCpfInput("12345678909")).toBe("123.456.789-09");
  });

  it("formats CNPJ values", () => {
    expect(formatCnpjInput("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("chooses CPF or CNPJ by document length", () => {
    expect(formatCpfCnpjInput("12345678909")).toBe("123.456.789-09");
    expect(formatCpfCnpjInput("11222333000181")).toBe("11.222.333/0001-81");
  });
});

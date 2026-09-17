import { parseCheckoutCard, parseCheckoutCardHolder, type CheckoutCard } from "@/lib/sales-catalog/card-input";
import { detectCheckoutCardBrand } from "@/lib/sales-catalog/card-brand";
import { formatCpfCnpjInput } from "@/lib/account/input-format";

export type ReplacementCardField = "number" | "holderName" | "expiry" | "ccv" | "name" | "email" | "cpfCnpj" | "phone" | "postalCode" | "addressNumber";
export type ReplacementCardErrors = Partial<Record<ReplacementCardField, string>>;
export const replacementCardFields: ReplacementCardField[] = ["number", "holderName", "expiry", "ccv", "name", "email", "cpfCnpj", "phone", "postalCode", "addressNumber"];
const digits = (value: string) => value.replace(/\D/g, "");

export function formatReplacementCardField(field: ReplacementCardField, value: string) {
  const numeric = digits(value);
  if (field === "number") {
    const number = numeric.slice(0, 19);
    if (detectCheckoutCardBrand(number) === "american-express") return [number.slice(0, 4), number.slice(4, 10), number.slice(10)].filter(Boolean).join(" ");
    return number.match(/.{1,4}/g)?.join(" ") ?? "";
  }
  if (field === "expiry") return numeric.length > 2 ? `${numeric.slice(0, 2)}/${numeric.slice(2, 6)}` : numeric;
  if (field === "ccv") return numeric.slice(0, 4);
  if (field === "cpfCnpj") return formatCpfCnpjInput(numeric);
  if (field === "postalCode") return numeric.length > 5 ? `${numeric.slice(0, 5)}-${numeric.slice(5, 8)}` : numeric;
  if (field === "addressNumber") return numeric.slice(0, 6);
  if (field === "phone") {
    const local = (numeric.length > 11 && numeric.startsWith("55") ? numeric.slice(2) : numeric).slice(0, 11);
    if (local.length <= 2) return local ? `(${local}` : "";
    const split = local.length > 10 ? 7 : 6;
    return `(${local.slice(0, 2)}) ${local.slice(2, split)}${local.length > split ? `-${local.slice(split)}` : ""}`;
  }
  return value;
}

export function validReplacementDocument(value: string) {
  const number = digits(value);
  if (/^(\d)\1+$/.test(number)) return false;
  const digit = (base: string, weights: number[]) => {
    const remainder = [...base].reduce((sum, n, i) => sum + Number(n) * weights[i], 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  if (number.length === 11) {
    const first = digit(number.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return number.endsWith(`${first}${digit(number.slice(0, 9) + first, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])}`);
  }
  if (number.length === 14) {
    const first = digit(number.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return number.endsWith(`${first}${digit(number.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])}`);
  }
  return false;
}

export function validateReplacementCardField(field: ReplacementCardField, value: string, number = "", now = new Date()): string | null {
  const numeric = digits(value);
  if (field === "number" || field === "expiry") {
    const expiry = value.split("/");
    if (field === "expiry" && !/^\d{2}\/\d{2}(\d{2})?$/.test(value)) return "Informe a validade em MM/AA ou MM/AAAA.";
    try {
      parseCheckoutCard({ number: field === "number" ? value : "4111111111111111", holderName: "Validação", expiryMonth: field === "expiry" ? expiry[0] : "12", expiryYear: field === "expiry" ? expiry[1] : String(now.getFullYear() + 1), ccv: "123" }, now);
      return null;
    } catch { return field === "number" ? "Confira o número completo do cartão." : "Confira o mês e o ano; o cartão não pode estar vencido."; }
  }
  if (field === "ccv") {
    const brand = detectCheckoutCardBrand(number);
    const valid = brand === "american-express" ? /^\d{4}$/.test(value) : brand ? /^\d{3}$/.test(value) : /^\d{3,4}$/.test(value);
    return valid ? null : brand === "american-express" ? "Informe os 4 dígitos de segurança do American Express." : "Confira o código de segurança do cartão (3 dígitos; Amex usa 4).";
  }
  if (field === "holderName" || field === "name") return value.trim().length >= 2 && value.trim().length <= 120 ? null : "Informe o nome completo, entre 2 e 120 caracteres.";
  if (field === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.length <= 254 ? null : "Informe um e-mail válido.";
  if (field === "cpfCnpj") return validReplacementDocument(value) ? null : "Confira o CPF ou CNPJ do titular, incluindo os dígitos verificadores.";
  if (field === "phone") {
    const local = numeric.replace(/^55(?=\d{10,11}$)/, "");
    return /^\d{10,11}$/.test(local) && Number(local.slice(0, 2)) >= 11 && (local.length === 10 || local[2] === "9") && !/^(\d)\1+$/.test(local) ? null : "Informe DDD e telefone válidos (10 ou 11 dígitos).";
  }
  if (field === "postalCode") return /^\d{8}$/.test(numeric) && !/^0+$/.test(numeric) ? null : "Informe o CEP com 8 dígitos.";
  if (field === "addressNumber") return /^\d{1,6}$/.test(value.trim()) ? null : "Informe o número do endereço (até 6 dígitos).";
  return null;
}

/** Both browser and API use this validation; no card data is persisted here. */
export function parseReplacementCardDetails(cardValue: unknown, holderValue: unknown) {
  const card: CheckoutCard = parseCheckoutCard(cardValue);
  const holder = parseCheckoutCardHolder(holderValue);
  const checks: Array<[ReplacementCardField, string]> = [["ccv", card.ccv], ["cpfCnpj", holder.cpfCnpj], ["phone", holder.phone], ["postalCode", holder.postalCode], ["email", holder.email]];
  for (const [field, value] of checks) {
    const error = validateReplacementCardField(field, value, card.number);
    if (error) throw new Error(error);
  }
  return { card, holder };
}

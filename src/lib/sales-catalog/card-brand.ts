import creditCardType from "credit-card-type";

// Credit brands documented by the provider. Debit requires a different integration.
// https://central.ajuda.asaas.com/hc/pt-br/articles/31689226376219
export const asaasCreditCardBrands = [
  "visa", "mastercard", "elo", "american-express", "hipercard",
  "discover", "cabal", "banescard", "jcb",
] as const;

export type CheckoutCardBrand = typeof asaasCreditCardBrands[number];

export const cardBrandNames: Record<CheckoutCardBrand, string> = {
  visa: "Visa", mastercard: "Mastercard", elo: "Elo", "american-express": "American Express",
  hipercard: "Hipercard", discover: "Discover", cabal: "Cabal", banescard: "Banescard", jcb: "JCB",
};

/** Presentation only: never use brand detection to authorize or reject a payment. */
export function detectCheckoutCardBrand(value: string): CheckoutCardBrand | null {
  const number = value.replace(/[\s-]/g, "");
  if (!/^\d{1,19}$/.test(number)) return null;
  const matches = creditCardType(number);
  // Wait for an unambiguous BIN: Elo overlaps Visa/Mastercard prefixes.
  if (matches.length !== 1) return null;
  const type = matches[0].type;
  return asaasCreditCardBrands.includes(type as CheckoutCardBrand) ? type as CheckoutCardBrand : null;
}

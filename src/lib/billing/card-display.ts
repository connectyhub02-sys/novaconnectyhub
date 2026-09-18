export function isCardWithinValidity(card: { exp_month: string | null; exp_year: string | null }, now = new Date()) {
  // Legacy vault entries have no expiry metadata; the server remains authoritative.
  if (!card.exp_month || !card.exp_year) return true;
  const expiry = `${card.exp_year}${card.exp_month.padStart(2, "0")}`;
  return expiry >= `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

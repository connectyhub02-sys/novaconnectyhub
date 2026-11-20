/**
 * Which Google Ads account a connection should use. A login can reach several
 * advertisers (own, clients, managers): never guess between them.
 */
export function chooseGoogleAdsCustomer(accessible: string[], previous?: string | null) {
  if (previous && accessible.includes(previous)) return previous;
  return accessible.length === 1 ? accessible[0] : "";
}

/** 5753432299 → 575-343-2299 */
export function formatGoogleAdsCustomerId(id: string) {
  return /^\d{10}$/.test(id) ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id;
}

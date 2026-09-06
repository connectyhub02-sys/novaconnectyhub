/** Shared audit boundary: never persist raw card objects, tokens or authentication headers. */
export function sanitizePaymentAuditPayload(value: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.slice(0, 100).map(entry => sanitizePaymentAuditPayload(entry, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/credit.?card|card.?number|card.?token|card.?holder|\bpan\b|ccv|cvv|cvc|security.?code|access.?token|api.?key|authorization|signature|password|secret/i.test(key))
    .map(([key, entry]) => [key, sanitizePaymentAuditPayload(entry, depth + 1)]));
}

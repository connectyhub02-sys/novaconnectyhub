const legacyPrefix = "connectyhub_subscription:";
const compactPrefix = "chsub:";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Encode all four UUIDs losslessly in 92 characters for the Asaas 100-character limit. */
export function compactPlatformBillingReference(reference: string) {
  if (!reference.startsWith(legacyPrefix)) return reference;
  const ids = reference.slice(legacyPrefix.length).split(":");
  if (ids.length !== 4 || !ids.every(id => uuid.test(id))) return reference;
  return compactPrefix + Buffer.from(ids.join("").replaceAll("-", ""), "hex").toString("base64url");
}

export function expandPlatformBillingReference(reference: string) {
  if (!reference.startsWith(compactPrefix)) return reference;
  const encoded = reference.slice(compactPrefix.length);
  if (!/^[A-Za-z0-9_-]{86}$/.test(encoded)) return "";
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.length !== 64 || bytes.toString("base64url") !== encoded) return "";
  const ids = Array.from({ length: 4 }, (_, index) => {
    const hex = bytes.subarray(index * 16, (index + 1) * 16).toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  });
  return legacyPrefix + ids.join(":");
}

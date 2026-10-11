/** Diagnostic records must never contain tokens, including debug_token's input. */
export function sanitizeMetaGraphUrl(url: URL) {
  const safe = new URL(url.toString());
  for (const key of Array.from(safe.searchParams.keys())) {
    if (/token|secret|proof|authorization/i.test(key)) safe.searchParams.delete(key);
  }
  return `${safe.pathname}${safe.search}`;
}

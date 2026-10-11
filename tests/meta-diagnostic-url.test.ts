import { expect, it } from "vitest";
import { sanitizeMetaGraphUrl } from "../src/lib/meta/diagnostic-url";
it("redacts debug-token and authentication secrets before persisting diagnostics", () => {
  const url = new URL("https://graph.facebook.com/v25.0/debug_token?input_token=private-input&access_token=private-access&appsecret_proof=private-proof&fields=id");
  expect(sanitizeMetaGraphUrl(url)).toBe("/v25.0/debug_token?fields=id");
  expect(url.searchParams.get("input_token")).toBe("private-input");
});

import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

const { isSameOriginRequest } = serverModuleHarness<{
  isSameOriginRequest(r: Request, env: Record<string, string | undefined>): boolean;
}>("src/lib/security/same-origin-request.ts");
const production = { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://www.connectyhub.com.br" };
const internalUrl = "http://0.0.0.0:3000/api/admin/users/assisted-access";
const request = (origin?: string, extra: Record<string, string> = {}, url = internalUrl) =>
  new Request(url, { method: "POST", headers: { ...(origin === undefined ? {} : { origin }), ...extra } });

it("accepts the configured HTTPS origin behind a standalone HTTP proxy", () => {
  expect(isSameOriginRequest(request(production.NEXT_PUBLIC_APP_URL), production)).toBe(true);
});

it.each([undefined, "null", "https://evil.test", "http://www.connectyhub.com.br",
  "https://www.connectyhub.com.br:444", "https://www.connectyhub.com.br.evil.test",
  "https://www.connectyhub.com.br/", "http://0.0.0.0:3000", "https://connectyhub.com.br",
  "https://www.connectyhub.com.br, https://evil.test"])("rejects missing, foreign or malformed origin %s", (origin) => {
  expect(isSameOriginRequest(request(origin), production)).toBe(false);
});

it("does not trust a forged request URL, Host, Referer or forwarded headers", () => {
  const forged = request("https://evil.test", { host: "evil.test", "x-forwarded-host": "evil.test",
    "x-forwarded-proto": "https", forwarded: "host=evil.test;proto=https", referer: production.NEXT_PUBLIC_APP_URL }, "https://evil.test/api");
  expect(isSameOriginRequest(forged, production)).toBe(false);
  expect(isSameOriginRequest(request(undefined, { referer: production.NEXT_PUBLIC_APP_URL }), production)).toBe(false);
});

it.each([undefined, "", "not-a-url", "file:///app"])("fails closed in production with invalid configuration %s", (value) => {
  expect(isSameOriginRequest(request("http://0.0.0.0:3000"), { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: value })).toBe(false);
});

it("preserves exact-origin local development when no public URL is configured", () => {
  expect(isSameOriginRequest(request("http://localhost:3000", {}, "http://localhost:3000/api"), { NODE_ENV: "development" })).toBe(true);
  expect(isSameOriginRequest(request("http://localhost:3001", {}, "http://localhost:3000/api"), { NODE_ENV: "development" })).toBe(false);
});

it("allows assisted access revocation behind the proxy but rejects foreign requests before any write", async () => {
  const revoke = vi.fn(async () => {});
  const route = serverModuleHarness<{ POST(r: Request): Promise<Response> }>("src/app/api/auth/assisted-access/end/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/admin-assisted-access": { isSameOriginRequest: (r: Request) => isSameOriginRequest(r, production), revokeAdminAssistedAccess: revoke },
  });
  expect((await route.POST(request("https://evil.test"))).status).toBe(403);
  expect(revoke).not.toHaveBeenCalled();
  expect((await route.POST(request(production.NEXT_PUBLIC_APP_URL))).status).toBe(200);
  expect(revoke).toHaveBeenCalledOnce();
});

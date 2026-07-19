import { beforeEach, describe, expect, it } from "vitest";
import {
  isRequestOriginAllowed,
  resetPublicRateLimitForTests,
  validatePublicWriteRequest,
} from "../src/lib/security/public-request-guard";

const productionEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.connectyhub.com.br",
  TRACKING_ALLOWED_ORIGINS: "https://landing.connectyhub.com.br",
};

describe("public request guard", () => {
  beforeEach(() => {
    resetPublicRateLimitForTests();
  });

  it("allows same-origin requests", () => {
    const headers = new Headers({ origin: "https://www.connectyhub.com.br" });

    expect(isRequestOriginAllowed(headers, "https://www.connectyhub.com.br/api/track", productionEnv)).toBe(true);
  });

  it("allows explicitly configured origins", () => {
    const headers = new Headers({ origin: "https://landing.connectyhub.com.br" });

    expect(isRequestOriginAllowed(headers, "https://www.connectyhub.com.br/api/track", productionEnv)).toBe(true);
  });

  it("blocks foreign browser origins", () => {
    const headers = new Headers({ origin: "https://example.com" });

    expect(isRequestOriginAllowed(headers, "https://www.connectyhub.com.br/api/track", productionEnv)).toBe(false);
  });

  it("rejects oversized payloads before parsing", () => {
    const result = validatePublicWriteRequest({
      headers: new Headers({
        origin: "https://www.connectyhub.com.br",
        "content-length": "70000",
      }),
      requestUrl: "https://www.connectyhub.com.br/api/track",
      routeKey: "track",
      maxPayloadBytes: 64 * 1024,
      env: productionEnv,
    });

    expect(result).toEqual({
      ok: false,
      status: 413,
      message: "Payload grande demais.",
    });
  });

  it("rate-limits repeated writes by client ip", () => {
    const baseInput = {
      headers: new Headers({
        origin: "https://www.connectyhub.com.br",
        "x-forwarded-for": "203.0.113.10",
      }),
      requestUrl: "https://www.connectyhub.com.br/api/track",
      routeKey: "track",
      rateLimit: { limit: 2, windowMs: 60_000 },
      env: productionEnv,
      now: 1_000,
    };

    expect(validatePublicWriteRequest(baseInput).ok).toBe(true);
    expect(validatePublicWriteRequest({ ...baseInput, now: 2_000 }).ok).toBe(true);

    const blocked = validatePublicWriteRequest({ ...baseInput, now: 3_000 });

    expect(blocked).toMatchObject({
      ok: false,
      status: 429,
      retryAfterSeconds: 58,
    });
  });
});

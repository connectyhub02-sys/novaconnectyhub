import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { explicitCacheMinChars, explicitCacheStatus, rejectExplicitCache, requestInstructionsWereCounted, resetExplicitCacheForTests, stablePrefixCache } from "../src/lib/gemini/explicit-cache";

const stableText = "R".repeat(explicitCacheMinChars);
const created = (name = "cachedContents/abc") => vi.fn(async () => new Response(JSON.stringify({ name }), { status: 200 }));

describe("gemini explicit cache", () => {
  beforeEach(() => resetExplicitCacheForTests());

  it("creates once per stable text and reuses it until shortly before expiry", async () => {
    const fetchImpl = created();
    expect(await stablePrefixCache({ apiKey: "k", model: "m", stableText, fetchImpl, now: 0 })).toMatchObject({ name: "cachedContents/abc", created: true });
    expect(await stablePrefixCache({ apiKey: "k", model: "m", stableText, fetchImpl, now: 60_000 })).toMatchObject({ created: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await stablePrefixCache({ apiKey: "k", model: "m", stableText, fetchImpl, now: 900_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("skips short prompts and turns itself off when the provider refuses", async () => {
    const fetchImpl = created();
    expect(await stablePrefixCache({ apiKey: "k", model: "m", stableText: "curto", fetchImpl, now: 0 })).toBeNull();
    const refused = vi.fn(async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 400 }));
    expect(await stablePrefixCache({ apiKey: "k", model: "m", stableText, fetchImpl: refused, now: 0 })).toBeNull();
    expect(explicitCacheStatus(0).enabled).toBe(false);
    expect(await stablePrefixCache({ apiKey: "k", model: "m", stableText, fetchImpl, now: 1000 })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires the request instructions to show up in the usage report", () => {
    expect(requestInstructionsWereCounted({ inputTokens: 16_000, cachedTokens: 12_000 }, 12_000)).toBe(true);
    expect(requestInstructionsWereCounted({ inputTokens: 12_300, cachedTokens: 12_000 }, 12_000)).toBe(false);
    expect(requestInstructionsWereCounted(null, 100)).toBe(false);
    rejectExplicitCache("x", 0, 1000);
    expect(explicitCacheStatus(2000).enabled).toBe(true);
  });
});

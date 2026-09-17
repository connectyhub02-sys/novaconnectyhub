import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: async () => ({ error: true }) }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
it("collects HTTP health, caches it, bounds requests and does not follow redirects", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("ok", { status: 200 })); vi.stubGlobal("fetch", fetch);
  vi.stubEnv("INFRA_HEALTH_PROJECTS_JSON", JSON.stringify({ betel: { app: "https://betel.example/health" } }));
  const { collectHealth } = await import("@/lib/infrastructure/collector");
  const first = await collectHealth("betel"); await collectHealth("betel");
  expect(first.telemetry?.payload.services.app).toBe("healthy");
  expect(first.telemetry?.payload.services.worker).toBe("unknown");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]).toEqual([new URL("https://betel.example/health"), expect.objectContaining({ redirect: "manual", cache: "no-store" })]);
  expect((await collectHealth("vision")).telemetry).toBeNull();
});
it("does not disclose failure bodies, authenticated URLs or credentials to the UI", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("SECRET_PROVIDER_BODY", { status: 401 })));
  vi.stubEnv("INFRA_HEALTH_PROJECTS_JSON", JSON.stringify({ betel: { app: "https://betel.example/health?key=SECRET_URL", worker: "https://user:SECRET@worker.example" } }));
  const { collectHealth } = await import("@/lib/infrastructure/collector");
  const result = await collectHealth("betel");
  expect(result.telemetry?.payload.services.app).toBe("warning");
  expect(JSON.stringify(result)).not.toContain("SECRET");
});
it("never sends Supabase credentials to custom health endpoints", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("ok")); vi.stubGlobal("fetch", fetch);
  vi.stubEnv("INFRA_HEALTH_PROJECTS_JSON", JSON.stringify({ betel: { supabaseUrl: "https://db.example", supabaseKey: "PRIVATE_KEY", storage: "https://storage.example/health" } }));
  const { collectHealth } = await import("@/lib/infrastructure/collector"); await collectHealth("betel");
  expect(fetch.mock.calls.find(call => String(call[0]).includes("storage.example"))?.[1]).toMatchObject({ headers: {} });
});

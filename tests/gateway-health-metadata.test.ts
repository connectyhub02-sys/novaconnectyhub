import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { saveGatewayHealthMetadata } from "@/lib/connectyhub-api/health-metadata";

vi.mock("server-only", () => ({}));

const tables = ["connectyhub_api_clients", "connectyhub_webhook_endpoints", "whatsapp_instances"] as const;
const guard = { allowed: false, paused_by: "connectyhub_api_access_guard" };

function database(afterRead?: () => void) {
  let row = { id: "client", updated_at: "2026-10-10T03:00:00Z", status: "active", metadata: {} as Record<string, unknown> };
  const client = createClient("https://database.test", "test-key", {
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === "GET") {
        const result = structuredClone(row);
        afterRead?.();
        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
      }
      if (init?.method !== "PATCH") throw new Error("Unexpected operation");
      // Apply PostgREST equality predicates to the current row, not the old snapshot.
      const matches = [...url.searchParams].every(([key, value]) =>
        value === `eq.${row[key as keyof typeof row]}`);
      if (matches) row = { ...row, ...JSON.parse(String(init.body)), updated_at: "2026-10-10T03:00:03Z" };
      return new Response(null, { status: 204 });
    } },
  });
  return { client, read: () => structuredClone(row), change: (next: Partial<typeof row>) => { row = { ...row, ...next }; } };
}

describe.each(tables)("health updates for %s", (table) => {
  it("retains a billing pause written while a health probe was in flight", async () => {
    const db = database(), snapshot = db.read();
    db.change({ status: "paused", updated_at: "2026-10-10T03:00:01Z", metadata: { connectyhub_api_access_guard: guard } });
    await saveGatewayHealthMetadata(db.client, table, snapshot, { gateway_health: { ok: true } });
    expect(db.read()).toMatchObject({ status: "paused", metadata: { connectyhub_api_access_guard: guard } });
    expect(db.read().metadata).toHaveProperty("gateway_health");
  });

  it("discards a write when billing changes after the fresh metadata read", async () => {
    const db = database(() => db.change({ status: "paused", updated_at: "2026-10-10T03:00:01Z", metadata: { connectyhub_api_access_guard: guard } }));
    await saveGatewayHealthMetadata(db.client, table, db.read(), { gateway_health: { ok: true } });
    expect(db.read()).toMatchObject({ status: "paused", metadata: { connectyhub_api_access_guard: guard } });
    expect(db.read().metadata).not.toHaveProperty("gateway_health");
  });

  it("saves health after webhook delivery has updated its timestamp", async () => {
    const db = database(), snapshot = db.read();
    db.change({ updated_at: "2026-10-10T03:00:01Z" });
    await saveGatewayHealthMetadata(db.client, table, snapshot, { gateway_health: { ok: true } });
    expect(db.read().metadata).toEqual({ gateway_health: { ok: true } });
  });

  it("does not resurrect an old billing guard after contract release", async () => {
    const db = database();
    db.change({ status: "paused", metadata: { connectyhub_api_access_guard: guard } });
    const snapshot = db.read();
    db.change({ status: "active", updated_at: "2026-10-10T03:00:02Z", metadata: { connectyhub_api_access_guard: { ...guard, allowed: true } } });
    await saveGatewayHealthMetadata(db.client, table, snapshot, { gateway_health: { ok: true } });
    expect(db.read()).toMatchObject({ status: "active", metadata: { connectyhub_api_access_guard: { allowed: true } } });
  });

  it("refreshes health on the next probe and retains access metadata", async () => {
    const db = database();
    db.change({ status: "paused", metadata: { connectyhub_api_access_guard: guard, custom_contract_release: { reason: "admin" } } });
    await saveGatewayHealthMetadata(db.client, table, db.read(), { gateway_health: { ok: true } });
    expect(db.read()).toMatchObject({ status: "paused", metadata: { connectyhub_api_access_guard: guard, custom_contract_release: { reason: "admin" }, gateway_health: { ok: true } } });
  });
});

it("reports a failed health write instead of silently claiming success", async () => {
  const client = createClient("https://database.test", "test-key", { global: { fetch: async (_input, init) => init?.method === "GET"
    ? new Response(JSON.stringify({ metadata: {}, updated_at: "2026-10-10T03:00:00Z" }), { headers: { "content-type": "application/json" } })
    : new Response(JSON.stringify({ message: "unavailable" }), { status: 503 }) } });
  await expect(saveGatewayHealthMetadata(client, tables[0], { id: "client" }, {})).rejects.toThrow("unavailable");
});

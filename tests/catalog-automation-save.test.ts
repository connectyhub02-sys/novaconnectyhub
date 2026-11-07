import { describe, expect, it } from "vitest";
import * as crypto from "node:crypto";
import * as shared from "../src/lib/sales-catalog/shared";
import * as icons from "../src/lib/sales-catalog/category-icons";
import * as writes from "../src/lib/sales-catalog/settings-write";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Row = { id: string; organization_id: string; memory_type: string; updated_at: string | null; metadata: Record<string, unknown> };
const revision = "2026-11-07T12:00:00.000Z";
function setup(initial: Row | null, race = false) {
  let row = initial ? structuredClone(initial) : null;
  let mutations = 0;
  const client = { from(table: string) {
    let operation = "read"; let payload: Record<string, unknown> = {};
    const filters: [string, unknown][] = [];
    const query = {
      select() { return query; }, eq(key: string, value: unknown) { filters.push([key, value]); return query; },
      is(key: string, value: unknown) { filters.push([key, value]); return query; }, order() { return query; }, limit() { return query; },
      update(value: Record<string, unknown>) { operation = "update"; payload = value; return query; },
      insert(value: Record<string, unknown>) { operation = "insert"; payload = value; return query; },
      async maybeSingle() {
        if (operation === "read") return { data: row ? structuredClone(row) : null, error: null };
        if (race && row) row.updated_at = "2026-11-07T12:05:00.000Z";
        if (operation === "insert" && row) return { data: null, error: { code: "23505" } };
        if (operation === "update" && (!row || filters.some(([key, value]) => key !== "scope" && row![key as keyof Row] !== value))) return { data: null, error: null };
        mutations++; row = { ...row, ...payload } as Row; return { data: structuredClone(row), error: null };
      },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: null, error: null, table })); },
    };
    return query;
  } };
  const mod = serverModuleHarness<{ saveCatalogSettings(input: unknown): Promise<unknown> }>("src/app/api/dashboard/sales-catalog/route.ts", {
    "node:crypto": crypto,
    "@/lib/sales-catalog/shared": shared,
    "@/lib/sales-catalog/category-icons": icons,
    "@/lib/sales-catalog/settings-write": writes,
    "@/lib/client-os/sales-catalog": { mapSalesCatalogSettings: (value: unknown) => value },
    "@/lib/client-os/companies": { requireClientCompanyAccess: async ({ companyId }: { companyId: string }) => { if (companyId !== "org") throw Error("Empresa não autorizada"); return { id: "org" }; } },
  }, ["saveCatalogSettings"]);
  return { save: (body: Record<string, unknown>, companyId = "org") => mod.saveCatalogSettings({ client, companyId, userId: "owner", body }), row: () => row, mutations: () => mutations };
}
const existing: Row = { id: "settings", organization_id: "org", memory_type: "sales_catalog_settings", updated_at: revision, metadata: {
  configured: true, business_type: "simple", categories: ["Pratos"],
  storefront: { hero_title: "Minha loja", primary_color: "#123456", future_field: "keep" },
  commerce_agent: { enabled: true, mode: "guided", surfaces: ["storefront"] },
  payment_methods: [{ id: "pix", enabled: true }], pagbank: { account: "preserve" },
  order_bumps: { enabled: true, items: [{ productId: "item" }] }, custom_future_setting: { keep: true },
} };
const body = { action: "save_automation_settings", expectedUpdatedAt: revision,
  messageTemplates: shared.createDefaultSalesCatalogCommerceSettings().messageTemplates,
  automationSettings: shared.createDefaultSalesCatalogCommerceSettings().automationSettings };

describe("automation save through the real catalog handler", () => {
  it("only changes automation domains, preserving customized shop, agent, payments and future fields", async () => {
    const app = setup(existing);
    await app.save({ ...body, storefront: { heroTitle: "must be ignored" }, commerceAgent: { enabled: false }, categories: [] });
    for (const [key, value] of Object.entries(existing.metadata)) expect(app.row()?.metadata[key], key).toEqual(value);
    expect(app.row()?.metadata.message_templates).toBeDefined();
    expect(app.mutations()).toBe(1);
  });
  it("rejects an old editor without writing anything", async () => {
    const app = setup({ ...existing, updated_at: "newer" });
    await expect(app.save(body)).rejects.toThrow(/outra tela/); expect(app.mutations()).toBe(0);
  });
  it("rejects an interleaving write after the version was read", async () => {
    const app = setup(existing, true);
    await expect(app.save(body)).rejects.toThrow(/outra tela/); expect(app.mutations()).toBe(0);
  });
  it("rejects a request without a revision and an unauthorized company", async () => {
    const app = setup(existing);
    await expect(app.save({ action: "save_catalog_settings" })).rejects.toThrow(/outra tela/);
    await expect(app.save(body, "another-org")).rejects.toThrow(/autorizada/); expect(app.mutations()).toBe(0);
  });
  it("uses a deterministic first-save identity for the same company", async () => {
    const a = setup(null), b = setup(null);
    await a.save({ ...body, expectedUpdatedAt: null }); await b.save({ ...body, expectedUpdatedAt: null });
    expect(a.row()?.id).toBe(b.row()?.id); expect(a.row()?.organization_id).toBe("org");
    expect(a.row()?.metadata.configured).toBe(false);
  });
});

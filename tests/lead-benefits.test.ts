import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Benefits = typeof import("../src/lib/automations/lead-benefits");
type Row = Record<string, unknown>;
const now = new Date("2026-09-26T15:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();

function setup(tables: Record<string, Row[]>) {
  const db = commerceDatabase(tables);
  const revision = vi.fn(async () => ({}));
  const benefits = serverModuleHarness<Benefits>("src/lib/automations/lead-benefits.ts", {
    "@/lib/sales-catalog/order-revision": { applySalesCatalogOrderRevision: revision },
  });
  return { db, revision, benefits };
}

describe("birthday present for the lead", () => {
  it("uses the products the lead buys most", async () => {
    const s = setup({
      sales_catalog_orders: [{ id: "o1", organization_id: "org", lead_id: "lead", payment_status: "confirmed" }],
      sales_catalog_order_items: [
        { organization_id: "org", order_id: "o1", catalog_item_id: "cipionato", quantity: 3 },
        { organization_id: "org", order_id: "o1", catalog_item_id: "seringa", quantity: 1 },
      ],
    });
    const benefit = await s.benefits.ensureBirthdayBenefit(s.db.client as never, { organizationId: "org", leadId: "lead", year: 2026, now,
      gift: { kind: "favorites_discount", percent: 10, productId: null } });
    expect(benefit).toMatchObject({ benefit_kind: "favorites_discount", percent: 10, product_ids: ["cipionato", "seringa"] });
    const again = await s.benefits.ensureBirthdayBenefit(s.db.client as never, { organizationId: "org", leadId: "lead", year: 2026, now,
      gift: { kind: "favorites_discount", percent: 10, productId: null } });
    expect(s.db.tables.lead_benefits).toHaveLength(1);
    expect(again?.id).toBe(benefit?.id);
  });

  it("falls back to a discount on the order when the lead has no favorites yet", async () => {
    const s = setup({});
    const benefit = await s.benefits.ensureBirthdayBenefit(s.db.client as never, { organizationId: "org", leadId: "lead", year: 2026, now,
      gift: { kind: "favorites_discount", percent: 10, productId: null } });
    expect(benefit).toMatchObject({ benefit_kind: "order_discount", percent: 10, product_ids: [] });
  });
});

describe("present applied before the payment", () => {
  const order = (extra: Row = {}) => ({ id: "order", organization_id: "org", lead_id: "lead", conversation_id: "c", status: "pending_payment", payment_status: "pending",
    discount_total: null, shipping_total: "10", shipping_method: "Entrega", destination_cep: "88330000", destination_address: "Rua A, 1", checkout_revision: 0,
    metadata: { billing_cycles: ["one_time"] }, ...extra });
  const items = [
    { organization_id: "org", order_id: "order", catalog_item_id: "pizza", title: "Pizza", quantity: 1, unit_price: "60", total: "60" },
    { organization_id: "org", order_id: "order", catalog_item_id: "soda", title: "Refrigerante", quantity: 2, unit_price: "8", total: "16" },
  ];
  const benefit = (extra: Row) => ({ id: "b", organization_id: "org", lead_id: "lead", used_order_id: null, valid_from: ago(1), valid_until: ago(-6), product_ids: [], gift_product_id: null, percent: null, ...extra });

  it.each([
    ["10% on the order", { benefit_kind: "order_discount", percent: 10 }, 7.6],
    ["10% on the favorites only", { benefit_kind: "favorites_discount", percent: 10, product_ids: ["pizza"] }, 6],
    ["one unit of the gift product", { benefit_kind: "gift_product", gift_product_id: "soda" }, 8],
  ])("%s", async (_label, extra, discount) => {
    const s = setup({ sales_catalog_orders: [order()], sales_catalog_order_items: items, lead_benefits: [benefit(extra)] });
    expect(await s.benefits.applyLeadBenefitBeforePayment(s.db.client as never, "org", "order", now)).toEqual({ discount, total: Math.round((76 - discount + 10) * 100) / 100 });
    expect(s.revision).toHaveBeenCalledWith(expect.objectContaining({ discountTotal: discount, requestId: "benefit:b:order" }));
    expect(s.db.tables.lead_benefits[0]).toMatchObject({ used_order_id: "order" });
  });

  it.each([
    ["the order already has a discount", { order: { discount_total: "5" } }],
    ["it is a subscription", { order: { metadata: { billing_cycles: ["monthly"] } } }],
    ["the present expired", { benefit: { valid_until: ago(1) } }],
    ["the gift is not in the order", { benefit: { benefit_kind: "gift_product", gift_product_id: "dessert" } }],
  ])("does nothing when %s", async (_label, options: { order?: Row; benefit?: Row }) => {
    const s = setup({ sales_catalog_orders: [order(options.order)], sales_catalog_order_items: items,
      lead_benefits: [benefit({ benefit_kind: "order_discount", percent: 10, ...options.benefit })] });
    expect(await s.benefits.applyLeadBenefitBeforePayment(s.db.client as never, "org", "order", now)).toBeNull();
    expect(s.revision).not.toHaveBeenCalled();
  });
});

describe("birthday present rules in the database", () => {
  it("accepts one choice with its number and keeps each benefit unique", async () => {
    const db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table organizations(id uuid primary key); create table leads(id uuid primary key); create table sales_catalog_orders(id uuid primary key);
      create table automation_policies(organization_id uuid primary key);`);
    await db.exec(readFileSync("supabase/migrations/0163_birthday_gift.sql", "utf8").replace("notify pgrst, 'reload schema';", ""));
    const org = randomUUID(), lead = randomUUID();
    await db.query("insert into organizations values ($1)", [org]);
    await db.query("insert into leads values ($1)", [lead]);
    await db.query("insert into automation_policies(organization_id) values ($1)", [org]);
    expect((await db.query<{ birthday_gift_kind: string }>("select birthday_gift_kind from automation_policies")).rows[0].birthday_gift_kind).toBe("none");
    await expect(db.query("update automation_policies set birthday_gift_percent=40")).rejects.toThrow();
    await expect(db.query("update automation_policies set birthday_gift_kind='free_money'")).rejects.toThrow();
    const insert = (key: string, kind: string, percent: number | null, gift: string | null) => db.query(
      "insert into lead_benefits(organization_id,lead_id,source,benefit_kind,percent,gift_product_id,valid_from,valid_until,request_key) values ($1,$2,'birthday',$3,$4,$5,now(),now()+interval '7 days',$6)",
      [org, lead, kind, percent, gift, key]);
    await insert("a", "order_discount", 10, null);
    await expect(insert("a", "order_discount", 10, null)).rejects.toThrow();
    await expect(insert("b", "gift_product", null, null)).rejects.toThrow();
    await expect(insert("c", "order_discount", null, null)).rejects.toThrow();
    await db.close();
  }, 30000);
});

describe("birthday message", () => {
  const load = (gift: unknown) => serverModuleHarness<typeof import("../src/lib/automations/relationship-context")>("src/lib/automations/relationship-context.ts", {
    "./birthday-gift": { loadBirthdayGift: async () => gift },
    "./lead-benefits": {
      ensureBirthdayBenefit: async () => ({ id: "b", benefit_kind: "favorites_discount", percent: 10, product_ids: ["cipionato"], gift_product_id: null, valid_until: "2026-10-03T12:00:00Z", used_order_id: null }),
      describeBenefit: serverModuleHarness<Benefits>("src/lib/automations/lead-benefits.ts", { "@/lib/sales-catalog/order-revision": {} }).describeBenefit,
    },
    "@/lib/client-os/sales-catalog": { listOrganizationSalesCatalog: async () => [] },
    "@/lib/sales-catalog/public-urls": { buildLeadAwareSalesCatalogProductUrl: () => "" },
    "./relationship-profile": { sellableRecommendation: () => true },
  });
  const data = { organizationId: "org", leadId: "lead", conversationId: "c", whatsappInstanceId: "i", agentId: "a", agentRunId: "r", birthdayYear: 2026 };
  const client = commerceDatabase({ intelligence_memory: [{ id: "cipionato", organization_id: "org", title: "Cipionato" }] }).client;

  it("announces the store's present with what, until when and that it applies by itself", async () => {
    const result = await load({ kind: "favorites_discount", percent: 10, productId: null }).relationshipContext(client as never, data as never, "America/Sao_Paulo");
    expect(result.context).toContain("10% de desconto em Cipionato");
    expect(result.context).toContain("03/10");
    expect(result.context).toContain("sem cupom");
  });

  it("only congratulates when the store chose no present", async () => {
    const result = await load(null).relationshipContext(client as never, data as never, "America/Sao_Paulo");
    expect(result.context).toContain("não ofereça desconto nem presente");
  });
});

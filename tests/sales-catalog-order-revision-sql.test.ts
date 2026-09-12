import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

let db: PGlite;
const org = randomUUID();
const pizza = randomUUID();
const lemonade = randomUUID();
const sku = randomUUID();
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create type sales_catalog_order_status as enum ('draft','pending_payment','paid','in_preparation','shipped','delivered','cancelled','needs_human');
    create type sales_catalog_payment_status as enum ('pending','proof_sent','confirmed','failed','refunded');
    create table organizations(id uuid primary key);
    create table leads(id uuid primary key,organization_id uuid,metadata jsonb default '{}');
    create table conversations(id uuid primary key,organization_id uuid,lead_id uuid,metadata jsonb default '{}');
    create table conversation_messages(id uuid primary key,organization_id uuid,lead_id uuid,conversation_id uuid,direction text);
    create table intelligence_memory(id uuid primary key, organization_id uuid, scope text default 'organization',memory_type text,title text,metadata jsonb default '{}',updated_at timestamptz);
    create table sales_catalog_orders(id uuid primary key,organization_id uuid,lead_id uuid,conversation_id uuid,customer_email text,customer_name text,customer_phone text,customer_document text,source text,status sales_catalog_order_status default 'pending_payment',payment_status sales_catalog_payment_status default 'pending',payment_method text,subtotal text,total text,discount_total text,shipping_total text,shipping_method text,destination_cep text,destination_address text,latest_payment_session_id uuid,metadata jsonb default '{}',updated_at timestamptz,
      commercial_flow_type text default 'client_direct',revenue_owner_type text default 'client',contains_platform_products boolean default false,commission_eligible boolean default false);
    create table sales_catalog_payment_sessions(id uuid primary key, organization_id uuid,order_id uuid,integration_id uuid,provider text,method text,status text,amount numeric,payer_email text,idempotency_key text,external_reference text,metadata jsonb default '{}',payment_owner_type text,commercial_flow_type text,revenue_owner_type text,commission_context jsonb,provider_payment_id text,provider_status text,provider_status_detail text,paid_at timestamptz,updated_at timestamptz);
    create table sales_catalog_skus(id uuid primary key,organization_id uuid,catalog_item_id uuid,status text default 'active',price text,sale_price text,stock_quantity integer,stock_status text,metadata jsonb default '{}',updated_at timestamptz);
    create table sales_catalog_order_items(id uuid primary key default gen_random_uuid(),organization_id uuid,order_id uuid,catalog_item_id uuid,sku_id uuid,sku_code text,title text,tag text,quantity integer,unit_price text,sale_price text,total text,attributes jsonb,fulfillment jsonb,metadata jsonb,product_origin_type text,commercial_flow_type text,revenue_owner_type text,commission_eligible boolean,platform_product_id uuid);
    create table intelligence_events(id uuid default gen_random_uuid(),scope text,organization_id uuid,source_type text,source_id uuid,event_type text,title text,summary text,visibility text,tags text[],payload jsonb,occurred_at timestamptz default now());
    create table billing_card_attempts(id uuid primary key);
  `);
  await db.exec(readFileSync("supabase/migrations/0076_transparent_checkout_attempts.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0080_payment_evidence_and_reviews.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0132_sales_catalog_order_revisions.sql", "utf8"));
  await db.query("insert into organizations values ($1)", [org]);
  await db.query("insert into intelligence_memory(id,organization_id,memory_type,title,metadata) values ($1,$3,'sales_catalog_item','Pizza','{\"price\":\"40\"}'),($2,$3,'sales_catalog_item','Limonada','{\"price\":\"10\"}')", [pizza, lemonade, org]);
  await db.query("insert into sales_catalog_skus(id,organization_id,catalog_item_id) values ($1,$2,$3)", [sku, org, lemonade]);
}, 30000);
afterAll(async () => { await db?.close(); });

type SavedOrder = { id: string; total: string; subtotal: string; checkout_revision: number; shipping_total: string; latest_payment_session_id: string; metadata: Record<string, unknown> };
function item(id: string, quantity = 1, price = id === pizza ? 40 : 10) {
  return { catalog_item_id: id, title: id === pizza ? "Pizza" : "Limonada", quantity, unit_price: String(price), total: String(price * quantity),
    product_origin_type: "client", commercial_flow_type: "client_direct", revenue_owner_type: "client", fulfillment: { mode: "physical" }, metadata: {} };
}
function payload(rows = [item(pizza), item(lemonade)]) {
  return { rows, shipping: { total: 5, method: "Entrega local", destination_cep: "01001000", destination_address: "Rua das Pizzas, 20, Cidade Exemplo" },
    expected_total: rows.reduce((total, row) => total + Number(row.total), 0) + 5 - 2, preferred_payment_method: "card" };
}
async function fixture() {
  const f = { order: randomUUID(), lead: randomUUID(), conversation: randomUUID(), session: randomUUID(), request: randomUUID(), token: randomUUID(), revision: 1 };
  await db.query("insert into leads(id,organization_id) values ($1,$2)", [f.lead, org]);
  await db.query("insert into conversations(id,organization_id,lead_id) values ($1,$2,$3)", [f.conversation, org, f.lead]);
  await db.query("insert into sales_catalog_orders(id,organization_id,lead_id,conversation_id,subtotal,total,shipping_total,discount_total,shipping_method,destination_cep,destination_address,latest_payment_session_id,metadata) values ($1,$2,$3,$4,'40','43','5','2','Entrega local','01001000','Rua das Pizzas, 20, Cidade Exemplo',$5,'{\"customer_fact\":\"preserve\"}')", [f.order, org, f.lead, f.conversation, f.session]);
  await db.query("insert into sales_catalog_order_items(organization_id,order_id,catalog_item_id,title,quantity,unit_price,total) values($1,$2,$3,'Pizza',1,'40','40')", [org, f.order, pizza]);
  await db.query("insert into sales_catalog_payment_sessions(id,organization_id,order_id,provider,method,status,amount) values ($1,$2,$3,'asaas','pix','created',43)", [f.session, org, f.order]);
  return f;
}
async function begin(f: Awaited<ReturnType<typeof fixture>>, p = payload(), scope = { org, lead: f.lead, conversation: f.conversation }) {
  return (await db.query<{ result: { claimed?: boolean; needs_retirement?: boolean; replay?: boolean; order?: SavedOrder } }>("select begin_sales_catalog_order_revision($1,$2,$3,$4,$5,$6,$7,$8) as result",
    [f.order, scope.org, scope.lead, scope.conversation, f.revision, f.request, f.token, p])).rows[0].result;
}
async function finish(f: Awaited<ReturnType<typeof fixture>>) {
  return (await db.query<{ result: SavedOrder }>("select finish_sales_catalog_order_revision($1,$2,$3,$4) as result", [f.order, org, f.request, f.token])).rows[0].result;
}
async function rows(f: Awaited<ReturnType<typeof fixture>>) { return (await db.query("select title,quantity,total from sales_catalog_order_items where order_id=$1 order by title", [f.order])).rows; }

describe.sequential("confirmed full-cart revision transaction", () => {
  it.each([
    ["add", [item(pizza), item(lemonade)], 53],
    ["increase", [item(pizza, 3)], 123],
    ["reduce", [item(pizza, 1)], 43],
    ["replace/remove", [item(lemonade, 2)], 23],
  ])("commits %s on the same order with delivery, discount and payment preference", async (label, next, total) => {
    const f = await fixture();
    if (label === "reduce") {
      await db.query("update sales_catalog_order_items set quantity=3,total='120' where order_id=$1", [f.order]);
      await db.query("update sales_catalog_orders set subtotal='120',total='123' where id=$1", [f.order]);
      f.revision = (await db.query<{ checkout_revision: number }>("select checkout_revision from sales_catalog_orders where id=$1", [f.order])).rows[0].checkout_revision;
    }
    await begin(f, payload(next as ReturnType<typeof item>[]));
    const result = await finish(f);
    expect(result).toMatchObject({ id: f.order, subtotal: (Number(total) - 3).toFixed(2), total: String(total), shipping_total: "5", latest_payment_session_id: f.session });
    expect(result.checkout_revision).toBeGreaterThan(f.revision);
    expect(result.metadata).toMatchObject({ customer_fact: "preserve", preferred_payment_method: "card", checkout_items_ready: true });
    expect(await rows(f)).toHaveLength((next as unknown[]).length);
    expect((await db.query("select id from sales_catalog_orders where lead_id=$1", [f.lead])).rows).toHaveLength(1);
    expect((await db.query("select id from intelligence_events where source_id=$1 and event_type='sales_catalog.order_revised'", [f.order])).rows).toHaveLength(1);
  });
  it("requires old payable sessions to be retired and does not alter their ownership", async () => {
    const f = await fixture();
    await db.query("update sales_catalog_payment_sessions set status='pending',provider_payment_id='pizza_pix',payment_owner_type='client',revenue_owner_type='client' where id=$1", [f.session]);
    expect(await begin(f)).toEqual({ claimed: true, needs_retirement: true });
    await expect(finish(f)).rejects.toThrow("CHECKOUT_PREVIOUS_PAYMENT_PENDING");
    expect(await rows(f)).toHaveLength(1);
    await db.query("update sales_catalog_payment_sessions set status='cancelled' where id=$1", [f.session]);
    await finish(f);
    expect((await db.query("select payment_owner_type,revenue_owner_type from sales_catalog_payment_sessions where id=$1", [f.session])).rows[0]).toEqual({ payment_owner_type: "client", revenue_owner_type: "client" });
  });
  it("replays completion after a new payment without entering retirement again", async () => {
    const f = await fixture();
    await begin(f); const saved = await finish(f);
    await db.query("insert into sales_catalog_payment_sessions(id,organization_id,order_id,provider,status,provider_payment_id) values ($1,$2,$3,'asaas','pending','new_pizza_pix')", [randomUUID(), org, f.order]);
    expect(await begin(f)).toEqual({ replay: true, order: saved });
    expect(await finish(f)).toEqual(saved);
    expect((await db.query("select id from intelligence_events where source_id=$1", [f.order])).rows).toHaveLength(1);
  });
  it("rebuilds derived cart metadata instead of keeping removed offers and billing cycles", async () => {
    const f = await fixture();
    await db.query("update sales_catalog_orders set metadata=metadata||$2 where id=$1", [f.order, { billing_cycles: ["recurring"], order_bump_product_ids: [pizza], platform_product_ids: [randomUUID()] }]);
    await begin(f, payload([item(lemonade, 2)]));
    expect((await finish(f)).metadata).toMatchObject({ selected_catalog_item_ids: [lemonade], billing_cycles: ["one_time"], order_bump_product_ids: [], platform_product_ids: [], commission_eligible: false });
  });
  it("serializes two revisions and rejects reuse of an ID with another cart", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([begin(f), begin({ ...f, request: randomUUID(), token: randomUUID() })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(begin(f, payload([item(pizza, 2)]))).rejects.toThrow("CHECKOUT_REVISION_CONFLICT");
  });
  it("blocks new card/Pix starts and other cart editors throughout retirement", async () => {
    const f = await fixture(); await begin(f);
    await expect(db.query("select claim_checkout_card_attempt($1,$2,1,43)", [f.session, randomUUID()])).rejects.toThrow("CHECKOUT_REVISION_BUSY");
    await expect(db.query("select begin_checkout_gateway_request($1)", [f.session])).rejects.toThrow("CHECKOUT_REVISION_BUSY");
    await expect(db.query("insert into sales_catalog_payment_sessions(id,organization_id,order_id,status) values ($1,$2,$3,'created')", [randomUUID(), org, f.order])).rejects.toThrow("CHECKOUT_REVISION_BUSY");
    await expect(db.query("update sales_catalog_orders set shipping_total='6' where id=$1", [f.order])).rejects.toThrow("CHECKOUT_REVISION_BUSY");
    await expect(db.query("update sales_catalog_order_items set quantity=2 where order_id=$1", [f.order])).rejects.toThrow("CHECKOUT_REVISION_BUSY");
  });
  it("accepts address-free pickup only with the organization's explicit pickup configuration", async () => {
    const f = await fixture(); const p = payload();
    p.shipping = { total: 0, method: "Retirada na loja", destination_cep: null, destination_address: null } as unknown as typeof p.shipping;
    p.expected_total = 48;
    await expect(begin(f, p)).rejects.toThrow("CHECKOUT_DELIVERY_REQUIRED");
    const settings = randomUUID();
    await db.query("insert into intelligence_memory(id,organization_id,memory_type,metadata,updated_at) values($1,$2,'sales_catalog_shipping_settings','{\"local_pickup\":true}',now())", [settings, org]);
    try {
      await expect(begin(f, { ...p, shipping: { ...p.shipping, method: "Retirada inventada" } })).rejects.toThrow("CHECKOUT_DELIVERY_REQUIRED");
      await expect(begin(f, { ...p, shipping: { ...p.shipping, total: 5 }, expected_total: 53 })).rejects.toThrow("CHECKOUT_DELIVERY_REQUIRED");
      await begin(f, p);
      expect(await finish(f)).toMatchObject({ total: "48", shipping_total: "0", shipping_method: "Retirada na loja", destination_cep: null, destination_address: null });
    } finally { await db.query("delete from intelligence_memory where id=$1", [settings]); }
  });
  it("invalidates a paused, unissued Pix even for a replacement with the same total", async () => {
    const f = await fixture(); await begin(f, payload([item(lemonade, 4)])); const saved = await finish(f);
    expect(saved.total).toBe("43");
    await expect(db.query("select begin_checkout_gateway_request($1)", [f.session])).rejects.toThrow("CHECKOUT_CHANGED");
    // A delayed legacy failure writes its old metadata snapshot. Supersession survives.
    await db.query("update sales_catalog_payment_sessions set status='error',metadata='{}' where id=$1", [f.session]);
    await expect(db.query("select begin_checkout_gateway_request($1)", [f.session])).rejects.toThrow("CHECKOUT_CHANGED");
    await expect(db.query("update sales_catalog_payment_sessions set status='pending',metadata='{}' where id=$1", [f.session])).rejects.toThrow("CHECKOUT_CHANGED");
    // The old public checkout can still load the order and create a fresh card attempt.
    expect((await db.query<{ result: { claimed: boolean } }>("select claim_checkout_card_attempt($1,$2,$3,43) as result", [f.session, randomUUID(), saved.checkout_revision])).rows[0].result.claimed).toBe(true);
  });
  it("rejects a gateway start with a stale amount even when there is no active revision", async () => {
    const f = await fixture();
    await db.query("update sales_catalog_payment_sessions set amount=41 where id=$1", [f.session]);
    await expect(db.query("select begin_checkout_gateway_request($1)", [f.session])).rejects.toThrow("CHECKOUT_CHANGED");
  });
  it.each(["paid", "refunded", "cancelled", "unknown", "inflight", "review"])("preserves %s financial protections before retirement", async mode => {
    const f = await fixture();
    if (mode === "paid") await db.query("update sales_catalog_orders set payment_status='confirmed' where id=$1", [f.order]);
    if (mode === "refunded") await db.query("update sales_catalog_orders set payment_status='refunded' where id=$1", [f.order]);
    if (mode === "cancelled") await db.query("update sales_catalog_orders set status='cancelled' where id=$1", [f.order]);
    if (mode === "inflight") await db.query("update sales_catalog_payment_sessions set metadata='{\"gateway_request_inflight\":true}' where id=$1", [f.session]);
    if (mode === "unknown") await db.query("insert into sales_catalog_card_attempts(id,organization_id,order_id,source_session_id,payment_session_id,revision,amount,state) values ($1,$2,$3,$4,$4,1,43,'unknown')", [randomUUID(), org, f.order, f.session]);
    if (mode === "review") await db.query("insert into sales_catalog_payment_reviews(organization_id,lead_id,order_id) values($1,$2,$3)", [org, f.lead, f.order]);
    await expect(begin(f)).rejects.toThrow(/CHECKOUT_(CLOSED|PAYMENT_BUSY|FINANCIAL_REVIEW)/);
    expect(await rows(f)).toHaveLength(1);
    expect((await db.query("select * from sales_catalog_order_revisions where order_id=$1", [f.order])).rows).toHaveLength(0);
  });
  it("does not overwrite a payment confirmed after revision claim", async () => {
    const f = await fixture(); await begin(f);
    await db.query("update sales_catalog_orders set payment_status='confirmed',status='paid' where id=$1", [f.order]);
    await expect(finish(f)).rejects.toThrow("CHECKOUT_CLOSED");
    expect(await rows(f)).toHaveLength(1);
  });
  it("rejects stale totals, quantities, tenants, SKU identity and financial-owner changes before claiming", async () => {
    const f = await fixture();
    await expect(begin({ ...f, revision: 0 })).rejects.toThrow("CHECKOUT_CHANGED");
    await expect(begin(f, { ...payload(), expected_total: 1 })).rejects.toThrow("CHECKOUT_INVALID_TOTAL");
    await expect(begin(f, payload([{ ...item(pizza), quantity: 0 }]))).rejects.toThrow("CHECKOUT_INVALID_CART");
    await expect(begin(f, payload([{ ...item(pizza), total: "1" }]))).rejects.toThrow("CHECKOUT_INVALID_TOTAL");
    await expect(begin(f, payload(), { org: randomUUID(), lead: f.lead, conversation: f.conversation })).rejects.toThrow("CHECKOUT_NOT_FOUND");
    await expect(begin(f, payload(), { org, lead: f.lead, conversation: randomUUID() })).rejects.toThrow("CHECKOUT_NOT_FOUND");
    await expect(begin(f, payload([{ ...item(pizza), sku_id: sku } as ReturnType<typeof item>]))).rejects.toThrow("CHECKOUT_INVALID_PRODUCT");
    await expect(begin(f, payload([{ ...item(pizza), revenue_owner_type: "connectyhub" }]))).rejects.toThrow("CHECKOUT_FINANCIAL_OWNER_CHANGED");
    expect((await db.query("select * from sales_catalog_order_revisions where order_id=$1", [f.order])).rows).toHaveLength(0);
  });
  it("rolls back items, order, revision receipt and audit if an insertion fails", async () => {
    const f = await fixture(); await begin(f);
    await db.exec(`create function reject_revision_fixture() returns trigger language plpgsql as $$ begin if new.title='Limonada' then raise exception 'fixture failure'; end if; return new; end $$;
      create trigger reject_revision_fixture before insert on sales_catalog_order_items for each row execute function reject_revision_fixture();`);
    try { await expect(finish(f)).rejects.toThrow("fixture failure"); }
    finally { await db.exec("drop trigger reject_revision_fixture on sales_catalog_order_items; drop function reject_revision_fixture()"); }
    expect(await rows(f)).toEqual([{ title: "Pizza", quantity: 1, total: "40" }]);
    expect((await db.query("select total,checkout_revision from sales_catalog_orders where id=$1", [f.order])).rows[0]).toEqual({ total: "43", checkout_revision: f.revision });
    expect((await db.query("select state,result from sales_catalog_order_revisions where order_id=$1", [f.order])).rows[0]).toEqual({ state: "processing", result: null });
  });
  it("rechecks catalog prices inside both the claim and the final atomic write", async () => {
    const f = await fixture();
    await expect(begin(f, payload([item(pizza, 1, 1)]))).rejects.toThrow("CHECKOUT_CHANGED");
    await begin(f);
    await db.query("update intelligence_memory set metadata='{\"price\":\"42\"}' where id=$1", [pizza]);
    try { await expect(finish(f)).rejects.toThrow("CHECKOUT_CHANGED"); }
    finally { await db.query("update intelligence_memory set metadata='{\"price\":\"40\"}' where id=$1", [pizza]); }
    expect(await rows(f)).toEqual([{ title: "Pizza", quantity: 1, total: "40" }]);
  });
  it("validates the current SKU and sale price while retaining quantity and modifiers", async () => {
    const f = await fixture();
    await db.query("update sales_catalog_skus set price='12',sale_price='8' where id=$1", [sku]);
    const line = { ...item(lemonade, 2, 12), sku_id: sku, sale_price: "8", total: "20", metadata: { conversation_cart_attribute_modifier_total: "2" } };
    try {
      await begin(f, payload([line]));
      expect(await finish(f)).toMatchObject({ subtotal: "20.00", total: "23" });
    } finally { await db.query("update sales_catalog_skus set price=null,sale_price=null where id=$1", [sku]); }
  });
  it("keeps an uncertain retirement blocked without a time-based automatic takeover", async () => {
    const f = await fixture(); await begin(f);
    await db.query("select fail_sales_catalog_order_revision($1,$2,$3,$4,true)", [f.order, org, f.request, f.token]);
    await db.query("update sales_catalog_order_revisions set updated_at=now()-interval '7 days' where order_id=$1", [f.order]);
    await expect(begin(f)).rejects.toThrow("CHECKOUT_REVISION_BLOCKED");
    await expect(begin({ ...f, request: randomUUID(), token: randomUUID() })).rejects.toThrow("CHECKOUT_REVISION_BUSY");
  });
  it("allows retry after failure before retirement and only server roles can mutate", async () => {
    const f = await fixture(); await begin(f);
    await db.query("select fail_sales_catalog_order_revision($1,$2,$3,$4,false)", [f.order, org, f.request, f.token]);
    expect(await begin({ ...f, token: randomUUID() })).toMatchObject({ claimed: true });
    for (const role of ["anon", "authenticated"]) {
      expect((await db.query("select has_function_privilege($1,'public.begin_sales_catalog_order_revision(uuid,uuid,uuid,uuid,bigint,text,uuid,jsonb)','execute') as allowed", [role])).rows[0]).toEqual({ allowed: false });
      expect((await db.query("select has_table_privilege($1,'public.sales_catalog_order_revisions','insert') as allowed", [role])).rows[0]).toEqual({ allowed: false });
    }
  });
});

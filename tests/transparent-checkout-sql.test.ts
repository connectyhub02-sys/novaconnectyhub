import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const org = "11111111-1111-4111-8111-111111111111";
const order = "22222222-2222-4222-8222-222222222222";
const source = "33333333-3333-4333-8333-333333333333";
const attempt = "44444444-4444-4444-8444-444444444444";
const second = "55555555-5555-4555-8555-555555555555";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create type sales_catalog_order_status as enum ('draft','pending_payment','paid','in_preparation','shipped','delivered','cancelled','needs_human');
    create type sales_catalog_payment_status as enum ('pending','proof_sent','confirmed','failed','refunded');
    create table organizations(id uuid primary key);
    create table leads(id uuid primary key,organization_id uuid);
    create table intelligence_memory(id uuid primary key, organization_id uuid, memory_type text,title text,metadata jsonb default '{}',updated_at timestamptz);
    create table sales_catalog_orders(id uuid primary key,organization_id uuid,lead_id uuid,conversation_id uuid,customer_email text,customer_name text,customer_phone text,customer_document text,source text,status sales_catalog_order_status default 'pending_payment',payment_status sales_catalog_payment_status default 'pending',payment_method text,subtotal text,total text,discount_total text,shipping_total text,shipping_method text,destination_cep text,destination_address text,latest_payment_session_id uuid,metadata jsonb default '{}',updated_at timestamptz);
    create table sales_catalog_payment_sessions(id uuid primary key, organization_id uuid,order_id uuid,integration_id uuid,provider text,method text,status text,amount numeric,payer_email text,idempotency_key text,external_reference text,metadata jsonb,payment_owner_type text,commercial_flow_type text,revenue_owner_type text,commission_context jsonb,provider_payment_id text,provider_status text,provider_status_detail text,paid_at timestamptz,updated_at timestamptz);
    create table sales_catalog_skus(id uuid primary key,organization_id uuid,catalog_item_id uuid,stock_quantity integer,stock_status text,metadata jsonb default '{}',updated_at timestamptz);
    create table sales_catalog_order_items(id uuid primary key default gen_random_uuid(),organization_id uuid,order_id uuid,catalog_item_id uuid,sku_id uuid,sku_code text,title text,tag text,quantity integer,unit_price text,sale_price text,total text,attributes jsonb,fulfillment jsonb,metadata jsonb,product_origin_type text,commercial_flow_type text,revenue_owner_type text,commission_eligible boolean,platform_product_id uuid);
    create table intelligence_events(id uuid default gen_random_uuid(),scope text,organization_id uuid,source_type text,source_id uuid,event_type text,title text,summary text,visibility text,tags text[],payload jsonb);
  `);
  await db.exec(readFileSync("supabase/migrations/0076_transparent_checkout_attempts.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0077_commerce_offer_history.sql", "utf8"));
  await db.query("insert into organizations values ($1)", [org]);
  await db.query("insert into sales_catalog_orders(id,organization_id,subtotal,total,shipping_total,discount_total) values ($1,$2,'100','110','10','0')", [order, org]);
  await db.query("insert into sales_catalog_payment_sessions(id,organization_id,order_id,provider,status) values ($1,$2,$3,'asaas','created')", [source, org, order]);
}, 30000);
afterAll(async () => { await db?.close(); });

async function claim(id = attempt, revision = 0, amount = 110) {
  return (await db.query<{ result: { claimed: boolean; attempt: { id: string; state: string } } }>("select claim_checkout_card_attempt($1,$2,$3,$4) as result", [source, id, revision, amount])).rows[0].result;
}

describe.sequential("durable transparent checkout transactions", () => {
  it("rejects a stale amount without creating a payment", async () => {
    await expect(claim(attempt, 0, 100)).rejects.toThrow("CHECKOUT_CHANGED");
    expect((await db.query("select * from sales_catalog_card_attempts")).rows).toHaveLength(0);
  });
  it("claims only one attempt for submissions with different IDs", async () => {
    const results = await Promise.all([claim(), claim(second)]);
    expect(results.filter(result => result.claimed)).toHaveLength(1);
    expect(results.map(result => result.attempt.id)).toEqual([attempt, attempt]);
  });
  it("blocks cart edits and replacement sessions while a payment is processing", async () => {
    await expect(db.query("update sales_catalog_orders set total='120' where id=$1", [order])).rejects.toThrow("CHECKOUT_PAYMENT_BUSY");
    await expect(db.query("insert into sales_catalog_order_items(order_id,total) values ($1,'20')", [order])).rejects.toThrow("CHECKOUT_PAYMENT_BUSY");
    await expect(db.query("update sales_catalog_orders set latest_payment_session_id=$1 where id=$2", [source, order])).rejects.toThrow("CHECKOUT_PAYMENT_BUSY");
  });
  it("retains the lock after a timeout, and returns that same attempt", async () => {
    await db.query("select finish_checkout_card_attempt($1,'unknown')", [attempt]);
    expect((await claim(second)).attempt).toMatchObject({ id: attempt, state: "unknown" });
  });
  it("commits approval and its lead event exactly once, ignoring older results", async () => {
    await db.query("select finish_checkout_card_attempt($1,'approved','pay_test','CONFIRMED')", [attempt]);
    await db.query("select finish_checkout_card_attempt($1,'approved','pay_test','CONFIRMED')", [attempt]);
    await db.query("select finish_checkout_card_attempt($1,'pending','pay_test','PENDING')", [attempt]);
    const saved = (await db.query("select payment_status,status,checkout_payment_lock from sales_catalog_orders where id=$1", [order])).rows[0];
    expect(saved).toEqual({ payment_status: "confirmed", status: "paid", checkout_payment_lock: null });
    expect((await db.query("select * from intelligence_events where event_type='sales_catalog.card_payment_approved'")).rows).toHaveLength(1);
    await expect(claim(second)).rejects.toThrow("CHECKOUT_CLOSED");
  });
  it("rolls back partial stock changes and deducts only once when a worker retries", async () => {
    const product = "12121212-1212-4212-8212-121212121212";
    const missing = "13131313-1313-4313-8313-131313131313";
    await db.query("insert into intelligence_memory(id,organization_id,memory_type,metadata) values ($1,$2,'sales_catalog_item','{\"inventory\":{\"quantity\":10}}')", [product, org]);
    await db.query("insert into sales_catalog_order_items(order_id,organization_id,catalog_item_id,quantity) values ($1,$2,$3,2),($1,$2,$4,1)", [order, org, product, missing]);
    await expect(db.query("select deduct_transparent_checkout_inventory($1)", [attempt])).rejects.toThrow("CHECKOUT_STOCK_NOT_FOUND");
    expect((await db.query("select metadata->'inventory'->>'quantity' as quantity from intelligence_memory where id=$1", [product])).rows[0]).toEqual({ quantity: "10" });
    await db.query("insert into intelligence_memory(id,organization_id,memory_type,metadata) values ($1,$2,'sales_catalog_item','{\"inventory\":{\"quantity\":5}}')", [missing, org]);
    await db.query("select deduct_transparent_checkout_inventory($1)", [attempt]);
    await db.query("select deduct_transparent_checkout_inventory($1)", [attempt]);
    expect((await db.query("select metadata->'inventory'->>'quantity' as quantity from intelligence_memory where id=$1", [product])).rows[0]).toEqual({ quantity: "8" });
    expect((await db.query("select * from intelligence_events where event_type='sales_catalog.inventory_deducted'")).rows).toHaveLength(1);
  });
  it("retains the refund when an approval is delivered late", async () => {
    await db.query("select finish_checkout_card_attempt($1,'refunded','pay_test','REFUNDED')", [attempt]);
    await db.query("select finish_checkout_card_attempt($1,'approved','pay_test','CONFIRMED')", [attempt]);
    expect((await db.query("select payment_status from sales_catalog_orders where id=$1", [order])).rows[0]).toEqual({ payment_status: "refunded" });
  });
  it("adds and removes offers atomically, recalculates totals and rejects stale changes", async () => {
    const cartOrder = "66666666-6666-4666-8666-666666666666";
    const product = "77777777-7777-4777-8777-777777777777";
    await db.query("insert into sales_catalog_orders(id,organization_id,subtotal,total,shipping_total,discount_total) values ($1,$2,'100','110','10','0')", [cartOrder, org]);
    await db.query("insert into sales_catalog_order_items(order_id,organization_id,title,total,metadata) values ($1,$2,'Principal','100','{}')", [cartOrder, org]);
    await db.query("insert into intelligence_memory(id,organization_id,memory_type) values ($1,$2,'sales_catalog_item')", [product, org]);
    const rows = [{ catalog_item_id: product, title: "Oferta", total: 20, unit_price: 20, sale_price: 20, metadata: { order_bump: true }, product_origin_type: "client", commercial_flow_type: "client_direct", revenue_owner_type: "client" }];
    const result = (await db.query<{ result: { checkout_revision: number; total: string } }>("select set_checkout_order_bumps($1,$2,1,$3,15,'Entrega') as result", [cartOrder, org, JSON.stringify(rows)])).rows[0].result;
    expect(Number(result.total)).toBe(135);
    await expect(db.query("select set_checkout_order_bumps($1,$2,1,'[]',10,'Entrega')", [cartOrder, org])).rejects.toThrow("CHECKOUT_CHANGED");
    expect((await db.query("select * from sales_catalog_order_items where order_id=$1", [cartOrder])).rows).toHaveLength(2);
    const removed = (await db.query<{ result: { total: string } }>("select set_checkout_order_bumps($1,$2,$3,'[]',10,'Entrega') as result", [cartOrder, org, result.checkout_revision])).rows[0].result;
    expect(Number(removed.total)).toBe(110);
    expect((await db.query("select * from sales_catalog_order_items where order_id=$1", [cartOrder])).rows).toHaveLength(1);
    expect((await db.query("select * from intelligence_events where source_id=$1", [cartOrder])).rows).toHaveLength(2);
  });
  it("remembers a refusal across surfaces without letting impressions replace it", async () => {
    const lead = "88888888-8888-4888-8888-888888888888";
    const product = "77777777-7777-4777-8777-777777777777";
    await db.query("insert into leads values ($1,$2)", [lead, org]);
    for (const event of ["commerce.offer_declined", "commerce.offer_shown"]) {
      await db.query("insert into intelligence_events(organization_id,event_type,payload) values ($1,$2,$3)", [org, event, JSON.stringify({ lead_id: lead, offer_product_id: product, surface: "product" })]);
    }
    expect((await db.query("select status from lead_commerce_offer_states where lead_id=$1", [lead])).rows).toEqual([{ status: "declined" }]);
  });
  it("rejects another store's products and prevents an empty order transaction", async () => {
    const empty = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const otherProduct = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await db.query("insert into sales_catalog_orders(id,organization_id,total,shipping_total) values ($1,$2,'20','5')", [empty, org]);
    await db.query("insert into intelligence_memory(id,organization_id,memory_type) values ($1,$2,'sales_catalog_item')", [otherProduct, "ffffffff-ffff-4fff-8fff-ffffffffffff"]);
    await expect(db.query("select set_checkout_order_bumps($1,$2,0,$3,5,'Entrega')", [empty, org, JSON.stringify([{ catalog_item_id: otherProduct, total: 20 }])])).rejects.toThrow("CHECKOUT_INVALID_PRODUCT");
    await db.query("insert into sales_catalog_order_items(order_id,total,metadata) values ($1,'20','{\"order_bump\":true}')", [empty]);
    await expect(db.query("select set_checkout_order_bumps($1,$2,1,'[]',5,'Entrega')", [empty, org])).rejects.toThrow("CHECKOUT_EMPTY_CART");
    expect((await db.query("select total from sales_catalog_order_items where order_id=$1", [empty])).rows).toEqual([{ total: "20" }]);
    expect((await db.query("select checkout_revision,total from sales_catalog_orders where id=$1", [empty])).rows[0]).toMatchObject({ checkout_revision: 1, total: "20" });
  });
  it("creates an unpaid upsell once and keeps the original customer's details and lead", async () => {
    const parent = "99999999-9999-4999-8999-999999999999";
    const child = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const product = "77777777-7777-4777-8777-777777777777";
    const lead = "88888888-8888-4888-8888-888888888888";
    await db.query("insert into sales_catalog_orders(id,organization_id,lead_id,payment_status,status,customer_name,customer_email,customer_phone,customer_document,destination_cep,destination_address) values ($1,$2,$3,'confirmed','paid','Pessoa Exemplo','teste@example.com','11999999999','12345678909','01001000','Rua Exemplo, 10')", [parent, org, lead]);
    const item = { title: "Oferta", total: 20, unit_price: 20, sale_price: 20, metadata: {}, product_origin_type: "client", commercial_flow_type: "client_direct", revenue_owner_type: "client" };
    const call = (id: string) => db.query<{ id: string }>("select create_checkout_upsell_order($1,$2,$3,$4,null,$5,5,'Entrega') as id", [parent, org, id, product, JSON.stringify(item)]);
    const results = await Promise.all([call(child), call("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")]);
    expect(results.map(result => result.rows[0].id)).toEqual([child, child]);
    const saved = (await db.query("select payment_status,customer_name,customer_email,destination_cep,total,parent_order_id,lead_id from sales_catalog_orders where id=$1", [child])).rows[0];
    expect(saved).toMatchObject({ payment_status: "pending", customer_name: "Pessoa Exemplo", customer_email: "teste@example.com", destination_cep: "01001000", total: "25.00", parent_order_id: parent, lead_id: lead });
    expect((await db.query("select * from intelligence_events where event_type='sales_catalog.upsell_created'")).rows).toHaveLength(1);
    expect((await db.query("select status from lead_commerce_offer_states where lead_id=$1 and catalog_item_id=$2", [lead, product])).rows).toEqual([{ status: "accepted" }]);
    await expect(db.query("select create_checkout_upsell_order($1,$2,$3,$4,null,$5,5,'Entrega')", [child, org, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", product, JSON.stringify(item)])).rejects.toThrow("CHECKOUT_PARENT_NOT_PAID");
  });
});

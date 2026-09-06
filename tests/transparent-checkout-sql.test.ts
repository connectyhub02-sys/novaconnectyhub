import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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
  await db.exec("alter table leads add column display_name text, add column phone_number text, add column metadata jsonb default '{}', add column last_event_summary text, add column updated_at timestamptz");
  await db.exec(readFileSync("supabase/migrations/0079_checkout_self_service_delivery.sql", "utf8"));
  await db.exec(`alter table intelligence_events add column occurred_at timestamptz default now();
    create table conversations(id uuid primary key,organization_id uuid,lead_id uuid,metadata jsonb default '{}');
    create table conversation_messages(id uuid primary key,organization_id uuid,lead_id uuid,conversation_id uuid,direction text,text_content text,payload jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
    create table lead_files(id uuid primary key default gen_random_uuid(),archive_id uuid);
    create table billing_card_attempts(id uuid primary key);
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);`);
  await db.exec(readFileSync("supabase/migrations/0080_payment_evidence_and_reviews.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0081_lead_journey_archive.sql", "utf8"));
  await db.query("insert into organizations values ($1)", [org]);
  await db.query("insert into sales_catalog_orders(id,organization_id,subtotal,total,shipping_total,discount_total) values ($1,$2,'100','110','10','0')", [order, org]);
  await db.query("insert into sales_catalog_payment_sessions(id,organization_id,order_id,provider,status) values ($1,$2,$3,'asaas','created')", [source, org, order]);
}, 30000);
afterAll(async () => { await db?.close(); });

describe.sequential("payment evidence and durable lead history", () => {
  async function fixture() {
    const ids = { lead: randomUUID(), order: randomUUID(), session: randomUUID(), conversation: randomUUID(), message: randomUUID(), attempt: randomUUID() };
    await db.query("insert into leads(id,organization_id) values ($1,$2)", [ids.lead, org]);
    await db.query("insert into conversations(id,organization_id,lead_id) values ($1,$2,$3)", [ids.conversation, org, ids.lead]);
    await db.query("insert into sales_catalog_orders(id,organization_id,lead_id,conversation_id,total,subtotal,shipping_total,discount_total) values ($1,$2,$3,$4,'110','100','10','0')", [ids.order, org, ids.lead, ids.conversation]);
    await db.query("insert into sales_catalog_payment_sessions(id,organization_id,order_id,provider,status,metadata) values ($1,$2,$3,'asaas','created','{}')", [ids.session, org, ids.order]);
    await db.query("insert into conversation_messages(id,organization_id,lead_id,conversation_id,direction,text_content,payload) values ($1,$2,$3,$4,'inbound','Já paguei',$5)", [ids.message, org, ids.lead, ids.conversation, { image: { file: "fixture" }, creditCard: { number: "4111111111111111", cvv: "123" }, access_token: "secret" }]);
    return ids;
  }
  async function evidence(ids: Awaited<ReturnType<typeof fixture>>) {
    return (await db.query<{ result: { review: { id: string } | null; duplicate?: boolean; confirmed?: boolean } }>("select record_checkout_payment_evidence($1,$2,$3,$4,$5,'attachment') as result", [org, ids.lead, ids.conversation, ids.message, ids.order])).rows[0].result;
  }
  it("preserves a rejection, deduplicates proof and blocks a new charge while reviewed", async () => {
    const ids = await fixture();
    await db.query("update sales_catalog_orders set payment_status='failed' where id=$1", [ids.order]);
    const first = await evidence(ids), duplicate = await evidence(ids);
    expect(first.review?.id).toBeTruthy(); expect(duplicate.duplicate).toBe(true);
    expect((await db.query("select payment_status,status from sales_catalog_orders where id=$1", [ids.order])).rows[0]).toEqual({ payment_status: "failed", status: "pending_payment" });
    await expect(db.query("select claim_checkout_card_attempt($1,$2,0,110)", [ids.session, ids.attempt])).rejects.toThrow("CHECKOUT_FINANCIAL_REVIEW");
    await expect(db.query("update sales_catalog_orders set total='120' where id=$1", [ids.order])).rejects.toThrow("CHECKOUT_FINANCIAL_REVIEW");
    expect((await db.query("select * from sales_catalog_payment_evidence where message_id=$1", [ids.message])).rows).toHaveLength(1);
  });
  it("a concurrent confirmation wins over an attachment and resolves its review", async () => {
    const ids = await fixture();
    await db.query("select claim_checkout_card_attempt($1,$2,0,110)", [ids.session, ids.attempt]);
    await Promise.all([evidence(ids), db.query("select finish_checkout_card_attempt($1,'approved','pay_fixture','CONFIRMED')", [ids.attempt])]);
    expect((await db.query("select payment_status from sales_catalog_orders where id=$1", [ids.order])).rows[0]).toEqual({ payment_status: "confirmed" });
    expect((await db.query("select id from sales_catalog_payment_reviews where order_id=$1 and status<>'resolved'", [ids.order])).rows).toHaveLength(0);
  });
  it("late Pix confirmation survives an old card rejection and evidence never downgrades it", async () => {
    const ids = await fixture();
    await db.query("select claim_checkout_card_attempt($1,$2,0,110)", [ids.session, ids.attempt]);
    await db.query("select finish_checkout_card_attempt($1,'rejected')", [ids.attempt]);
    await evidence(ids);
    await db.query("update sales_catalog_payment_sessions set provider_payment_id='pay_pix' where id=$1", [ids.session]);
    await db.query("select apply_verified_catalog_payment($1,$2,'approved','RECEIVED','pay_pix')", [ids.session, org]);
    await db.query("select finish_checkout_card_attempt($1,'error')", [ids.attempt]);
    expect((await db.query("select payment_status from sales_catalog_orders where id=$1", [ids.order])).rows[0]).toEqual({ payment_status: "confirmed" });
    expect((await evidence(ids)).review).not.toBeNull(); // Historical evidence keeps its resolved review.
  });
  it("rejects a message from another lead and keeps sensitive gateway fields out of the archive", async () => {
    const ids = await fixture(), other = await fixture();
    await expect(db.query("select record_checkout_payment_evidence($1,$2,$3,$4,$5,'claim')", [org, ids.lead, ids.conversation, other.message, ids.order])).rejects.toThrow("MESSAGE_NOT_FOUND");
    const row = (await db.query<{ snapshot: unknown }>("select snapshot from lead_message_archive where message_id=$1", [ids.message])).rows[0];
    expect(JSON.stringify(row.snapshot)).not.toMatch(/4111111111111111|secret/);
    expect((await db.query("select public from storage.buckets where id='lead-archive'")).rows[0]).toEqual({ public: false });
  });
  it("preserves old and edited text, even after provider deletion and with no agent run", async () => {
    const ids = await fixture();
    await db.query("update conversation_messages set text_content='Endereço corrigido' where id=$1", [ids.message]);
    await db.query("delete from conversation_messages where id=$1", [ids.message]);
    const rows = (await db.query<{ operation: string; snapshot: { text_content: string } }>("select operation,snapshot from lead_message_archive where message_id=$1", [ids.message])).rows;
    expect(rows.some(row => row.snapshot.text_content === "Já paguei")).toBe(true);
    expect(rows.some(row => row.operation === "updated" && row.snapshot.text_content === "Endereço corrigido")).toBe(true);
    expect(rows.some(row => row.operation === "deleted")).toBe(true);
  });
  it("will not resolve unknown payments or let browser roles confirm one", async () => {
    const ids = await fixture();
    await db.query("select claim_checkout_card_attempt($1,$2,0,110)", [ids.session, ids.attempt]);
    await db.query("select finish_checkout_card_attempt($1,'unknown')", [ids.attempt]);
    const item = await evidence(ids);
    await expect(db.query("select resolve_checkout_payment_review($1,$2,$3,'unconfirmed','checked fixture')", [item.review?.id, org, randomUUID()])).rejects.toThrow("PAYMENT_STILL_VERIFYING");
    const permission = await db.query("select has_function_privilege('anon','public.record_checkout_payment_evidence(uuid,uuid,uuid,uuid,uuid,text)','execute') as allowed");
    expect(permission.rows[0]).toEqual({ allowed: false });
  });
  it("claims a human notification once and allows recovery after a recorded failure", async () => {
    const ids = await fixture(), item = await evidence(ids);
    await db.query("update sales_catalog_payment_reviews set notification_payload='{}' where id=$1", [item.review?.id]);
    const claims = await Promise.all([db.query<{ row: unknown }>("select claim_payment_review_notification($1) as row", [item.review?.id]), db.query<{ row: unknown }>("select claim_payment_review_notification($1) as row", [item.review?.id])]);
    expect(claims.filter(result => result.rows[0].row)).toHaveLength(1);
    await db.query("update sales_catalog_payment_reviews set notification_claimed_at=null,notification_status='pending' where id=$1", [item.review?.id]);
    expect((await db.query<{ row: unknown }>("select claim_payment_review_notification($1) as row", [item.review?.id])).rows[0].row).toBeTruthy();
  });
  it("never lets a late generic status or legacy proof overwrite verified receipt", async () => {
    const ids = await fixture();
    await db.query("update sales_catalog_orders set payment_status='confirmed',status='paid' where id=$1", [ids.order]);
    await db.query("update sales_catalog_orders set payment_status='proof_sent',status='needs_human' where id=$1", [ids.order]);
    await db.query("update sales_catalog_orders set payment_status='failed',status='pending_payment' where id=$1", [ids.order]);
    expect((await db.query("select payment_status,status from sales_catalog_orders where id=$1", [ids.order])).rows[0]).toEqual({ payment_status: "confirmed", status: "paid" });
  });
});

async function claim(id = attempt, revision = 0, amount = 110) {
  return (await db.query<{ result: { claimed: boolean; attempt: { id: string; state: string } } }>("select claim_checkout_card_attempt($1,$2,$3,$4) as result", [source, id, revision, amount])).rows[0].result;
}

describe.sequential("self-service delivery transactions", () => {
  const customer = { customer_name: "Maria Exemplo", customer_email: "cliente@example.test", customer_phone: "5548999990000", customer_document: "12345678909", destination_cep: "88330786", destination_address: "Rua Exemplo, número 61, Centro, Cidade Teste" };
  async function fresh() {
    const ids = { order: randomUUID(), session: randomUUID(), lead: randomUUID() };
    await db.query("insert into leads(id,organization_id,metadata) values ($1,$2,$3)", [ids.lead, org, { interest: "keep", lead_memory: { preference: "keep" } }]);
    await db.query("insert into sales_catalog_orders(id,organization_id,lead_id,subtotal,total,discount_total) values ($1,$2,$3,'467.41','457.41','10')", [ids.order, org, ids.lead]);
    await db.query("insert into sales_catalog_payment_sessions(id,organization_id,order_id,provider,status,metadata) values ($1,$2,$3,'asaas','created','{}')", [ids.session, org, ids.order]);
    return ids;
  }
  async function save(session: string, revision = 0) {
    return (await db.query<{ saved: Record<string, unknown> }>("select set_checkout_delivery($1,$2,$3,70,'Frete',$4) as saved", [session, revision, customer, { id: "manual", amount: 70 }])).rows[0].saved;
  }
  it("atomically saves contact, freight, discounted total and lead history", async () => {
    const ids = await fresh();
    expect(await save(ids.session)).toMatchObject({ total: "527.41", shipping_total: "70.00", checkout_revision: 1, destination_cep: customer.destination_cep });
    const lead = (await db.query<{ metadata: Record<string, unknown> }>("select metadata from leads where id=$1", [ids.lead])).rows[0];
    expect(lead.metadata).toMatchObject({ interest: "keep", billing_cep: customer.destination_cep, lead_memory: { preference: "keep", delivery_address: customer.destination_address } });
    expect((await db.query("select payload from intelligence_events where source_id=$1 and event_type='sales_catalog.checkout_delivery_updated'", [ids.order])).rows).toHaveLength(1);
  });
  it("rejects duplicate revisions and a card submission using the previous total", async () => {
    const ids = await fresh();
    const results = await Promise.allSettled([save(ids.session), save(ids.session)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    await expect(db.query("select claim_checkout_card_attempt($1,$2,0,457.41)", [ids.session, randomUUID()])).rejects.toThrow("CHECKOUT_CHANGED");
  });
  it.each(["card_lock", "pix_inflight", "remote_pending", "paid"])("blocks delivery edits for %s", async state => {
    const ids = await fresh();
    if (state === "card_lock") await db.query("update sales_catalog_orders set checkout_payment_lock=$1 where id=$2", [randomUUID(), ids.order]);
    if (state === "pix_inflight") await db.query("update sales_catalog_payment_sessions set metadata='{\"gateway_request_inflight\":true}' where id=$1", [ids.session]);
    if (state === "remote_pending") await db.query("update sales_catalog_payment_sessions set provider_payment_id='pay_fixture',status='pending' where id=$1", [ids.session]);
    if (state === "paid") await db.query("update sales_catalog_orders set payment_status='confirmed' where id=$1", [ids.order]);
    await expect(save(ids.session)).rejects.toThrow(/CHECKOUT_PAYMENT|CHECKOUT_CLOSED/);
    expect((await db.query<{ shipping_total: string | null }>("select shipping_total from sales_catalog_orders where id=$1", [ids.order])).rows[0].shipping_total).toBeNull();
  });
  it("does not update a lead from another tenant", async () => {
    const ids = await fresh();
    const otherOrg = randomUUID();
    await db.query("insert into organizations values ($1)", [otherOrg]);
    await db.query("update leads set organization_id=$1 where id=$2", [otherOrg, ids.lead]);
    await save(ids.session);
    expect((await db.query("select display_name,metadata from leads where id=$1", [ids.lead])).rows[0]).toEqual({ display_name: null, metadata: { interest: "keep", lead_memory: { preference: "keep" } } });
  });
  it("rolls the order back if saving the CRM record fails", async () => {
    const ids = await fresh();
    await db.exec("create function test_fail_lead_update() returns trigger language plpgsql as $$ begin raise exception 'test_crm_failure'; end $$; create trigger test_fail_lead_update before update on leads for each row execute function test_fail_lead_update()");
    try {
      await expect(save(ids.session)).rejects.toThrow("test_crm_failure");
      expect((await db.query("select total,checkout_revision from sales_catalog_orders where id=$1", [ids.order])).rows[0]).toEqual({ total: "457.41", checkout_revision: 0 });
    } finally { await db.exec("drop trigger test_fail_lead_update on leads; drop function test_fail_lead_update()"); }
  });
  it("keeps the delivery mutation private to the backend", async () => {
    const result = await db.query<{ allowed: boolean }>("select has_function_privilege('anon','set_checkout_delivery(uuid,bigint,jsonb,numeric,text,jsonb)','execute') as allowed");
    expect(result.rows[0].allowed).toBe(false);
  });
});

describe.sequential("durable transparent checkout transactions", () => {
  it("rejects a stale amount without creating a payment", async () => {
    await expect(claim(attempt, 0, 100)).rejects.toThrow("CHECKOUT_CHANGED");
    expect((await db.query("select * from sales_catalog_card_attempts where order_id=$1", [order])).rows).toHaveLength(0);
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
    expect((await db.query("select * from intelligence_events where event_type='sales_catalog.card_payment_approved' and source_id=$1", [attempt])).rows).toHaveLength(1);
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

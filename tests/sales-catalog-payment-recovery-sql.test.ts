import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const org = randomUUID();
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create type sales_catalog_order_status as enum ('draft','pending_payment','paid','in_preparation','shipped','delivered','cancelled','needs_human');
    create type sales_catalog_payment_status as enum ('pending','proof_sent','confirmed','failed','refunded');
    create table organizations(id uuid primary key);
    create table leads(id uuid primary key,organization_id uuid,display_name text,phone_number text,metadata jsonb default '{}',updated_at timestamptz);
    create table conversations(id uuid primary key,organization_id uuid,lead_id uuid,metadata jsonb default '{}');
    create table conversation_messages(id uuid primary key,organization_id uuid,lead_id uuid,conversation_id uuid,direction text);
    create table intelligence_memory(id uuid primary key,organization_id uuid,scope text,memory_type text,title text,metadata jsonb default '{}',updated_at timestamptz);
    create table sales_catalog_orders(id uuid primary key,organization_id uuid,lead_id uuid,conversation_id uuid,customer_email text,customer_name text,customer_phone text,customer_document text,source text,status sales_catalog_order_status default 'pending_payment',payment_status sales_catalog_payment_status default 'failed',payment_method text,subtotal text,total text,discount_total text,shipping_total text,shipping_method text,destination_cep text,destination_address text,latest_payment_session_id uuid,metadata jsonb default '{}',updated_at timestamptz,
      commercial_flow_type text default 'client_direct',revenue_owner_type text default 'client',contains_platform_products boolean default false,commission_eligible boolean default false);
    create table sales_catalog_payment_sessions(id uuid primary key,organization_id uuid,order_id uuid,integration_id uuid,provider text,method text,status text,amount numeric,payer_email text,idempotency_key text,external_reference text,metadata jsonb default '{}',payment_owner_type text,commercial_flow_type text,revenue_owner_type text,commission_context jsonb,provider_payment_id text,provider_status text,provider_status_detail text,failure_reason text,paid_at timestamptz,updated_at timestamptz);
    create table sales_catalog_skus(id uuid primary key,organization_id uuid,catalog_item_id uuid,status text,price text,sale_price text,stock_quantity integer,stock_status text,metadata jsonb,updated_at timestamptz);
    create table sales_catalog_order_items(id uuid primary key default gen_random_uuid(),organization_id uuid,order_id uuid,catalog_item_id uuid,sku_id uuid,sku_code text,title text,tag text,quantity integer,unit_price text,sale_price text,total text,attributes jsonb,fulfillment jsonb,metadata jsonb,product_origin_type text,commercial_flow_type text,revenue_owner_type text,commission_eligible boolean,platform_product_id uuid);
    create table intelligence_events(id uuid default gen_random_uuid(),scope text,organization_id uuid,source_type text,source_id uuid,event_type text,title text,summary text,visibility text,tags text[],payload jsonb,occurred_at timestamptz default now());
    create table billing_card_attempts(id uuid primary key);
  `);
  for (const name of ["0076_transparent_checkout_attempts", "0080_payment_evidence_and_reviews", "0132_sales_catalog_order_revisions", "0133_sales_catalog_payment_recovery"]) {
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  }
  await db.query("insert into organizations values($1)", [org]);
}, 30000);
afterAll(async () => { await db?.close(); });

async function fixture(field = "customer_document") {
  const f = { org, order: randomUUID(), lead: randomUUID(), conversation: randomUUID(), source: randomUUID(), session: randomUUID(), revision: 1 };
  await db.query("insert into leads(id,organization_id,display_name,phone_number,metadata) values($1,$2,'Cliente Exemplo','5511999990000',$3)", [f.lead, org, { existing: "preserve", lead_memory: { preference: "preserve" } }]);
  await db.query("insert into conversations(id,organization_id,lead_id) values($1,$2,$3)", [f.conversation, org, f.lead]);
  await db.query("insert into sales_catalog_orders(id,organization_id,lead_id,conversation_id,subtotal,total,discount_total,shipping_total,shipping_method,destination_cep,destination_address,customer_name,customer_email,customer_phone,customer_document,payment_method,latest_payment_session_id,metadata) values($1,$2,$3,$4,'40','43','2','5','Entrega local','01001000','Rua Exemplo, 20','Cliente Exemplo','cliente@example.test','5511999990000','11111111111','Pix',$5,$6)",
    [f.order, org, f.lead, f.conversation, f.session, { preferred_payment_method: "pix", order_confirmation: { confirmed: true }, arbitrary: "preserve" }]);
  await db.query("insert into sales_catalog_order_items(organization_id,order_id,title,quantity,unit_price,total) values($1,$2,'Pizza',1,'40','40')", [org, f.order]);
  await db.query("insert into sales_catalog_payment_sessions(id,organization_id,order_id,provider,method,status,amount,metadata,payment_owner_type,revenue_owner_type) values($1,$2,$3,'asaas','card','created',43,$4,'client','client')", [f.source, org, f.order, { checkout_revision: 1 }]);
  await db.query("insert into sales_catalog_payment_sessions(id,organization_id,order_id,provider,method,status,amount,metadata,payment_owner_type,revenue_owner_type) values($1,$2,$3,'asaas','pix','error',43,$4,'client','client')",
    [f.session, org, f.order, { checkout_revision: 1, gateway_request_inflight: false, payment_recovery: { safe_to_retry: true, stage: "customer_create", category: "validation", field } }]);
  return f;
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function recover(f: Fixture, field = "customer_document", value = "52998224725") {
  return (await db.query<{ result: { order_id: string; checkout_revision: number } }>("select recover_sales_catalog_payment_customer_field($1,$2,$3,$4,$5,$6,$7,$8) as result",
    [f.org, f.order, f.conversation, f.lead, f.session, f.revision, field, value])).rows[0].result;
}
async function start(id: string) { await db.query("select begin_checkout_gateway_request($1)", [id]); }
async function newPix(f: Fixture) {
  const id = randomUUID();
  const order = (await db.query<{ checkout_revision: number }>("select checkout_revision from sales_catalog_orders where id=$1", [f.order])).rows[0];
  await db.query("insert into sales_catalog_payment_sessions(id,organization_id,order_id,provider,method,status,amount,metadata) values($1,$2,$3,'asaas','pix','created',43,$4)", [id, org, f.order, { checkout_revision: order.checkout_revision }]);
  return id;
}
async function finances(f: Fixture) {
  return {
    order: (await db.query("select subtotal,total,discount_total,shipping_total,shipping_method,destination_cep,destination_address,payment_method,payment_status,status,latest_payment_session_id,metadata,commercial_flow_type,revenue_owner_type,contains_platform_products,commission_eligible from sales_catalog_orders where id=$1", [f.order])).rows[0],
    items: (await db.query("select * from sales_catalog_order_items where order_id=$1", [f.order])).rows,
  };
}
async function block(f: Fixture, mode: string) {
  if (["confirmed", "refunded"].includes(mode)) await db.query("update sales_catalog_orders set payment_status=$2::sales_catalog_payment_status where id=$1", [f.order, mode]);
  else if (["cancelled", "paid", "delivered"].includes(mode)) await db.query("update sales_catalog_orders set status=$2::sales_catalog_order_status where id=$1", [f.order, mode]);
  else if (mode === "review" || mode === "lead_review") await db.query("insert into sales_catalog_payment_reviews(organization_id,lead_id,order_id) values($1,$2,$3)", [org, f.lead, mode === "review" ? f.order : null]);
  else if (mode === "inflight") await db.query("update sales_catalog_payment_sessions set metadata=metadata||'{\"gateway_request_inflight\":true}' where id=$1", [f.source]);
  else if (mode === "remote_pix") await db.query("update sales_catalog_payment_sessions set status='pending',provider_payment_id='remote_fixture' where id=$1", [f.source]);
  else if (mode === "verification") await db.query("update sales_catalog_payment_sessions set provider_status_detail='verification_pending' where id=$1", [f.source]);
  else if (mode === "revision") await db.query("insert into sales_catalog_order_revisions(organization_id,order_id,request_id,claim_token,expected_revision,payload,state) values($1,$2,$3,$4,1,'{}','processing')", [org, f.order, randomUUID(), randomUUID()]);
  else if (mode === "lock") await db.query("update sales_catalog_orders set checkout_payment_lock=$2 where id=$1", [f.order, f.source]);
  else await db.query("insert into sales_catalog_card_attempts(id,organization_id,order_id,source_session_id,payment_session_id,revision,amount,state) values($1,$2,$3,$4,$4,1,43,$5)", [randomUUID(), org, f.order, f.source, mode]);
}

describe.sequential("same-order payment customer recovery in SQL", () => {
  it.each([
    ["customer_document", "52998224725", "customer_document"],
    ["customer_name", "Maria Exemplo", "customer_name"],
    ["customer_email", "novo@example.test", "customer_email"],
    ["customer_phone", "5511988880000", "customer_phone"],
  ])("corrects only %s and preserves all commercial data", async (field, value, leadKey) => {
    const f = await fixture(field), before = await finances(f);
    expect(await recover(f, field, value)).toEqual({ order_id: f.order, checkout_revision: 2 });
    expect(await finances(f)).toEqual(before);
    const order = (await db.query<Record<string, unknown>>("select * from sales_catalog_orders where id=$1", [f.order])).rows[0];
    expect(order[field]).toBe(value);
    const lead = (await db.query<{ metadata: Record<string, unknown> }>("select metadata from leads where id=$1", [f.lead])).rows[0];
    expect(lead.metadata).toMatchObject({ existing: "preserve", [leadKey]: value, lead_memory: { preference: "preserve", [leadKey]: value } });
    expect((await db.query("select display_name,phone_number from leads where id=$1", [f.lead])).rows[0]).toEqual({ display_name: "Cliente Exemplo", phone_number: "5511999990000" });
    const session = (await db.query<{ metadata: { payment_recovery: Record<string, unknown> } }>("select metadata from sales_catalog_payment_sessions where id=$1", [f.session])).rows[0];
    expect(session.metadata.payment_recovery).toMatchObject({ safe_to_retry: true, corrected_field: field, checkout_revision: 2 });
    expect(session.metadata.payment_recovery.field).toBeUndefined();
    const events = (await db.query<{ payload: Record<string, unknown> }>("select payload from intelligence_events where source_id=$1", [f.order])).rows;
    expect(events).toHaveLength(1); expect(JSON.stringify(events)).not.toContain(value);
  });
  it.each(["confirmed", "refunded", "cancelled", "paid", "delivered", "unknown", "processing", "pending", "approved", "review", "lead_review", "inflight", "remote_pix", "verification", "revision", "lock"])("blocks correction during %s", async mode => {
    const f = await fixture(); await block(f, mode); const before = await finances(f);
    await expect(recover(f)).rejects.toThrow(/CHECKOUT_(CLOSED|PAYMENT_BUSY|FINANCIAL_REVIEW|REVISION_BUSY)/);
    expect(await finances(f)).toEqual(before);
    expect((await db.query("select customer_document from sales_catalog_orders where id=$1", [f.order])).rows[0]).toEqual({ customer_document: "11111111111" });
  });
  it.each(["org", "order", "conversation", "lead", "session"])("rejects wrong %s scope", async key => {
    const f = await fixture(); await expect(recover({ ...f, [key]: randomUUID() })).rejects.toThrow("CHECKOUT_NOT_FOUND");
  });
  it("refuses another field, address, unverified error and stale revision", async () => {
    const f = await fixture();
    await expect(recover(f, "customer_email", "novo@example.test")).rejects.toThrow("CHECKOUT_RECOVERY_NOT_ALLOWED");
    await expect(recover({ ...f, revision: 0 })).rejects.toThrow("CHECKOUT_CHANGED");
    const address = await fixture("billing_address");
    await expect(recover(address, "billing_address", "Rua Outra, 42")).rejects.toThrow("CHECKOUT_RECOVERY_INVALID_FIELD");
    await db.query("update sales_catalog_payment_sessions set metadata=jsonb_set(metadata,'{payment_recovery,safe_to_retry}','false') where id=$1", [f.session]);
    await expect(recover(f)).rejects.toThrow("CHECKOUT_RECOVERY_NOT_ALLOWED");
  });
  it.each(["", "11111111111", "123", "texto"])("rejects an invalid corrected document: %s", async value => {
    await expect(recover(await fixture(), "customer_document", value)).rejects.toThrow("CHECKOUT_RECOVERY_INVALID_VALUE");
  });
  it("does not consume recovery when the rejected document is repeated", async () => {
    const f = await fixture();
    await db.query("update sales_catalog_orders set customer_document='123.456.789-09' where id=$1", [f.order]);
    await expect(recover(f, "customer_document", "12345678909")).rejects.toThrow("CHECKOUT_RECOVERY_VALUE_UNCHANGED");
    expect((await db.query("select checkout_revision,customer_document from sales_catalog_orders where id=$1", [f.order])).rows[0]).toEqual({ checkout_revision: 1, customer_document: "123.456.789-09" });
    expect((await db.query<{ metadata: Record<string, unknown> }>("select metadata from sales_catalog_payment_sessions where id=$1", [f.session])).rows[0].metadata).toMatchObject({ payment_recovery: { field: "customer_document" } });
  });
  it.each([
    { safe_to_retry: "true", stage: "customer_create", category: "validation", field: "customer_document" },
    { safe_to_retry: true, category: "validation", field: "customer_document" },
    { safe_to_retry: true, stage: "pix_qr_code", category: "validation", field: "customer_document" },
    { safe_to_retry: true, stage: "customer_create", category: "unknown", field: "customer_document" },
  ])("does not trust a malformed/uncertain recovery marker: %j", async recovery => {
    const f = await fixture();
    await db.query("update sales_catalog_payment_sessions set metadata=jsonb_set(metadata,'{payment_recovery}',$2) where id=$1", [f.session, recovery]);
    await expect(recover(f)).rejects.toThrow("CHECKOUT_RECOVERY_NOT_ALLOWED");
  });
  it("consumes a correction once and makes old card revisions stale", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([recover(f), recover(f)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    await expect(db.query("select claim_checkout_card_attempt($1,$2,1,43)", [f.source, randomUUID()])).rejects.toThrow("CHECKOUT_CHANGED");
    await expect(start(f.source)).rejects.toThrow("CHECKOUT_CHANGED");
    // A delayed error cannot remove supersession or restore the consumed field.
    await db.query("update sales_catalog_payment_sessions set metadata=$2 where id=$1", [f.session, { gateway_request_inflight: true, payment_recovery: { safe_to_retry: true, category: "validation", stage: "customer_create", field: "customer_document" } }]);
    await expect(start(f.session)).rejects.toThrow("CHECKOUT_CHANGED");
    const session = (await db.query<{ metadata: { payment_recovery: Record<string, unknown> } }>("select metadata from sales_catalog_payment_sessions where id=$1", [f.session])).rows[0];
    expect(session.metadata.payment_recovery.field).toBeUndefined();
    expect((await db.query<{ metadata: Record<string, unknown> }>("select metadata from sales_catalog_payment_sessions where id=$1", [f.session])).rows[0].metadata.gateway_request_inflight).toBe(false);
    // The original card page may still confirm a fresh attempt using current data.
    const attempt = (await db.query<{ result: { claimed: boolean } }>("select claim_checkout_card_attempt($1,$2,2,43) as result", [f.source, randomUUID()])).rows[0];
    expect(attempt.result.claimed).toBe(true);
  });
  it("a payment starting first prevents the customer correction", async () => {
    const f = await fixture();
    await db.query("select claim_checkout_card_attempt($1,$2,1,43)", [f.source, randomUUID()]);
    await expect(recover(f)).rejects.toThrow("CHECKOUT_PAYMENT_BUSY");
  });
  it("keeps a late confirmation and blocks correction without downgrading payment", async () => {
    const f = await fixture();
    await db.query("update sales_catalog_payment_sessions set provider_payment_id='confirmed_fixture' where id=$1", [f.source]);
    await db.query("select apply_verified_catalog_payment($1,$2,'approved','RECEIVED','confirmed_fixture')", [f.source, org]);
    await expect(recover(f)).rejects.toThrow("CHECKOUT_CLOSED");
    expect((await db.query("select payment_status,latest_payment_session_id from sales_catalog_orders where id=$1", [f.order])).rows[0]).toEqual({ payment_status: "confirmed", latest_payment_session_id: f.source });
  });
  it("lets a fresh Pix start on the same failed order after correction", async () => {
    const f = await fixture(); await recover(f); const pix = await newPix(f);
    await start(pix);
    expect((await db.query<{ metadata: Record<string, unknown> }>("select metadata from sales_catalog_payment_sessions where id=$1", [pix])).rows[0].metadata).toMatchObject({ gateway_request_inflight: true, checkout_revision: 2 });
  });
  async function legacy(f: Fixture) {
    await db.query("update sales_catalog_payment_sessions set provider_status='gateway_error',failure_reason=$2,metadata=$3 where id=$1", [f.session,
      "O CPF/CNPJ informado é inválido.", { gateway_error: "O CPF/CNPJ informado é inválido.", gateway_request_inflight: true }]);
  }
  it("promotes only the explicitly corrected legacy validation failure", async () => {
    const f = await fixture(), untouched = await fixture(); await legacy(f); await legacy(untouched);
    await expect(start(await newPix(f))).rejects.toThrow("CHECKOUT_PAYMENT_BUSY");
    await recover(f);
    const saved = (await db.query<{ metadata: Record<string, unknown> }>("select metadata from sales_catalog_payment_sessions where id=$1", [f.session])).rows[0];
    expect(saved.metadata).toMatchObject({ gateway_request_inflight: false, payment_recovery: { safe_to_retry: true, category: "validation", corrected_field: "customer_document" } });
    expect((await db.query<{ metadata: Record<string, unknown> }>("select metadata from sales_catalog_payment_sessions where id=$1", [untouched.session])).rows[0].metadata.gateway_request_inflight).toBe(true);
    await start(await newPix(f));
  });
  it.each(["different_error", "one_message_only", "marker_null", "marker_false", "remote_id", "other_inflight", "review", "unknown"])("does not promote legacy with %s", async mode => {
    const f = await fixture(); await legacy(f);
    if (mode === "different_error") await db.query("update sales_catalog_payment_sessions set failure_reason='invalid CPF' where id=$1", [f.session]);
    else if (mode === "one_message_only") await db.query("update sales_catalog_payment_sessions set metadata=metadata-'gateway_error' where id=$1", [f.session]);
    else if (mode === "marker_null") await db.query("update sales_catalog_payment_sessions set metadata=metadata||'{\"payment_recovery\":null}' where id=$1", [f.session]);
    else if (mode === "marker_false") await db.query("update sales_catalog_payment_sessions set metadata=metadata||'{\"payment_recovery\":{\"safe_to_retry\":false}}' where id=$1", [f.session]);
    else if (mode === "remote_id") await db.query("update sales_catalog_payment_sessions set provider_payment_id='remote_fixture' where id=$1", [f.session]);
    else await block(f, mode === "other_inflight" ? "inflight" : mode);
    await expect(recover(f)).rejects.toThrow(/CHECKOUT_(PAYMENT_BUSY|FINANCIAL_REVIEW|RECOVERY_NOT_ALLOWED)/);
    expect((await db.query<{ metadata: Record<string, unknown> }>("select metadata from sales_catalog_payment_sessions where id=$1", [f.session])).rows[0].metadata.gateway_request_inflight).toBe(true);
  });
});

describe.sequential("atomic Pix dispatch guard", () => {
  it.each(["confirmed", "refunded", "cancelled", "paid", "unknown", "processing", "pending", "approved", "review", "lead_review", "inflight", "remote_pix", "verification", "revision", "lock"])("rechecks %s after session insertion", async mode => {
    const f = await fixture(), pix = await newPix(f); await block(f, mode);
    await expect(start(pix)).rejects.toThrow(/CHECKOUT_(CLOSED|PAYMENT_BUSY|FINANCIAL_REVIEW|REVISION_BUSY)/);
  });
  it("prevents a second Pix when its competitor completed before the claim", async () => {
    const f = await fixture(), first = await newPix(f), second = await newPix(f);
    await start(first);
    await expect(start(second)).rejects.toThrow("CHECKOUT_PAYMENT_BUSY");
    await db.query("update sales_catalog_payment_sessions set status='pending',provider_payment_id='pix_ready',metadata=metadata||'{\"gateway_request_inflight\":false}' where id=$1", [first]);
    await expect(start(second)).rejects.toThrow("CHECKOUT_PAYMENT_BUSY");
    await expect(start(first)).rejects.toThrow("CHECKOUT_PAYMENT_BUSY");
  });
  it("allows a retry after definitive rejection, without changing the previous attempt", async () => {
    const f = await fixture(), attempt = randomUUID();
    await db.query("select claim_checkout_card_attempt($1,$2,1,43)", [f.source, attempt]);
    await db.query("select finish_checkout_card_attempt($1,'rejected')", [attempt]);
    await start(await newPix(f));
    expect((await db.query("select state from sales_catalog_card_attempts where id=$1", [attempt])).rows[0]).toEqual({ state: "rejected" });
  });
  it("validates amount/revision and preserves the existing cart-supersession guard", async () => {
    const f = await fixture();
    await db.query("update sales_catalog_payment_sessions set amount=42 where id=$1", [f.session]);
    await expect(start(f.session)).rejects.toThrow("CHECKOUT_CHANGED");
    await db.query("update sales_catalog_payment_sessions set amount=43,metadata=metadata||'{\"checkout_revision\":0}' where id=$1", [f.session]);
    await expect(start(f.session)).rejects.toThrow("CHECKOUT_CHANGED");
    await db.query("update sales_catalog_payment_sessions set metadata=metadata||'{\"checkout_revision\":\"invalid\"}' where id=$1", [f.session]);
    await expect(start(f.session)).rejects.toThrow("CHECKOUT_CHANGED");
    await db.query("update sales_catalog_payment_sessions set metadata=metadata||'{\"checkout_revision\":1,\"order_revision_superseded_by_request_id\":\"old_cart\"}' where id=$1", [f.session]);
    await expect(start(f.session)).rejects.toThrow("CHECKOUT_CHANGED");
  });
  it("restricts both mutations to server-side service_role", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const signature of ["begin_checkout_gateway_request(uuid)", "recover_sales_catalog_payment_customer_field(uuid,uuid,uuid,uuid,uuid,bigint,text,text)"]) {
        expect((await db.query("select has_function_privilege($1,$2,'execute') as allowed", [role, signature])).rows[0]).toEqual({ allowed: false });
      }
    }
    expect((await db.query("select has_function_privilege('service_role','recover_sales_catalog_payment_customer_field(uuid,uuid,uuid,uuid,uuid,bigint,text,text)','execute') as allowed")).rows[0]).toEqual({ allowed: true });
  });
});

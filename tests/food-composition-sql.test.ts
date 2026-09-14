import { quoteFoodComposition, foodSnapshotForUnit } from "@/lib/sales-catalog/food-composition";
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
  await db.exec(readFileSync("supabase/migrations/0140_revision_delivery_snapshot.sql", "utf8").split("-- Customer, freight")[0]);
  await db.exec(readFileSync("supabase/migrations/0142_food_composition.sql", "utf8"));
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
async function begin(f: Awaited<ReturnType<typeof fixture>>, p = payload(), scope: { org: string; lead: string; conversation: string | null } = { org, lead: f.lead, conversation: f.conversation }) {
  return (await db.query<{ result: { claimed?: boolean; needs_retirement?: boolean; replay?: boolean; order?: SavedOrder } }>("select begin_sales_catalog_order_revision($1,$2,$3,$4,$5,$6,$7,$8) as result",
    [f.order, scope.org, scope.lead, scope.conversation, f.revision, f.request, f.token, p])).rows[0].result;
}
async function finish(f: Awaited<ReturnType<typeof fixture>>) {
  return (await db.query<{ result: SavedOrder }>("select finish_sales_catalog_order_revision($1,$2,$3,$4) as result", [f.order, org, f.request, f.token])).rows[0].result;
}
async function rows(f: Awaited<ReturnType<typeof fixture>>) { return (await db.query("select title,quantity,total from sales_catalog_order_items where order_id=$1 order by title", [f.order])).rows; }


const foodPolicy = () => ({ enabled:true, pricing:"weighted",localOnly:true,
  sizes:[{id:"large",name:"Grande",active:true,price:"50",portions:4,maxFlavors:2}],
  flavors:[{id:"a",name:"Queijo",active:true,prices:{large:"60"},incompatibleWith:[]},{id:"b",name:"Frango",active:true,prices:{large:"80"},incompatibleWith:[]}],
  groups:[{id:"extra",name:"Adicional",min:0,max:2,scope:"portion",options:[{id:"bacon",name:"Bacon",active:true,price:"10",maxQuantity:2}]}]
});
const foodUnit = () => ({sizeId:"large",flavors:[{flavorId:"a",portions:2},{flavorId:"b",portions:2}],options:[] as Array<{groupId:string;optionId:string;quantity:number;flavorId?:string}>,note:"Sem cebola"});
async function foodFixture() {
  await db.query("update intelligence_memory set metadata=$2 where id=$1",[pizza,{price:"40"}]);
  const f=await fixture(), p=foodPolicy(), unit=foodUnit();
  await db.query("update intelligence_memory set metadata=$2 where id=$1",[pizza,{price:"40",food_composition:p}]);
  const snapshot=quoteFoodComposition(p,[unit],1)!;
  const row={...item(pizza,1,70),metadata:{food_composition:snapshot}};
  await db.query("update sales_catalog_order_items set unit_price='70',total='70',metadata=$2 where order_id=$1",[f.order,row.metadata]);
  await db.query("update sales_catalog_orders set subtotal='70',total='73' where id=$1",[f.order]);
  f.revision=(await db.query<{checkout_revision:number}>("select checkout_revision from sales_catalog_orders where id=$1",[f.order])).rows[0].checkout_revision;
  return {f,p,unit,row};
}
describe.sequential("food commerce database authority",()=>{
  it("recalculates weighted, highest and fixed combos identically to the application",async()=>{
    for(const pricing of ["weighted","highest","fixed"]){
      const p={...foodPolicy(),pricing}, unit=foodUnit();
      unit.options=[{groupId:"extra",optionId:"bacon",quantity:2,flavorId:"a"}];
      expect((await db.query<{n:number}>("select food_unit_cents($1,$2)::float8 n",[p,unit])).rows[0].n).toBe(quoteFoodComposition(p,[unit],1)!.totalCents);
    }
  });
  it("rounds fractional cents once per extra and once per weighted base",async()=>{
    for(let portions=2;portions<=12;portions++){
      const p=foodPolicy();p.sizes[0].portions=portions;p.flavors[0].prices.large="60.01";p.groups[0].options[0].price="0.01";
      const unit=foodUnit();unit.flavors=[{flavorId:"a",portions:1},{flavorId:"b",portions:portions-1}];unit.options=[{groupId:"extra",optionId:"bacon",quantity:1,flavorId:"b"}];
      expect((await db.query<{n:number}>("select food_unit_cents($1,$2)::float8 n",[p,unit])).rows[0].n).toBe(quoteFoodComposition(p,[unit],1)!.totalCents);
    }
  });
  it("refuses inactive flavors, wrong fractions, duplicate and untargeted extras",async()=>{
    const p=foodPolicy(),u=foodUnit();
    const invalid=[{...u,flavors:[{flavorId:"a",portions:1}]},{...u,options:[{groupId:"extra",optionId:"bacon",quantity:1}]},{...u,options:Array(2).fill({groupId:"extra",optionId:"bacon",quantity:2,flavorId:"a"})}];
    for(const unit of invalid)await expect(db.query("select food_unit_cents($1,$2)",[p,unit])).rejects.toThrow("CHECKOUT_");
    p.flavors[0].active=false;await expect(db.query("select food_unit_cents($1,$2)",[p,u])).rejects.toThrow("CHECKOUT_");
  });
  it("rejects forged totals and missing montage on inserts and new gateway requests",async()=>{
    const {f,p}=await foodFixture();
    await expect(db.query("update sales_catalog_order_items set total='1' where order_id=$1",[f.order])).rejects.toThrow("CHECKOUT_FOOD_CHANGED");
    await expect(db.query("update sales_catalog_order_items set metadata='{}' where order_id=$1",[f.order])).rejects.toThrow("CHECKOUT_INVALID_FOOD");
    p.flavors[0].prices.large="61";await db.query("update intelligence_memory set metadata=jsonb_build_object('food_composition',$2::jsonb) where id=$1",[pizza,p]);
    await expect(db.query("insert into sales_catalog_payment_sessions(id,organization_id,order_id,provider,status,amount) values($1,$2,$3,'asaas','created',73)",[randomUUID(),org,f.order])).rejects.toThrow("CHECKOUT_FOOD_CHANGED");
    await expect(db.query("update sales_catalog_payment_sessions set metadata='{\"gateway_request_inflight\":true}' where id=$1",[f.session])).rejects.toThrow("CHECKOUT_FOOD_CHANGED");
    // A real existing-payment result remains reconcilable after catalog changes.
    await db.query("update sales_catalog_payment_sessions set status='approved',metadata='{\"gateway_request_inflight\":false}' where id=$1",[f.session]);
  });
  it("keeps two independently priced units and notes through an atomic revision and replay",async()=>{
    const {f,p,unit}=await foodFixture();const second={...unit,flavors:[{flavorId:"a",portions:4}],note:"Sem orégano"};
    const snapshot=quoteFoodComposition(p,[unit,second],2)!;
    const next=snapshot.units.map((u,index)=>({...item(pizza,1,u.totalCents/100),metadata:{food_composition:foodSnapshotForUnit(snapshot,index),food_unit_index:index}}));
    await begin(f,payload(next));const saved=await finish(f);expect(saved.total).toBe("133");
    const items=(await db.query<{metadata:{food_composition:{units:Array<{note:string}>}}}>("select metadata from sales_catalog_order_items where order_id=$1 order by total desc",[f.order])).rows;
    expect(items.map(row=>row.metadata.food_composition.units[0].note).sort()).toEqual(["Sem cebola","Sem orégano"]);
    expect((await begin(f,payload(next))).replay).toBe(true);
  });
  it("checks policy again after the revision claim before replacing rows",async()=>{
    const {f,p,row}=await foodFixture();await begin(f,payload([row]));p.flavors[0].active=false;
    await db.query("update intelligence_memory set metadata=jsonb_build_object('food_composition',$2::jsonb) where id=$1",[pizza,p]);
    await expect(finish(f)).rejects.toThrow("CHECKOUT_INVALID_FOOD_FLAVOR");
    expect(await rows(f)).toHaveLength(1);
  });
  it("keeps the price RPCs inaccessible to public roles",async()=>{
    const result=await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.assert_food_order_row(uuid,jsonb)','execute') allowed");expect(result.rows[0].allowed).toBe(false);
  });
  it("allows a scoped bearer checkout without a conversation, while preserving the strict conversation API",async()=>{
    const {f,row}=await foodFixture();
    await db.query("update sales_catalog_orders set conversation_id=null where id=$1",[f.order]);
    await expect(begin(f,payload([row]),{org,lead:f.lead,conversation:null})).rejects.toThrow("CHECKOUT_NOT_FOUND");
    const args=[f.order,org,f.lead,null,f.revision,f.request,f.token,payload([row]),randomUUID()];
    await expect(db.query("select begin_sales_catalog_checkout_revision($1,$2,$3,$4,$5,$6,$7,$8,$9)",args)).rejects.toThrow("CHECKOUT_NOT_FOUND");
    args[8]=f.session;
    const result=await db.query<{r:{claimed:boolean}}>("select begin_sales_catalog_checkout_revision($1,$2,$3,$4,$5,$6,$7,$8,$9) r",args);
    expect(result.rows[0].r.claimed).toBe(true);expect((await finish(f)).total).toBe("73");
  });
  it("does not turn legacy null food metadata into a montage requirement",async()=>{
    const {f}=await foodFixture();
    await db.query("update intelligence_memory set metadata='{\"price\":\"40\"}' where id=$1",[pizza]);
    await db.query("update sales_catalog_order_items set unit_price='40',total='40',metadata='{\"food_composition\":null}' where order_id=$1",[f.order]);
    expect(await rows(f)).toHaveLength(1);
  });
});

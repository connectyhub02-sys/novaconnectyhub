import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commercialDb } from "./helpers/commercial-db";

let db: PGlite;
const migration = readFileSync("supabase/migrations/0210_campaign_card_renewal_authorization.sql", "utf8");
beforeAll(async () => { db = await commercialDb(); await db.exec(migration); }, 45000);
afterAll(async () => { await db?.close(); });
const start = "2026-09-14T13:33:55.000Z", end = "2026-10-14T13:33:55.000Z";

async function fixture(cardState = "approved") {
  const f = { org: randomUUID(), user: randomUUID(), sub: randomUUID(), plan: randomUUID(),
    invoice: randomUUID(), payment: randomUUID(), campaign: randomUUID(), attempt: randomUUID(), card: randomUUID() };
  await db.query("insert into auth.users(id) values($1)", [f.user]);
  await db.query("insert into organizations(id,owner_id,plan_code,status) values($1,$2,$3,'active')", [f.org,f.user,f.plan]);
  await db.query("insert into billing_plans(id,plan_code,name,monthly_price_brl,included_credits) values($1::uuid,$1::text,'Plan',100,1000)", [f.plan]);
  await db.query("insert into organization_subscriptions(id,organization_id,plan_id,plan_code,status,billing_provider,current_period_end,metadata) values($1,$2,$3::uuid,$3::text,'active','asaas',$4,$5)",
    [f.sub,f.org,f.plan,start,{ commercial_terms: { billing_cycle: "recurring", billing_interval: "month", price_brl: 100 } }]);
  await db.query("insert into billing_invoices(id,organization_id,subscription_id,status,total_brl) values($1,$2,$3,'open',100)", [f.invoice,f.org,f.sub]);
  await db.query("insert into billing_invoice_items(invoice_id,organization_id,item_type,total_brl) values($1,$2,'plan',100)", [f.invoice,f.org]);
  await db.query("insert into billing_payments(id,organization_id,subscription_id,invoice_id,status,provider,amount_brl,payload) values($1,$2,$3,$4,'pending','asaas',100,$5)",
    [f.payment,f.org,f.sub,f.invoice,{ payment_id:f.payment, source:"dashboard_plan_renewal", target_plan_code:f.plan, checkout_kind:"renewal",
      commercial_terms:{billing_cycle:"recurring",billing_interval:"month",price_brl:100,included_credits:1000} }]);
  const cfg = { name:"Intro",status:"active",startsAt:"2020-01-01",endsAt:"2099-01-01",targetIds:[f.plan],originIds:[],audience:"all",buyerIds:[],operations:["renewal"],
    options:[{id:"month",interval:"month",price:100,permanentDiscount:0}],stages:[{cycles:1,kind:"percent",value:90}],maxUses:1 };
  await db.query("insert into commercial_campaigns(id,owner_type,configuration) values($1,'platform',$2)", [f.campaign,cfg]);
  const agreement = (await db.query<{id:string}>("select reserve_commercial_agreement($1,1,$2,$3,$4,null,$5,'month',$6,null,'renewal',true,false,$5) id", [f.campaign,f.org,f.user,f.user,f.plan,f.sub])).rows[0].id;
  await db.query("select apply_platform_campaign_period($1,$2,0)", [agreement,f.payment]);
  const revision = (await db.query<{checkout_revision:number}>("select checkout_revision from billing_payments where id=$1",[f.payment])).rows[0].checkout_revision;
  await db.query("select claim_native_billing_card($1,$2,$3,$4,10,100,$5)", [f.org,f.payment,f.attempt,revision,`billing_card:${f.attempt}`]);
  await db.query("insert into billing_asaas_card_vault(id,organization_id,subscription_id,activation_attempt_id,customer_id,token_encrypted,consent_version) values($1,$2,$3,$4,'fixture','not-a-real-token','connectyhub-advance-3-2-1-v1')",[f.card,f.org,f.sub,f.attempt]);
  await db.query("select finish_native_billing_card($1,$2,$3,$4)",[f.attempt,cardState,`pay_${f.payment}`,cardState==='approved'?'CONFIRMED':'REFUSED']);
  return {...f,agreement};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fulfill(f:Fixture) {
  return db.query("select fulfill_confirmed_billing_payment($1,$2,$3,$4,'{}')",[f.payment,f.plan,start,end]);
}
async function metadata(f:Fixture) {
  return (await db.query<{metadata:Record<string,unknown>}>("select metadata from organization_subscriptions where id=$1",[f.sub])).rows[0].metadata;
}
async function repair(f:Fixture) {
  return (await db.query<{ok:boolean}>("select authorize_paid_campaign_card_renewal($1) ok",[f.payment])).rows[0].ok;
}
async function restoreLegacy(f:Fixture, extra:Record<string,unknown> = {}) {
  await db.query("update organization_subscriptions set metadata=(select payload from billing_payments where id=$2)||$3::jsonb where id=$1",[f.sub,f.payment,extra]);
}
async function renewal(f:Fixture) {
  return (await db.query<{r:{payment_id:string}}>("select prepare_contract_renewal($1,$2,$2,'2026-11-14T13:33:55Z','asaas','{}') r",[f.sub,end])).rows[0].r.payment_id;
}
async function claim(f:Fixture, payment:string, at="2026-10-11T12:00:00Z") {
  return (await db.query<{r:{claimed:boolean,attempt:{id:string}}|null}>("select claim_managed_asaas_renewal($1,$2,$3,$4,$5,$6) r",[f.sub,payment,randomUUID(),f.card,end,at])).rows[0].r;
}

describe("paid promotional card authorization survives into the next renewal", () => {
  it("fulfills the paid offer, releases only its temporary hold and claims the full-price renewal once",async()=>{
    const f=await fixture(); await fulfill(f);
    expect((await metadata(f)).auto_charge_disabled).toBeUndefined();
    expect((await metadata(f)).campaign_requires_authorization).toBeUndefined();
    const payment=await renewal(f);
    expect((await db.query<{amount:string}>("select amount_brl amount from billing_payments where id=$1",[payment])).rows[0].amount).toMatch(/^100(?:\.0+)?$/);
    expect((await claim(f,payment))?.claimed).toBe(true);
    expect(await claim(f,payment)).toBeNull();
    expect(await claim(f,payment,"2026-10-12T12:00:00Z")).toBeNull();
    await fulfill(f); expect(await repair(f)).toBe(false);
    expect((await db.query<{n:number}>("select count(*)::int n from test_credit_grants where organization_id=$1",[f.org])).rows[0].n).toBe(1);
    expect((await db.query<{n:number}>("select count(*)::int n from commercial_events where event_key=$1",[`card-renewal-authorized:${f.payment}`])).rows[0].n).toBe(1);
  });
  it("repairs an existing fulfilled promotion with a replaced card without changing money, period or overdue state",async()=>{
    const f=await fixture(); await fulfill(f); await restoreLegacy(f);
    await db.query("update billing_asaas_card_vault set status='inactive' where id=$1",[f.card]);
    const attempt=randomUUID();
    await db.query("insert into billing_card_attempts(id,organization_id,subscription_id,invoice_id,payment_id,amount,recurring_amount,external_reference,state) values($1::uuid,$2,$3,$4,$5,10,100,$1::text,'approved')",[attempt,f.org,f.sub,f.invoice,f.payment]);
    await db.query("insert into billing_asaas_card_vault(organization_id,subscription_id,activation_attempt_id,customer_id,token_encrypted,consent_version,status) values($1,$2,$3,'fixture','not-real','connectyhub-advance-3-2-1-v1','active')",[f.org,f.sub,attempt]);
    await db.query("update organization_subscriptions set status='past_due' where id=$1",[f.sub]);
    const before=await db.query("select status,current_period_start,current_period_end,included_credits_granted from organization_subscriptions where id=$1",[f.sub]);
    expect(await repair(f)).toBe(true); expect(await repair(f)).toBe(false);
    expect((await db.query("select status,current_period_start,current_period_end,included_credits_granted from organization_subscriptions where id=$1",[f.sub])).rows).toEqual(before.rows);
    expect(await claim(f,await renewal(f),"2026-10-23T12:00:00Z")).toBeNull();
  });
  it.each(['rejected','unknown','pending'])("does not authorize a %s card attempt",async state=>{
    const f=await fixture(state); expect(await repair(f)).toBe(false);
    await expect(fulfill(f)).rejects.toThrow('BILLING_PAYMENT_NOT_CONFIRMED');
  });
  it("does not turn Pix settlement after a refused card into recurring card consent",async()=>{
    const f=await fixture('rejected');
    await db.query("update billing_payments set status='approved',payload=payload||'{\"payment_method\":\"pix\"}' where id=$1",[f.payment]);
    await fulfill(f);
    expect((await metadata(f)).auto_charge_disabled).toBe(true); expect(await repair(f)).toBe(false);
  });
  it.each(['admin_custom_contract_activation','admin_catalog_plan_change'])("preserves %s opt-out even with historical campaign flags",async source=>{
    const f=await fixture(); await fulfill(f); await restoreLegacy(f,{source});
    expect(await repair(f)).toBe(false);
    expect(await claim(f,await renewal(f))).toBeNull();
  });
  it("preserves a later explicit opt-out and rejects expired/on-due-day automatic attempts",async()=>{
    const f=await fixture(); await fulfill(f); const payment=await renewal(f);
    expect(await claim(f,payment,'2026-10-14T12:00:00Z')).toBeNull();
    expect(await claim(f,payment,'2026-10-15T12:00:00Z')).toBeNull();
    await db.query("update organization_subscriptions set metadata=metadata||'{\"auto_charge_disabled\":true}' where id=$1",[f.sub]);
    expect(await repair(f)).toBe(false); expect(await claim(f,payment)).toBeNull();
  });
  it("requires current ownership, live consent and the exact fulfilled payment",async()=>{
    const f=await fixture(); await fulfill(f); await restoreLegacy(f);
    await db.query("update billing_asaas_card_vault set status='inactive' where id=$1",[f.card]);
    expect(await repair(f)).toBe(false);
    await db.query("update billing_asaas_card_vault set status='active' where id=$1",[f.card]);
    await restoreLegacy(f,{payment_id:randomUUID()}); expect(await repair(f)).toBe(false);
    await restoreLegacy(f); await db.query("update commercial_agreements set cancel_at_period_end=true where id=$1",[f.agreement]);
    expect(await repair(f)).toBe(false);
  });
  it("denies browser execution of authorization and trigger functions",async()=>{
    for(const role of ['anon','authenticated']) for(const fn of ['authorize_paid_campaign_card_renewal(uuid)','authorize_fulfilled_campaign_card_renewal()']) {
      expect((await db.query<{ok:boolean}>("select has_function_privilege($1,$2,'execute') ok",[role,fn])).rows[0].ok).toBe(false);
    }
  });
});

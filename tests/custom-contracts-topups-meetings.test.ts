import {beforeAll,afterAll,it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import type {PGlite} from "@electric-sql/pglite";
import {commercialDb} from "./helpers/commercial-db";
let db:PGlite;const admin=randomUUID();
beforeAll(async()=>{
 db=await commercialDb();await db.exec(`alter table profiles add column is_platform_admin boolean default false;
 alter table platform_products add column price text,add column short_description text,add column commercial_description text,add column offer jsonb default '{}',add column metadata jsonb default '{}';
 alter table credit_wallets add column reserved_credits numeric default 0;
 insert into auth.users(id) values('${admin}');insert into profiles(id,is_platform_admin) values('${admin}',true);`);
 const money=readFileSync("supabase/migrations/0076_transparent_checkout_attempts.sql","utf8");await db.exec(money.slice(money.indexOf("create or replace function public.checkout_money"),money.indexOf("create or replace function public.guard_checkout_order_revision")));
 for(const name of ["0107_custom_contracts","0108_wallet_alert_episodes","0109_custom_software_meetings","0110_automatic_credit_topups","0112_custom_meeting_reminders"])await db.exec(readFileSync(`supabase/migrations/${name}.sql`,"utf8"));
},60000);
afterAll(async()=>{await db?.close();});
async function account(){const user=randomUUID(),org=randomUUID(),sub=randomUUID();await db.query("insert into auth.users(id) values($1)",[user]);await db.query("insert into organizations(id,owner_id,name,plan_code,status) values($1,$2,'Cliente','pro','active')",[org,user]);
 const plan=(await db.query<{id:string}>("insert into billing_plans(plan_code,name,monthly_price_brl,included_credits,billing_cycle,billing_interval) values($1,'Plano',247,1000,'recurring','month') returning id",[randomUUID()])).rows[0].id;
 await db.query("insert into organization_subscriptions(id,organization_id,plan_id,plan_code,status,current_period_start,current_period_end,billing_provider,metadata) values($1,$2,$3,'pro','active',now()-interval '1 day',now()+interval '29 days','asaas',$4)",[sub,org,plan,JSON.stringify({commercial_terms:{billing_cycle:"recurring",billing_interval:"month",price_brl:247,included_credits:1000}})]);
 await db.query("insert into credit_wallets(organization_id,balance_credits) values($1,100)",[org]);return {org,user,sub,plan};}
async function custom(org:string,price:number,credits:number){const terms={name:"Contrato individual",base_plan_code:"pro",monthly_price_brl:price,included_credits:credits,effective_at:new Date(Date.now()-1000).toISOString(),first_period_end:new Date(Date.now()+30*86400000).toISOString(),resource_limits:{agent_limit:3},features:{connectyhub_api:true}};return (await db.query<{r:Record<string,unknown>}>("select save_custom_contract($1,$2,$3) r",[org,admin,JSON.stringify(terms)])).rows[0].r;}
async function invoice(a:Awaited<ReturnType<typeof account>>){const inv=randomUUID(),pay=randomUUID();await db.query("insert into billing_invoices(id,organization_id,subscription_id,status,subtotal_brl,total_brl,metadata) values($1,$2,$3,'open',247,247,'{}')",[inv,a.org,a.sub]);await db.query("insert into billing_invoice_items(invoice_id,organization_id,item_type,total_brl) values($1,$2,'plan',247)",[inv,a.org]);
 await db.query("insert into billing_payments(id,organization_id,subscription_id,invoice_id,status,provider,amount_brl,payload) values($1,$2,$3,$4,'pending','asaas',247,$5)",[pay,a.org,a.sub,inv,JSON.stringify({checkout_kind:"initial",target_plan_code:"pro",cycle_start_at:new Date().toISOString(),commercial_terms:{billing_cycle:"recurring",billing_interval:"month",price_brl:247,included_credits:1000}})]);return {inv,pay};}
it("keeps per-account prices and issued snapshots; a new version grants nothing",async()=>{const a=await account(),b=await account();await custom(a.org,380,12000);await custom(b.org,690,18000);const x=await invoice(a),y=await invoice(b);
 const before=await db.query<{id:string;amount_brl:string;payload:Record<string,unknown>}>("select id,amount_brl,payload from billing_payments where id in ($1,$2) order by amount_brl",[x.pay,y.pay]);expect(before.rows.map(r=>Number(r.amount_brl))).toEqual([380,690]);
 await custom(a.org,420,14000);const old=(await db.query<{payload:unknown;amount_brl:string}>("select payload,amount_brl from billing_payments where id=$1",[x.pay])).rows[0];expect(Number(old.amount_brl)).toBe(380);expect((old.payload as {commercial_terms:{included_credits:number}}).commercial_terms.included_credits).toBe(12000);
 expect((await db.query("select * from test_credit_grants where organization_id=$1",[a.org])).rows).toHaveLength(0);
 await expect(db.query("update billing_payments set payload=jsonb_set(payload,'{commercial_terms,price_brl}','1') where id=$1",[x.pay])).rejects.toThrow("CUSTOM_CONTRACT_TERMS_IMMUTABLE");
});
it("activates paid custom terms once and quotes the next version without changing current access",async()=>{
 const a=await account();await db.query("insert into billing_plans(plan_code,name,monthly_price_brl,included_credits) values('pro','Pro',247,1000) on conflict do nothing");await custom(a.org,380,12000);const x=await invoice(a);
 const pay=(await db.query<{payload:{cycle_start_at:string;cycle_end_at:string}}>("select payload from billing_payments where id=$1",[x.pay])).rows[0];
 await expect(db.query("select fulfill_confirmed_billing_payment($1,'pro',$2,$3,'{}')",[x.pay,pay.payload.cycle_start_at,pay.payload.cycle_end_at])).rejects.toThrow("BILLING_PAYMENT_NOT_CONFIRMED");
 await db.query("update billing_payments set status='approved',paid_at=now() where id=$1",[x.pay]);
 for(let n=0;n<2;n++)await db.query("select fulfill_confirmed_billing_payment($1,'pro',$2,$3,'{}')",[x.pay,pay.payload.cycle_start_at,pay.payload.cycle_end_at]);
 expect((await db.query<{amount:string}>("select amount from test_credit_grants where organization_id=$1",[a.org])).rows.map(r=>Number(r.amount))).toEqual([12000]);
 await custom(a.org,420,14000);
 const end=pay.payload.cycle_end_at,nextEnd=new Date(Date.parse(end)+32*86400000).toISOString();
 const renewal=(await db.query<{r:{payment_id:string}}>("select prepare_contract_renewal($1,$2,$2,$3,'asaas','{}') r",[a.sub,end,nextEnd])).rows[0].r;
 expect(Number((await db.query<{amount_brl:string}>("select amount_brl from billing_payments where id=$1",[renewal.payment_id])).rows[0].amount_brl)).toBe(420);
 expect((await db.query<{metadata:{commercial_terms:{price_brl:number;included_credits:number}}}>("select metadata from organization_subscriptions where id=$1",[a.sub])).rows[0].metadata.commercial_terms).toMatchObject({price_brl:380,included_credits:12000});
});
it("quotes a manually activated legacy account with no saved price using its negotiated terms",async()=>{
 const a=await account();await db.query("update organization_subscriptions set metadata='{}',billing_provider='admin_manual' where id=$1",[a.sub]);await custom(a.org,550,0);
 const result=(await db.query<{r:{payment_id:string}}>("select prepare_contract_renewal(id,current_period_end,current_period_end,current_period_end+interval '1 month','asaas','{}') r from organization_subscriptions where id=$1",[a.sub])).rows[0].r;
 expect(Number((await db.query<{amount_brl:string}>("select amount_brl from billing_payments where id=$1",[result.payment_id])).rows[0].amount_brl)).toBe(550);
});
it("reads existing BRL packs and their credit descriptions without requiring invented metadata",async()=>{
 const id=randomUUID();await db.query("insert into platform_products(id,name,price,short_description,offer) values($1,'Pacote Resposta Rápida','R$ 47,00','Recarga de 5 mil créditos','{\"sale_price\":\"R$ 47,00\"}')",[id]);
 expect((await db.query<{credits:string;price:string}>("select platform_product_credit_amount(p) credits,checkout_money(p.offer->>'sale_price') price from platform_products p where id=$1",[id])).rows[0]).toEqual({credits:"5000",price:"47.00"});
});
it("allows one reservation per real meeting slot and makes repeat confirmation idempotent",async()=>{const a=await account();const leads=[randomUUID(),randomUUID()];for(const lead of leads){await db.query("insert into leads(id,organization_id) values($1,$2)",[lead,a.org]);await db.query("insert into custom_software_requests(organization_id,lead_id) values($1,$2)",[a.org,lead]);}
 const slot=(await db.query<{id:string}>("select add_custom_software_slot($1,now()+interval '2 days',now()+interval '2 days 1 hour',null) id",[admin])).rows[0].id;
 await db.query("update custom_software_requests set offered_slots=array[$1::uuid] where lead_id=any($2::uuid[])",[slot,leads]);
 await db.query("select book_custom_software_meeting($1,$2)",[leads[0],slot]);const repeat=(await db.query<{r:{reused:boolean}}>("select book_custom_software_meeting($1,$2) r",[leads[0],slot])).rows[0].r;expect(repeat.reused).toBe(true);
 await expect(db.query("select book_custom_software_meeting($1,$2)",[leads[1],slot])).rejects.toThrow("SLOT_UNAVAILABLE");expect((await db.query("select * from intelligence_events where event_type='lead.custom_software_meeting_booked' and source_id=$1",[leads[0]])).rows).toHaveLength(1);
 const notices=(await db.query<{id:string;hours_before:number}>("select id,hours_before from custom_software_meeting_notices where slot_id=$1 order by hours_before",[slot])).rows;
 expect(notices.map(n=>n.hours_before)).toEqual([1,24]);
 await db.query("update custom_software_meeting_notices set due_at=now()-interval '1 minute' where id=$1",[notices[1].id]);
 expect((await db.query<{r:{id:string}}>("select claim_custom_meeting_notice() r")).rows[0].r.id).toBe(notices[1].id);
 expect((await db.query<{r:unknown}>("select claim_custom_meeting_notice() r")).rows[0].r).toBeNull();
 await db.query("update custom_software_meeting_notices set state='dispatching',updated_at=now()-interval '15 minutes' where id=$1",[notices[1].id]);
 await db.query("select claim_custom_meeting_notice()");
 expect((await db.query<{state:string}>("select state from custom_software_meeting_notices where id=$1",[notices[1].id])).rows[0].state).toBe("uncertain");
 await db.query("select cancel_custom_software_slot($1,$2)",[admin,slot]);
 expect((await db.query<{state:string}>("select state from custom_software_meeting_notices where id=$1",[notices[0].id])).rows[0].state).toBe("cancelled");
});
it("rearms a zero-franchise account after recharge without duplicate threshold notices",async()=>{const a=await account();await db.query("update organization_subscriptions set metadata=jsonb_set(metadata,'{commercial_terms,included_credits}','0') where id=$1",[a.sub]);await db.query("update credit_wallets set balance_credits=1000 where organization_id=$1",[a.org]);await db.query("update credit_wallets set balance_credits=90 where organization_id=$1",[a.org]);
 const claim=async()=>(await db.query<{r:{episode:string;level:number;reference_credits:number}|null}>("select claim_wallet_alert($1) r",[a.org])).rows[0].r;
 const one=(await claim())!;expect(one.level).toBe(10);await db.query("select finish_wallet_alert($1,$2,$3)",[a.org,one.episode,one.level]);expect(await claim()).toBeNull();
 await db.query("update credit_wallets set balance_credits=1000 where organization_id=$1",[a.org]);await db.query("update credit_wallets set balance_credits=0 where organization_id=$1",[a.org]);expect(await claim()).toMatchObject({deferred:true});await db.query("update wallet_alert_state set last_notice_at=now()-interval '20 minutes' where organization_id=$1",[a.org]);const two=(await claim())!;expect(two.level).toBe(0);expect(two.episode).not.toBe(one.episode);
});
it("claims an authorized one-off topup once, enforces its cap and never changes the plan",async()=>{const a=await account(),pack=randomUUID(),card=randomUUID(),activation=randomUUID();const initial=await invoice(a);await db.query("select claim_native_billing_card($1,$2,$3,0,247,247,'test_activation')",[a.org,initial.pay,activation]);await db.query("insert into platform_products(id,name,billing_cycle,billing_interval,price,metadata) values($1,'Pacote','one_time','month',47,'{\"credit_amount\":5000}')",[pack]);await db.query("insert into billing_asaas_card_vault(id,organization_id,subscription_id,activation_attempt_id,customer_id,token_encrypted,consent_version,status) values($1,$2,$3,$4,'customer','encrypted','connectyhub-advance-3-2-1-v1','active')",[card,a.org,a.sub,activation]);
 const policy={enabled:true,product_id:pack,card_method_id:card,threshold_credits:200,amount_brl:47,credits:5000,monthly_cap_brl:47,consent_version:"credit_topup_v1"};
 await expect(db.query("select save_credit_topup_policy($1,$2,$3)",[a.org,admin,JSON.stringify(policy)])).rejects.toThrow("TOPUP_OWNER_REQUIRED");
 await db.query("select save_credit_topup_policy($1,$2,$3)",[a.org,a.user,JSON.stringify(policy)]);
 const first=(await db.query<{r:{claimed:boolean;attempt:{id:string;recurring_amount:number;payment_id:string}}}>("select claim_credit_topup($1) r",[a.org])).rows[0].r;expect(first.claimed).toBe(true);expect(Number(first.attempt.recurring_amount)).toBe(0);expect((await db.query<{r:unknown}>("select claim_credit_topup($1) r",[a.org])).rows[0].r).toBeNull();
 await db.query("update billing_card_attempts set state='approved' where id=$1",[first.attempt.id]);await db.query("update credit_topup_runs set created_at=now()-interval '2 hours' where organization_id=$1",[a.org]);expect((await db.query<{r:unknown}>("select claim_credit_topup($1) r",[a.org])).rows[0].r).toBeNull();
 expect((await db.query<{n:string}>("select count(*) n from test_credit_grants where organization_id=$1",[a.org])).rows[0].n).toBe(0); // claim/state alone is not confirmed fulfillment
 await db.query("insert into billing_plans(plan_code,name,monthly_price_brl,included_credits) values('pro','Pro',247,1000) on conflict do nothing");
 await db.query("update billing_payments set status='approved',paid_at=now() where id=$1",[first.attempt.payment_id]);
 for(let n=0;n<2;n++) await db.query("select fulfill_confirmed_billing_payment(id,payload->>'target_plan_code',(payload->>'cycle_start_at')::timestamptz,(payload->>'cycle_end_at')::timestamptz,'{}') from billing_payments where id=$1",[first.attempt.payment_id]);
 expect((await db.query<{amount:string}>("select amount from test_credit_grants where organization_id=$1",[a.org])).rows.map(r=>Number(r.amount))).toEqual([5000]);
 const s=(await db.query<{plan_code:string;metadata:{commercial_terms:{price_brl:number}}}>("select plan_code,metadata from organization_subscriptions where id=$1",[a.sub])).rows[0];expect(s.plan_code).toBe("pro");expect(s.metadata.commercial_terms.price_brl).toBe(247);
});

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());
    create table profiles(id uuid primary key,full_name text,phone_normalized text,phone_verified_at timestamptz);
    create table organizations(id uuid primary key default gen_random_uuid(),owner_id uuid,name text,plan_code text,status text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table organization_members(id uuid primary key default gen_random_uuid(),organization_id uuid,user_id uuid,created_at timestamptz default now());
    create table billing_plans(id uuid primary key default gen_random_uuid(),plan_code text unique,name text,status text default 'draft',monthly_price_brl numeric,included_credits numeric);
    create table organization_subscriptions(id uuid primary key default gen_random_uuid(),organization_id uuid,plan_id uuid,plan_code text,status text,
      provider_subscription_id text,payer_email text,billing_provider text,current_period_start timestamptz,current_period_end timestamptz,next_billing_at timestamptz,included_credits_granted numeric,
      metadata jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
    create unique index idx_organization_subscriptions_active on organization_subscriptions(organization_id) where status in ('pending','active','past_due','incomplete');
    create table billing_cycles(id uuid primary key default gen_random_uuid(),organization_id uuid,subscription_id uuid,plan_id uuid,cycle_start timestamptz,cycle_end timestamptz,included_credits numeric,status text,metadata jsonb default '{}');
    create table billing_invoices(id uuid primary key default gen_random_uuid(),organization_id uuid,subscription_id uuid,status text,subtotal_brl numeric,discount_brl numeric,total_brl numeric,provider text,paid_at timestamptz,provider_payment_id text,metadata jsonb default '{}',updated_at timestamptz default now());
    create table billing_payments(id uuid primary key default gen_random_uuid(),organization_id uuid,subscription_id uuid,invoice_id uuid,status text,amount_brl numeric,provider text,provider_payment_id text,provider_status text,paid_at timestamptz,payload jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
    create table billing_invoice_items(id uuid primary key default gen_random_uuid(),invoice_id uuid,organization_id uuid,item_type text,description text,quantity numeric,unit_price_brl numeric,total_brl numeric,credit_amount numeric,metadata jsonb default '{}');
    create table sales_catalog_card_attempts(id uuid primary key,state text,effects_completed_state text,effects_claimed_at timestamptz);
    create table intelligence_events(id uuid primary key default gen_random_uuid(),scope text,organization_id uuid,source_type text,source_id uuid,event_type text,title text,summary text,visibility text,tags text[],payload jsonb);
    create table platform_billing_settings(setting_key text primary key,metadata jsonb default '{}',billing_whatsapp_agent_id uuid);
    create table platform_products(id uuid primary key default gen_random_uuid(),name text,billing_cycle text,billing_interval text,status text default 'active',owner_type text default 'connectyhub',sales_channel_type text default 'direct');
    create table sales_catalog_orders(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,customer_email text,payment_status text);
    create table sales_catalog_order_items(id uuid primary key default gen_random_uuid(),order_id uuid,organization_id uuid,platform_product_id uuid,title text,revenue_owner_type text,metadata jsonb default '{}');
    create table sales_catalog_payment_sessions(id uuid primary key default gen_random_uuid(),order_id uuid,status text,created_at timestamptz default now());
    create table leads(id uuid primary key default gen_random_uuid(),organization_id uuid,channel text,phone_number text,display_name text,source text,updated_at timestamptz default now());
    create unique index lead_phone on leads(organization_id,channel,phone_number) where phone_number is not null;
    create table whatsapp_instances(id uuid primary key default gen_random_uuid(),organization_id uuid,metadata jsonb default '{}',updated_at timestamptz default now());
    create table conversations(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,whatsapp_instance_id uuid,provider text,provider_chat_id text,updated_at timestamptz default now());
    create unique index conversation_chat on conversations(organization_id,whatsapp_instance_id,provider,provider_chat_id) where provider_chat_id is not null and whatsapp_instance_id is not null;
    create table conversation_messages(id uuid primary key default gen_random_uuid(),organization_id uuid,conversation_id uuid,lead_id uuid,whatsapp_instance_id uuid,provider text,provider_message_id text,provider_chat_id text,direction text,message_type text,text_content text,occurred_at timestamptz,payload jsonb);
    create unique index conversation_message_provider on conversation_messages(provider,provider_message_id) where provider_message_id is not null;
    create table billing_notification_events(id uuid primary key default gen_random_uuid(),organization_id uuid,subscription_id uuid,payment_id uuid,event_type text,status text,selected_agent_id uuid,recipient_phone text,message_preview text,provider_message_id text,attempts int default 0,next_attempt_at timestamptz,sent_at timestamptz,error_message text,metadata jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
    create table sales_catalog_payment_reviews(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,status text default 'open',notification_payload jsonb);
    create table trial_conversion_messages(organization_id uuid,status text);
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean);
    create type credit_transaction_type as enum ('grant','purchase','refund','expiration','usage');
    create table credit_wallets(id uuid primary key default gen_random_uuid(),organization_id uuid unique,balance_credits numeric default 0,metadata jsonb default '{}',updated_at timestamptz default now());
    create table credit_transactions(id uuid primary key default gen_random_uuid(),organization_id uuid,wallet_id uuid,transaction_type credit_transaction_type,amount_credits numeric,balance_after_credits numeric,external_reference text,description text,metadata jsonb,created_by uuid);
    create function ensure_credit_wallet(uuid) returns uuid language plpgsql as $$declare k uuid;begin insert into credit_wallets(organization_id) values($1) on conflict(organization_id) do update set organization_id=$1 returning id into k;return k;end $$;
    create table test_credit_grants(id uuid primary key default gen_random_uuid(),organization_id uuid,amount numeric,reference text);
    create function grant_credit_wallet(uuid,numeric,text,text,jsonb,credit_transaction_type) returns uuid language plpgsql as $$declare result uuid; begin insert into test_credit_grants(organization_id,amount,reference) values($1,$2,$4) returning id into result; return result; end $$;
    create function grant_billing_plan_credits(uuid,text,timestamptz,timestamptz,text) returns uuid language sql as $$select gen_random_uuid()$$;
    create function expire_connectyhub_trial_credits(timestamptz,integer) returns table(organization_id uuid,wallet_id uuid,trial_cycle_id uuid,expired_balance_credits numeric) language sql as $$select null::uuid,null::uuid,null::uuid,0::numeric where false$$;
    create function lead_archive_safe_json(jsonb) returns jsonb language sql as $$select $1$$;
    alter table sales_catalog_orders enable row level security;
    grant select on sales_catalog_orders to authenticated;
    create policy old_member_policy on sales_catalog_orders for select to authenticated using (true);
  `);
  const refund = readFileSync("supabase/migrations/0052_platform_billing_refunds.sql", "utf8");
  await db.exec(refund.slice(refund.indexOf("create or replace function public.reverse_credit_wallet_for_refund(")));
  await db.exec(readFileSync("supabase/migrations/0078_ecosystem_native_billing.sql", "utf8"));
  for (const file of ["0082_platform_commercial_terms", "0083_contract_access", "0084_platform_product_library", "0085_platform_customer_journey", "0086_atomic_billing_fulfillment", "0087_operational_access_guards", "0088_billing_notice_delivery", "0089_recurring_invoice_items", "0090_product_purchase_contracts", "0091_financial_review_and_rpc_boundary", "0092_contract_reconciliation"]) {
    await db.exec(readFileSync(`supabase/migrations/${file}.sql`, "utf8"));
  }
}, 30000);
afterAll(async () => { await db?.close(); });

async function fixture(cycle = "recurring") {
  const f = { user: randomUUID(), org: randomUUID(), sub: randomUUID(), plan: randomUUID(), invoice: randomUUID(), payment: randomUUID(), product: randomUUID() };
  await db.query<Record<string, unknown>>("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [f.user, `${f.user}@example.test`]);
  await db.query<Record<string, unknown>>("insert into organizations(id,owner_id,plan_code,status) values($1,$2,$3,'active')", [f.org,f.user,f.plan]);
  await db.query<Record<string, unknown>>("insert into organization_members(organization_id,user_id) values($1,$2)", [f.org,f.user]);
  await db.query<Record<string, unknown>>("insert into billing_plans(id,plan_code,name,monthly_price_brl,included_credits) values($1,$2,'Plano',100,50)", [f.plan,f.plan]);
  await db.query<Record<string, unknown>>("insert into organization_subscriptions(id,organization_id,plan_id,plan_code,status,current_period_start,current_period_end,metadata) values($1,$2,$3,$4,'active','2026-08-02T18:57:00Z','2026-09-02T18:57:00Z',$5)", [f.sub,f.org,f.plan,f.plan,{ commercial_terms: { billing_cycle: cycle, billing_interval: "month", price_brl: 100, included_credits: 50 }}]);
  await db.query<Record<string, unknown>>("insert into billing_invoices(id,organization_id,subscription_id,status,total_brl) values($1,$2,$3,'open',120)", [f.invoice,f.org,f.sub]);
  await db.query<Record<string, unknown>>("insert into billing_payments(id,organization_id,subscription_id,invoice_id,status,amount_brl,provider,payload) values($1,$2,$3,$4,'pending',120,'asaas',$5)", [f.payment,f.org,f.sub,f.invoice,{ target_plan_code: f.plan, commercial_terms: { billing_cycle: cycle, billing_interval: "month", included_credits: 50 }, cycle_end_at: "2026-10-02T18:57:00Z" }]);
  await db.query<Record<string, unknown>>("insert into platform_products(id,name,billing_cycle,billing_interval) values($1,'Curso','one_time','month')", [f.product]);
  await db.query<Record<string, unknown>>("insert into billing_invoice_items(invoice_id,organization_id,item_type,description,unit_price_brl,total_brl,credit_amount,metadata) values($1,$2,'adjustment','Curso',20,20,0,$3)", [f.invoice,f.org,{ platform_product_id: f.product, recurrence: "one_time" }]);
  return f;
}
async function access(org: string, at: string) {
  return (await db.query<{ a: { allowed: boolean; reason: string; blocked_at: string } }>("select resolve_organization_contract_access($1,$2) a", [org,at])).rows[0].a;
}
describe.sequential("contratos, direitos por item e memória financeira", () => {
  it("bloqueia exatamente em 72 horas e abrange ativação manual", async () => {
    const f = await fixture();
    expect((await access(f.org,"2026-09-05T18:56:59Z")).allowed).toBe(true);
    expect((await access(f.org,"2026-09-05T18:57:00Z")).allowed).toBe(false);
    await db.query<Record<string, unknown>>("update organization_subscriptions set billing_provider='admin_manual' where id=$1", [f.sub]);
    expect((await access(f.org,"2026-09-05T18:57:00Z")).reason).toBe("paid_expired");
  });
  it("encerra período avulso e recorrência cancelada sem carência artificial", async () => {
    const f = await fixture("one_time");
    expect((await access(f.org,"2026-09-02T18:57:00Z")).allowed).toBe(false);
    const recurring = await fixture();
    await db.query<Record<string, unknown>>("update organization_subscriptions set status='canceled' where id=$1",[recurring.sub]);
    expect((await access(recurring.org,"2026-09-01T18:57:00Z")).allowed).toBe(true);
    expect((await access(recurring.org,"2026-09-02T18:57:00Z")).allowed).toBe(false);
  });
  it("aprovação aplica créditos e avulso uma vez; bloqueio com leitura antiga perde a corrida", async () => {
    const f = await fixture();
    await expect(db.query<Record<string, unknown>>("select fulfill_confirmed_billing_payment($1,$2,'2026-09-02','2026-10-02','{}')", [f.payment,f.plan])).rejects.toThrow("BILLING_PAYMENT_NOT_CONFIRMED");
    await db.query<Record<string, unknown>>("update billing_payments set status='approved' where id=$1", [f.payment]);
    const fulfill = () => db.query<Record<string, unknown>>("select fulfill_confirmed_billing_payment($1,$2,'2026-09-02T18:57Z','2026-10-02T18:57Z','{}')", [f.payment,f.plan]);
    await Promise.all([fulfill(),fulfill()]);
    expect((await db.query<Record<string, unknown>>("select * from test_credit_grants where organization_id=$1",[f.org])).rows).toHaveLength(1);
    expect((await db.query<Record<string, unknown>>("select * from platform_product_entitlements where buyer_user_id=$1",[f.user])).rows).toHaveLength(1);
    expect((await db.query<Record<string, unknown>>("select suspend_expired_platform_contract($1,'2026-09-02T18:57Z','2026-09-06') expired",[f.sub])).rows[0]).toEqual({ expired: false });
    await db.query<Record<string, unknown>>("update billing_payments set status='rejected' where id=$1",[f.payment]);
    expect((await db.query<Record<string, unknown>>("select status from billing_payments where id=$1",[f.payment])).rows[0]).toEqual({ status: "approved" });
    await db.query<Record<string, unknown>>("update billing_payments set status='refunded' where id=$1",[f.payment]);
    expect((await db.query<Record<string, unknown>>("select state from platform_product_entitlements where buyer_user_id=$1",[f.user])).rows[0]).toEqual({ state: "revoked" });
  });
  it("não libera suspensão administrativa com pagamento", async () => {
    const f = await fixture();
    await db.query<Record<string, unknown>>("update organizations set status='blocked' where id=$1",[f.org]);
    await db.query<Record<string, unknown>>("update billing_payments set status='approved' where id=$1",[f.payment]);
    await db.query<Record<string, unknown>>("select fulfill_confirmed_billing_payment($1,$2,'2026-09-02','2026-10-02','{}')",[f.payment,f.plan]);
    expect((await access(f.org,"2026-09-06")).allowed).toBe(false);
  });
  it("isola contratos e impede filho de estender o prazo", async () => {
    const f = await fixture(), other = await fixture(), child = randomUUID();
    await expect(db.query<Record<string, unknown>>("update organizations set billing_organization_id=$1 where id=$2",[f.org,other.org])).rejects.toThrow("INVALID_BILLING_ORGANIZATION_SCOPE");
    await db.query<Record<string, unknown>>("insert into organizations(id,owner_id,plan_code,status,billing_organization_id) values($1,$2,'trial','active',$3)",[child,f.user,f.org]);
    expect((await access(child,"2026-09-06")).allowed).toBe(false);
  });
  it("deduplica a entrega do aviso e cancela lembrete de ciclo antigo", async () => {
    const f = await fixture(), notice = randomUUID();
    await db.query<Record<string, unknown>>("insert into billing_notification_events(id,organization_id,subscription_id,status,event_type,metadata) values($1,$2,$3,'pending','paid_plan_expired',$4)",[notice,f.org,f.sub,{ current_period_end: "2026-09-02T18:57Z" }]);
    expect((await db.query<Record<string, unknown>>("select claim_billing_notice($1) claimed",[notice])).rows[0]).toEqual({ claimed: true });
    expect((await db.query<Record<string, unknown>>("select claim_billing_notice($1) claimed",[notice])).rows[0]).toEqual({ claimed: false });
    await db.query<Record<string, unknown>>("update billing_notification_events set delivery_claimed_at=null where id=$1",[notice]);
    await db.query<Record<string, unknown>>("update organization_subscriptions set current_period_end='2026-10-02' where id=$1",[f.sub]);
    expect((await db.query<Record<string, unknown>>("select claim_billing_notice($1) claimed",[notice])).rows[0]).toEqual({ claimed: false });
    expect((await db.query<Record<string, unknown>>("select status from billing_notification_events where id=$1",[notice])).rows[0]).toEqual({ status: "skipped" });
  });
  it("compra avulsa usa o mesmo recebimento sem reativar plano nem incluir mensalidade", async () => {
    const f = await fixture();
    await db.query<Record<string, unknown>>("update organizations set status='past_due' where id=$1",[f.org]);
    const create = () => db.query<{ sub: string }>("select create_product_purchase_intent($1,$2,$3,20,$4) sub",[f.org,f.user,f.product,{ billing_cycle: "one_time", billing_interval: "month", price_brl: 20 }]);
    const [first, second] = await Promise.all([create(),create()]);
    expect(first.rows[0].sub).toBe(second.rows[0].sub);
    const sub = first.rows[0].sub;
    const p = (await db.query<{ id: string }>("select id from billing_payments where subscription_id=$1",[sub])).rows[0];
    await db.query<Record<string, unknown>>("update billing_payments set status='approved' where id=$1",[p.id]);
    await db.query<Record<string, unknown>>("select fulfill_confirmed_billing_payment($1,$2,'2026-09-06','2026-10-06','{}')",[p.id,'product_'+f.product]);
    expect((await db.query<Record<string, unknown>>("select status from organizations where id=$1",[f.org])).rows[0]).toEqual({ status: "past_due" });
    expect((await db.query<Record<string, unknown>>("select next_billing_at from organization_subscriptions where id=$1",[sub])).rows[0]).toEqual({ next_billing_at: null });
    expect((await db.query<Record<string, unknown>>("select billing_cycle,ends_at,state from platform_product_entitlements where payment_id=$1",[p.id])).rows[0]).toEqual({ billing_cycle: "one_time", ends_at: null, state: "active" });
  });
  it("nega chamadas diretas de concessão financeira ao navegador", async () => {
    expect((await db.query<Record<string, unknown>>("select has_function_privilege('authenticated','fulfill_confirmed_billing_payment(uuid,text,timestamptz,timestamptz,jsonb)','execute') granted")).rows[0]).toEqual({ granted: false });
    expect((await db.query<Record<string, unknown>>("select has_function_privilege('authenticated','grant_credit_wallet(uuid,numeric,text,text,jsonb,credit_transaction_type)','execute') granted")).rows[0]).toEqual({ granted: false });
  });
  it("cria uma única renovação e retira avulsos dos próximos períodos",async()=>{
    const f=await fixture();
    await db.query<Record<string, unknown>>("update organization_subscriptions set metadata=metadata||$2 where id=$1",[f.sub,{selected_bumps:[{code:"a",title:"Avulso",price_brl:20,recurrence:"one_time"},{code:f.product,title:"Recorrente",platform_product_id:f.product,price_brl:10,recurrence:"monthly"}]}]);
    const call=()=>db.query<{r:{invoice_id:string;payment_id:string}}>("select prepare_contract_renewal($1,'2026-09-02T18:57Z','2026-09-06','2026-10-06','asaas','{}') r",[f.sub]);
    const [a,b]=await Promise.all([call(),call()]);expect(a.rows[0].r.payment_id).toBe(b.rows[0].r.payment_id);
    const payment=(await db.query<Record<string, unknown>>("select amount_brl,payload->'selected_bumps' bumps from billing_payments where id=$1",[a.rows[0].r.payment_id])).rows[0];
    expect(Number(payment.amount_brl)).toBe(110);expect(payment.bumps).toHaveLength(1);
    expect((await db.query<Record<string, unknown>>("select count(*)::int n from billing_invoice_items where invoice_id=$1",[a.rows[0].r.invoice_id])).rows[0].n).toBe(2);
  });
  it("não gera dívida nem invoice seguinte para plano avulso",async()=>{
    const f=await fixture("one_time");
    await expect(db.query<Record<string, unknown>>("select prepare_contract_renewal($1,'2026-09-02T18:57Z','2026-09-06','2026-10-06','asaas','{}')",[f.sub])).rejects.toThrow("BILLING_CYCLE_CHANGED");
  });
  it("entrega incerta exige conferência sem disparar novamente",async()=>{
    const f=await fixture(),id=randomUUID();
    await db.query<Record<string, unknown>>("insert into billing_notification_events(id,organization_id,status,event_type,delivery_claimed_at) values($1,$2,'pending','payment_pending',now()-interval '11 minutes')",[id,f.org]);
    await db.query<Record<string, unknown>>("select recover_abandoned_billing_notices()");
    expect((await db.query<Record<string, unknown>>("select delivery_uncertain,status from billing_notification_events where id=$1",[id])).rows[0]).toEqual({delivery_uncertain:true,status:"failed"});
    expect((await db.query<Record<string, unknown>>("select claim_billing_notice($1) ok",[id])).rows[0].ok).toBe(false);
  });
  it("JWT antigo não lê pedidos operacionais depois do prazo",async()=>{
    const f=await fixture();
    await db.query<Record<string, unknown>>("select set_config('test.uid',$1,false)",[f.user]);
    await db.query<Record<string, unknown>>("insert into sales_catalog_orders(id,organization_id) values($1,$2)",[randomUUID(),f.org]);
    await db.exec("set role authenticated");
    try {expect((await db.query<Record<string, unknown>>("select count(*)::int n from sales_catalog_orders where organization_id=$1",[f.org])).rows[0].n).toBe(0);}
    finally {await db.exec("reset role");}
  });
  it("pagamento antigo e aviso pendente não desfazem a confirmação",async()=>{
    const f=await fixture();await db.query<Record<string, unknown>>("update billing_payments set status='approved' where id=$1",[f.payment]);
    await db.query<Record<string, unknown>>("select fulfill_confirmed_billing_payment($1,$2,'2026-09-06','2026-10-06','{}')",[f.payment,f.plan]);
    await db.query<Record<string, unknown>>("update billing_payments set status='rejected' where id=$1",[f.payment]);
    expect((await db.query<Record<string, unknown>>("select status from billing_payments where id=$1",[f.payment])).rows[0].status).toBe("approved");
    await db.query<Record<string, unknown>>("update billing_invoices set status='open' where id=$1",[f.invoice]);
    expect((await db.query<Record<string, unknown>>("select status from billing_invoices where id=$1",[f.invoice])).rows[0].status).toBe("paid");
  });

  it("arquiva o aviso real e vincula somente o telefone verificado", async () => {
    const f=await fixture(), agent=randomUUID(), inst=randomUUID(), notice=randomUUID();
    await db.query("insert into profiles(id,full_name,phone_normalized,phone_verified_at) values($1,'Cliente','5500000000000',now())",[f.user]);
    await db.query("insert into whatsapp_instances(id,organization_id,metadata) values($1,$2,$3)",[inst,f.org,{agent_id:agent,admin_whatsapp:true}]);
    await db.query("insert into platform_billing_settings(setting_key,billing_whatsapp_agent_id) values('default',$1) on conflict(setting_key) do update set billing_whatsapp_agent_id=excluded.billing_whatsapp_agent_id",[agent]);
    await db.query("insert into billing_notification_events(id,organization_id,subscription_id,status,event_type,recipient_phone,selected_agent_id,message_preview) values($1,$2,$3,'sent','payment_rejected','5500000000000',$4,'Pagamento não confirmado')",[notice,f.org,f.sub,agent]);
    await db.query("select archive_platform_customer_journey(500)");
    await db.query("select archive_platform_customer_journey(500)");
    expect((await db.query("select id from conversation_messages where text_content='Pagamento não confirmado'")).rows).toHaveLength(1);
    expect((await db.query("select lead_id from platform_customer_identities where user_id=$1",[f.user])).rows).toHaveLength(1);
  });
  it("expira somente o bônus e preserva os créditos comprados durante o teste", async () => {
    const f=await fixture(), trial=randomUUID();
    await db.query("insert into billing_plans(id,plan_code,name,included_credits) values($1,'trial','Teste',100) on conflict(plan_code) do nothing",[trial]);
    await db.query("update organizations set plan_code='trial',status='trial' where id=$1",[f.org]);
    await db.query("insert into billing_cycles(organization_id,plan_id,cycle_start,cycle_end,included_credits,status) select $1,id,'2026-08-01','2026-08-08',100,'open' from billing_plans where plan_code='trial'",[f.org]);
    await db.query("insert into credit_wallets(organization_id,balance_credits) values($1,150)",[f.org]);
    await db.query("insert into credit_transactions(organization_id,transaction_type,amount_credits) values($1,'purchase',50)",[f.org]);
    await db.query("select * from expire_connectyhub_trial_credits('2026-09-06',100)");
    await db.query("select * from expire_connectyhub_trial_credits('2026-09-06',100)");
    expect((await db.query<{balance_credits:string}>("select balance_credits from credit_wallets where organization_id=$1",[f.org])).rows[0].balance_credits).toBe('50');
  });

});

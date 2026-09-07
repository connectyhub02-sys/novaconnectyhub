import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
export async function commercialDb() {
  const db = new PGlite();
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
  const refund = readFileSync(
    "supabase/migrations/0052_platform_billing_refunds.sql",
    "utf8",
  );
  await db.exec(
    refund.slice(
      refund.indexOf(
        "create or replace function public.reverse_credit_wallet_for_refund(",
      ),
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/0078_ecosystem_native_billing.sql",
      "utf8",
    ),
  );
  for (const file of [
    "0082_platform_commercial_terms",
    "0083_contract_access",
    "0084_platform_product_library",
    "0085_platform_customer_journey",
    "0086_atomic_billing_fulfillment",
    "0087_operational_access_guards",
    "0088_billing_notice_delivery",
    "0089_recurring_invoice_items",
    "0090_product_purchase_contracts",
    "0091_financial_review_and_rpc_boundary",
    "0092_contract_reconciliation",
    "0094_plan_purchase_discounts",
  ]) {
    await db.exec(readFileSync(`supabase/migrations/${file}.sql`, "utf8"));
  }

  const managed = readFileSync(
    "supabase/migrations/0093_managed_asaas_renewals.sql",
    "utf8",
  );
  await db.exec(
    managed.slice(0, managed.indexOf("-- Preserve financial history")),
  );
  await db.exec(`
    alter table billing_invoices add column currency text default 'BRL', add column due_at timestamptz;
    alter table sales_catalog_orders add column conversation_id uuid, add column source text, add column status text default 'pending_payment', add column customer_name text, add column customer_phone text, add column customer_document text, add column destination_cep text, add column destination_address text, add column subtotal text, add column discount_total text, add column shipping_total text, add column total text, add column shipping_method text, add column payment_method text, add column metadata jsonb default '{}', add column checkout_revision bigint default 0, add column checkout_payment_lock uuid, add column created_at timestamptz default now(), add column updated_at timestamptz default now();
    alter table sales_catalog_order_items add column catalog_item_id uuid, add column quantity int default 1, add column unit_price text, add column sale_price text, add column total text, add column tag text, add column attributes jsonb default '[]', add column fulfillment jsonb default '{}', add column sku_id uuid, add column sku_code text;
    alter table sales_catalog_card_attempts add column order_id uuid;
    alter table sales_catalog_payment_sessions add column organization_id uuid, add column metadata jsonb default '{}', add column provider_payment_id text;
    create table content_pipeline_items(id uuid primary key default gen_random_uuid(),scope text,organization_id uuid,status text,body text,scheduled_for timestamptz,metadata jsonb default '{}');
    create function checkout_money(text) returns numeric language sql immutable as $$select coalesce(nullif($1,''),'0')::numeric$$;
  `);
  for (const file of [
    "0095_commercial_campaigns",
    "0096_campaign_renewal_pricing",
    "0097_store_commercial_contracts",
    "0098_store_recurring_attempts",
    "0099_campaign_invoice_revisions",
    "0100_commercial_payment_guards",
    "0101_commercial_announcement_journey",
    "0102_store_subscription_changes",
    "0103_commercial_invoice_retirement",
    "0104_store_campaign_revision_guard",
    "0105_product_campaign_renewals",
  ])
    await db.exec(readFileSync("supabase/migrations/" + file + ".sql", "utf8"));
  return db;
}

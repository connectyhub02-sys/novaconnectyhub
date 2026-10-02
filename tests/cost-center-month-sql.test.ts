import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const from = "2026-09-01T00:00:00-03:00", to = "2026-10-01T00:00:00-03:00";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
    create table usage_events(id uuid primary key default gen_random_uuid(), provider text, feature_code text, model_id text, billing_mode text, status text,
      input_tokens numeric, output_tokens numeric, output_units numeric, connecty_charge_credits numeric, provider_cost numeric, metadata jsonb default '{}', occurred_at timestamptz);
    create table credit_transactions(id uuid primary key default gen_random_uuid(), transaction_type text, amount_credits numeric, usage_event_id uuid, description text, metadata jsonb default '{}', created_at timestamptz);
    create table billing_invoices(id uuid primary key default gen_random_uuid(), status text, total_brl numeric, paid_at timestamptz);
    create table billing_payments(id uuid primary key default gen_random_uuid(), invoice_id uuid, status text, amount_brl numeric, paid_at timestamptz, created_at timestamptz, updated_at timestamptz);
    create table credit_wallets(id uuid primary key default gen_random_uuid(), balance_credits numeric, reserved_credits numeric);
    create table whatsapp_instances(id uuid primary key default gen_random_uuid(), provider text, status text);
    create table organizations(id uuid primary key default gen_random_uuid(), status text, plan_code text);`);
  await db.exec(readFileSync("supabase/migrations/0179_cost_center_monthly_truth.sql", "utf8"));
  await db.exec(`
    insert into usage_events(provider,feature_code,model_id,billing_mode,status,input_tokens,output_tokens,output_units,connecty_charge_credits,provider_cost,metadata,occurred_at) values
      ('gemini','chat_completion','gemini-3.6-flash','customer_billable','completed',1000,10,10,40,0.06,'{"geminiUsage":{"cachedTokens":250,"thoughtsTokens":5}}','2026-09-10T12:00:00Z'),
      ('gemini','chat_completion','gemini-3.6-flash','customer_billable','completed',1000,10,10,40,0.06,'{"metering":{"providerCostUsd":0.011}}','2026-09-11T12:00:00Z'),
      ('gemini','chat_completion','gemini-3.6-flash','customer_billable','completed',1000,10,10,40,0.05,'{"metering":{"matchedRates":[{"costFxUsdBrl":5}]}}','2026-09-12T12:00:00Z'),
      ('elevenlabs','voice_reply_whatsapp','eleven_multilingual_v2','customer_billable','completed',0,0,120,50,0.072,'{}','2026-09-12T12:00:00Z'),
      ('gemini','chat_completion','gemini-3.6-flash','customer_billable','failed',1000,0,0,0,0,'{}','2026-09-13T12:00:00Z'),
      ('gemini','chat_completion','gemini-3.6-flash','customer_billable','completed',1000,10,10,40,0.06,'{}','2026-08-31T23:00:00-03:00'),
      ('gemini','chat_completion','gemini-3.6-flash','customer_billable','completed',1000,10,10,40,0.06,'{}','2026-10-01T00:00:00-03:00');
    insert into credit_transactions(transaction_type,amount_credits,usage_event_id,description,metadata,created_at) values
      ('grant',25000,null,'Créditos do plano Scale','{"payment_id":"p"}','2026-09-05'),
      ('purchase',3000,null,'Pacote','{}','2026-09-06'),
      ('grant',1000,null,'Creditos do teste gratis ConnectyHub','{}','2026-09-07'),
      ('grant',150000,null,'Franquia liberada administrativamente','{}','2026-09-08'),
      ('debit',-40,gen_random_uuid(),'Resposta IA WhatsApp','{}','2026-09-10'),
      ('debit',-25000,null,'Ajuste comercial manual','{}','2026-09-11'),
      ('expiration',-1000,null,'Expirado','{}','2026-09-12');
    insert into billing_invoices(status,total_brl,paid_at) values ('paid',497,'2026-09-05'),('open',97,null),('paid',97,'2026-08-15');
    insert into billing_payments(invoice_id,status,amount_brl,paid_at,created_at,updated_at) values
      (gen_random_uuid(),'approved',497,'2026-09-05','2026-09-05','2026-09-05'),(null,'approved',30,'2026-09-06','2026-09-06','2026-09-06'),(null,'refunded',7,null,'2026-09-01','2026-09-20');
    insert into credit_wallets(balance_credits,reserved_credits) values (1000,10),(500,0);
    insert into whatsapp_instances(provider,status) values ('uazapi','connected'),('uazapi','disconnected'),('meta','connected');
    insert into organizations(status,plan_code) values ('active','scale'),('active','trial'),('active','internal'),('past_due','scale');`);
}, 30000);
afterAll(async () => { await db?.close(); });

type UsageRow = { provider: string; feature_code: string; events: string; input_tokens: string; cached_tokens: string; thoughts_tokens: string; credits: string; cost_usd: string; characters: string };
type Report = {
  usage: UsageRow[];
  credit_flow: Array<{ origin: string; credits: string }>;
  cash: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  settings: { usd_brl_reference: { rate: number } };
  fixed_costs: Array<{ cost_key: string }>;
};

async function report() {
  return (await db.query<{ r: Report }>("select cost_center_month_report($1,$2) r", [from, to])).rows[0].r;
}

describe("cost center monthly report SQL", () => {
  it("aggregates only the Brasília month, completed or pending, with USD cost by the best available evidence", async () => {
    const r = await report();
    const chat = r.usage.find(u => u.feature_code === "chat_completion")!;
    expect(Number(chat.events)).toBe(3);
    expect(Number(chat.input_tokens)).toBe(3000);
    expect(Number(chat.cached_tokens)).toBe(250);
    expect(Number(chat.thoughts_tokens)).toBe(5);
    expect(Number(chat.credits)).toBe(120);
    // 0.06/6 (registered at the tariff rate) + 0.011 (stored USD) + 0.05/5 (rate snapshot).
    expect(Number(chat.cost_usd)).toBeCloseTo(0.01 + 0.011 + 0.01, 9);
    const voice = r.usage.find(u => u.provider === "elevenlabs")!;
    expect(Number(voice.characters)).toBe(120);
  });

  it("classifies credit origins, cash, snapshot, settings and fixed costs", async () => {
    const r = await report();
    const flow = Object.fromEntries(r.credit_flow.map(c => [c.origin, Number(c.credits)]));
    expect(flow).toEqual({ paid_plan: 25000, purchase: 3000, trial: 1000, administrative: 150000, consumed: -40, administrative_removal: -25000, expired: -1000 });
    expect(r.cash).toMatchObject({ invoices_paid: 1 });
    expect(Number(r.cash.invoices_paid_brl)).toBe(497);
    expect(Number(r.cash.payments_without_invoice_brl)).toBe(30);
    expect(Number(r.cash.refunded_brl)).toBe(7);
    expect(r.snapshot).toMatchObject({ connected_instances: 1, paying_organizations: 1 });
    expect(Number(r.snapshot.wallet_balance_credits)).toBe(1500);
    expect(r.settings.usd_brl_reference.rate).toBe(5.23);
    expect(r.fixed_costs.map(f => f.cost_key)).toEqual(["elevenlabs_subscription", "uazapi", "vps"]);
  });

  it("rejects invalid periods and stays private to the service role", async () => {
    await expect(db.query("select cost_center_month_report($1,$2)", [to, from])).rejects.toThrow("cost_center_invalid_period");
    await expect(db.query("select cost_center_month_report($1,$2)", ["2025-01-01", "2026-09-01"])).rejects.toThrow("cost_center_invalid_period");
    const grants = await db.query<{ grantee: string }>("select grantee from information_schema.role_routine_grants where routine_name='cost_center_month_report'");
    expect(grants.rows.map(row => row.grantee)).not.toContain("authenticated");
    await db.exec("set role authenticated");
    await expect(db.query("select * from platform_fixed_costs")).rejects.toThrow();
    await expect(db.query("select cost_center_month_report($1,$2)", [from, to])).rejects.toThrow();
    await db.exec("reset role");
  });

  it("re-running the migration keeps edited values", async () => {
    await db.exec("update platform_fixed_costs set monthly_amount=25 where cost_key='vps'");
    await db.exec(readFileSync("supabase/migrations/0179_cost_center_monthly_truth.sql", "utf8"));
    expect(Number((await db.query<{ v: string }>("select monthly_amount v from platform_fixed_costs where cost_key='vps'")).rows[0].v)).toBe(25);
  });
});

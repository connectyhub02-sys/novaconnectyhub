import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as renewalPolicy from "../src/lib/billing/managed-renewal-policy";
import * as commercialTerms from "../src/lib/billing/commercial-terms";

let db: PGlite;
const org = randomUUID(), otherOrg = randomUUID(), actor = randomUUID(), member = randomUUID(), outsider = randomUUID();
const sub = randomUUID(), otherSub = randomUUID(), card = randomUUID(), oldAttempt = randomUUID();
const encrypted = "v1:fixture-iv:fixture-tag:fixture-ciphertext";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table organizations(id uuid primary key,owner_id uuid);
    create table organization_members(organization_id uuid,user_id uuid,role text);
    create table organization_subscriptions(id uuid primary key,organization_id uuid,status text default 'active',subscription_kind text default 'plan',plan_code text default 'pro',current_period_start timestamptz default now(),current_period_end timestamptz default now()+interval '20 days',next_billing_at timestamptz default now()+interval '20 days',canceled_at timestamptz,billing_provider text default 'asaas',provider_subscription_id text,metadata jsonb default '{"commercial_terms":{"price_brl":97,"billing_cycle":"recurring"}}');
    create table billing_card_attempts(id uuid primary key,organization_id uuid,subscription_id uuid,state text);
    create table commercial_agreements(platform_subscription_id uuid,cancel_at_period_end boolean default false,state text default 'active');
    create table credit_topup_policies(organization_id uuid primary key,card_method_id uuid,enabled boolean default true,agreed_amount_brl numeric default 30,monthly_cap_brl numeric default 90,authorized_by uuid,updated_at timestamptz);
    create table billing_payments(id uuid primary key,amount numeric); create table billing_invoices(id uuid primary key,amount numeric); create table billing_cycles(id uuid primary key,credits numeric);
    create table platform_customer_journey(user_id uuid,event_key text unique,event_type text,source_id uuid,payload jsonb);
  `);
  // Execute the existing vault DDL with its real constraints and RLS.
  await db.exec(readFileSync("supabase/migrations/0093_managed_asaas_renewals.sql", "utf8").split("alter table public.billing_card_attempts")[0]);
  await db.exec(readFileSync("supabase/migrations/0152_billing_payment_method_management.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0153_subscription_card_replacement.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("truncate billing_card_replacements,billing_asaas_card_vault,billing_card_attempts,credit_topup_policies,commercial_agreements,organization_subscriptions,organization_members,organizations,auth.users,billing_payments,billing_invoices,billing_cycles cascade");
  await db.query("insert into auth.users values ($1),($2),($3)", [actor, member, outsider]);
  await db.query("insert into organizations values ($1,$2),($3,$4)", [org, actor, otherOrg, outsider]);
  await db.query("insert into organization_members values ($1,$2,'member')", [org, member]);
  await db.query("insert into organization_subscriptions(id,organization_id) values ($1,$2),($3,$4)", [sub, org, otherSub, otherOrg]);
  await db.query("insert into billing_card_attempts values ($1,$2,$3,'approved')", [oldAttempt, org, sub]);
  await db.query("insert into billing_asaas_card_vault(id,organization_id,subscription_id,activation_attempt_id,customer_id,token_encrypted,consent_version,status) values ($1,$2,$3,$4,'cus_original',$5,'connectyhub-advance-3-2-1-v1','active')", [card, org, sub, oldAttempt, encrypted]);
  await db.query("insert into credit_topup_policies(organization_id,card_method_id,authorized_by) values ($1,$2,$3)", [org, card, actor]);
});
type Result = { claimed?: boolean; state: string; result_code: string; customer_id?: string };
async function begin(id = randomUUID(), user = actor, subscription = sub) {
  const result = await db.query<{ result: Result }>("select begin_billing_card_replacement($1,$2,$3,$4) result", [org, user, subscription, id]);
  return { id, ...result.rows[0].result };
}
async function finish(id: string, failure: string | null = null, user = actor) {
  return (await db.query<{ result: Result }>("select finish_billing_card_replacement($1,$2,$3,$4,$5,'1111',$6) result", [org, user, sub, id, encrypted, failure])).rows[0].result;
}
const active = async () => (await db.query<{ id: string; customer_id: string; status: string }>("select id,customer_id,status from billing_asaas_card_vault where status='active'")).rows;

describe("atomic subscription card replacement", () => {
  it("shares selectable cards with the existing 0152 management flow", async () => {
    await db.query("update billing_asaas_card_vault set selectable=true where id=$1", [card]);
    const request = await begin();
    expect((await finish(request.id)).state).toBe("succeeded");
    const current = (await db.query<{id:string;selectable:boolean;last_digits:string}>("select id,selectable,last_digits from billing_asaas_card_vault where status='active'")).rows[0];
    expect(current).toMatchObject({selectable:true,last_digits:"1111"});
    const end = (await db.query<{end:string}>("select current_period_end::text as end from organization_subscriptions where id=$1", [sub])).rows[0].end;
    await db.query("select set_billing_default_card($1,$2,$3,$4,$5,$6,'connectyhub-card-default-v1',$7,null)", [org,actor,sub,randomUUID(),current.id,end,card]);
    expect((await active())[0].id).toBe(card);
  });
  it("makes the real renewal worker select the newly persisted active token only in its future window", async () => {
    await db.query("update billing_asaas_card_vault set token_encrypted=$1 where id=$2", [encrypted + "-old", card]);
    const vault = serverModuleHarness<typeof import("../src/lib/billing/asaas-card-vault")>("src/lib/billing/asaas-card-vault.ts", {
      "@/lib/security/credentials-crypto": { decryptCredentialValue: (value: string) => value === encrypted ? "new-token" : "old-token" },
    });
    const pay = vi.fn(async () => ({ id: "payment-fixture" }));
    const create = vi.fn(async () => ({ id: "payment-fixture" }));
    const attempt = { id: randomUUID(), amount: 97 };
    const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: { claimed: boolean; attempt: typeof attempt }; error: null }>>(async () => ({ data: { claimed: true, attempt }, error: null }));
    const client = {
      rpc,
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        const query = {
          select: () => query, update: () => query,
          eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
          single: async () => ({ data: attempt, error: null }),
          async maybeSingle() {
            expect(table).toBe("billing_asaas_card_vault");
            expect(filters).toEqual([["organization_id", org], ["subscription_id", sub], ["status", "active"]]);
            const result = await db.query("select id,customer_id,token_encrypted from billing_asaas_card_vault where organization_id=$1 and subscription_id=$2 and status=$3", filters.map(([,value]) => value));
            return { data: result.rows[0] ?? null, error: null };
          },
        };
        return query;
      },
    } as unknown as Parameters<typeof vault.loadActiveAsaasCard>[0];
    expect(await vault.loadActiveAsaasCard(client, org, sub)).toMatchObject({ id: card, token: "old-token" });
    const replacement = await begin(); await finish(replacement.id);
    const activeCard = await vault.loadActiveAsaasCard(client, org, sub);
    expect(activeCard).toMatchObject({ token: "new-token", customerId: "cus_original" });
    expect(activeCard?.id).not.toBe(card);
    const worker = serverModuleHarness<typeof import("../src/lib/billing/managed-asaas-renewals")>("src/lib/billing/managed-asaas-renewals.ts", {
      "node:crypto": { randomUUID }, "./asaas-card-vault": vault,
      "./managed-renewal-policy": renewalPolicy, "./commercial-terms": commercialTerms,
      "@/lib/sales-catalog/asaas": { loadAsaasPlatformBillingConfig: async () => ({ mode: "sandbox" }) },
      "@/lib/sales-catalog/asaas-direct": { createManagedAsaasInvoice: create, payManagedAsaasInvoice: pay },
      "@/lib/sales-catalog/transparent-checkout": { directPaymentState: () => "approved" },
      "./native-card-checkout": { finishNativeBilling: async () => ({ state: "approved" }) },
      "./plan-checkout": { loadBillingCheckoutIntent: async () => ({ payment: { id: randomUUID(), provider_payment_id: null } }) },
    });
    const input = { organizationId: org, subscriptionId: sub, periodEnd: new Date("2030-10-14T13:00:00Z"), now: new Date("2030-10-01T13:00:00Z"), prepare: vi.fn(async () => null) };
    expect(await worker.attemptManagedAsaasRenewal(client, input)).toMatchObject({ attempted: false });
    expect(create).not.toHaveBeenCalled(); expect(pay).not.toHaveBeenCalled();
    expect(await worker.attemptManagedAsaasRenewal(client, { ...input, now: new Date("2030-10-12T13:00:00Z") })).toMatchObject({ attempted: true, approved: true });
    expect(rpc.mock.calls[0]).toMatchObject(["claim_managed_asaas_renewal", { p_method: activeCard?.id }]);
    expect(pay).toHaveBeenCalledWith(expect.objectContaining({ token: "new-token", customerId: "cus_original" }));
  });
  it("replaces the token and top-up reference without changing financial state", async () => {
    const before = (await db.query("select * from organization_subscriptions")).rows;
    const attempt = await begin();
    expect(attempt.customer_id).toBe("cus_original");
    expect(await finish(attempt.id)).toMatchObject({ state: "succeeded" });
    expect((await db.query("select * from organization_subscriptions")).rows).toEqual(before);
    const cards = await active();
    expect(cards).toHaveLength(1); expect(cards[0].id).not.toBe(card); expect(cards[0].customer_id).toBe("cus_original");
    expect((await db.query("select status from billing_asaas_card_vault where id=$1", [card])).rows[0]).toEqual({ status: "inactive" });
    expect((await db.query("select card_method_id,enabled,agreed_amount_brl,monthly_cap_brl,authorized_by from credit_topup_policies")).rows[0]).toEqual({ card_method_id: cards[0].id, enabled: true, agreed_amount_brl: "30", monthly_cap_brl: "90", authorized_by: actor });
    for (const table of ["billing_payments", "billing_invoices", "billing_cycles"]) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
    expect((await db.query("select * from billing_card_attempts")).rows).toHaveLength(1);
    const audit = (await db.query<{ completed_at: string }>("select * from billing_card_replacements")).rows[0];
    expect(audit).toMatchObject({ organization_id: org, actor_id: actor, subscription_id: sub, old_method_id: card, state: "succeeded", result_code: "replaced", consent_version: "connectyhub-card-replacement-v1" });
    expect(audit.completed_at).toBeTruthy(); expect(JSON.stringify(audit)).not.toContain(encrypted);
  });
  it.each(["tokenization_rejected", "gateway_unavailable", "gateway_configuration", "invalid_input"])("keeps the old card and audits %s", async failure => {
    const attempt = await begin();
    expect(await finish(attempt.id, failure)).toMatchObject({ state: "failed", result_code: failure });
    expect((await active())[0].id).toBe(card);
  });
  it("audits member and cross-org refusals without leaking customer data", async () => {
    expect(await begin(randomUUID(), member)).toMatchObject({ claimed: false, result_code: "forbidden", customer_id: null });
    expect(await begin(randomUUID(), actor, otherSub)).toMatchObject({ claimed: false, result_code: "not_found", customer_id: null });
    expect((await active())[0].id).toBe(card);
  });
  it("allows an organization admin and revalidates revoked permission at commit", async () => {
    await db.query("update organization_members set role='admin' where user_id=$1", [member]);
    const attempt = await begin(randomUUID(), member); expect(attempt.claimed).toBe(true);
    await db.query("update organization_members set role='member' where user_id=$1", [member]);
    expect(await finish(attempt.id, null, member)).toMatchObject({ result_code: "forbidden" });
    expect((await active())[0].id).toBe(card);
  });
  it.each([
    ["status='past_due'", "inactive_plan"], ["current_period_end=now()-interval '1 day'", "inactive_plan"],
    ["provider_subscription_id='sub_legacy'", "unsupported_provider"], ["billing_provider='mercado_pago'", "unsupported_provider"],
    ["metadata='{\"commercial_terms\":{\"billing_cycle\":\"one_time\"}}'", "automatic_renewal_required"],
    ["canceled_at=now()", "automatic_renewal_required"],
  ])("blocks an ineligible subscription: %s", async (change, code) => {
    await db.query(`update organization_subscriptions set ${change} where id=$1`, [sub]);
    expect(await begin()).toMatchObject({ claimed: false, result_code: code });
  });
  it("refuses a missing recurring card and a canceled commercial agreement", async () => {
    await db.query("update billing_asaas_card_vault set status='inactive'");
    expect(await begin()).toMatchObject({ result_code: "automatic_renewal_required" });
    await db.query("update billing_asaas_card_vault set status='active'");
    await db.query("insert into commercial_agreements(platform_subscription_id,cancel_at_period_end) values ($1,true)", [sub]);
    expect(await begin()).toMatchObject({ result_code: "automatic_renewal_required" });
  });
  it.each(["processing", "pending", "unknown"])("does not replace a card while a renewal/top-up is %s", async state => {
    const attempt = await begin();
    await db.query("insert into billing_card_attempts values ($1,$2,$3,$4)", [randomUUID(), org, otherSub, state]);
    expect(await finish(attempt.id)).toMatchObject({ result_code: "billing_busy" });
    expect(await begin()).toMatchObject({ result_code: "billing_busy" });
    expect((await active())[0].id).toBe(card);
  });
  it("serializes competing replacements and makes successful replay inert", async () => {
    const a = await begin(), b = await begin();
    expect(await finish(a.id)).toMatchObject({ state: "succeeded" });
    expect(await finish(b.id)).toMatchObject({ result_code: "card_changed" });
    const cards = await active();
    expect(await begin(a.id)).toMatchObject({ claimed: false, state: "succeeded" });
    expect(await finish(a.id, "gateway_unavailable")).toMatchObject({ state: "succeeded" });
    expect(await active()).toEqual(cards);
  });
  it("rolls the old card and audit back if the new vault insert fails", async () => {
    const attempt = await begin();
    await db.exec("create function reject_new_card() returns trigger language plpgsql as $$ begin raise exception 'fixture write failure'; end $$; create trigger fixture_failure before insert on billing_asaas_card_vault for each row execute function reject_new_card();");
    try { await expect(finish(attempt.id)).rejects.toThrow("fixture write failure"); }
    finally { await db.exec("drop trigger fixture_failure on billing_asaas_card_vault; drop function reject_new_card();"); }
    expect((await active())[0].id).toBe(card);
    expect((await db.query("select state from billing_card_replacements where id=$1", [attempt.id])).rows[0]).toEqual({ state: "processing" });
  });
  it("does not grant browser roles access to credentials, audits or mutations", async () => {
    for (const role of ["anon", "authenticated"]) {
      expect((await db.query<{ allowed: boolean }>("select has_function_privilege($1,'public.finish_billing_card_replacement(uuid,uuid,uuid,uuid,text,text,text)','EXECUTE') allowed", [role])).rows[0].allowed).toBe(false);
      expect((await db.query<{ allowed: boolean }>("select has_table_privilege($1,'public.billing_card_replacements','SELECT') allowed", [role])).rows[0].allowed).toBe(false);
      expect((await db.query<{ allowed: boolean }>("select has_table_privilege($1,'public.billing_asaas_card_vault','SELECT') allowed", [role])).rows[0].allowed).toBe(false);
    }
  });
});

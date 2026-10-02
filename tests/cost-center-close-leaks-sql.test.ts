import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { aiDatabaseFixture } from "./helpers/ai-database";

// Linked company (child) spends from the parent's wallet: the wallet and the debit stay
// with the parent, the usage belongs to the child, as in the central wallet debit.
async function fixture() {
  const f = await aiDatabaseFixture();
  const parent = randomUUID();
  await f.db.exec(`alter type billing_provider add value 'elevenlabs'; alter table organizations add column name text;
    create schema if not exists storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table organization_storage_usage(organization_id uuid primary key,used_bytes bigint not null default 0,billable_file_count integer not null default 0);
    create function record_organization_storage_usage(uuid,bigint,integer,text,jsonb) returns void language sql as $$select$$;
    create function release_organization_storage_usage(uuid,bigint,integer,text,jsonb) returns void language sql as $$select$$;
    create function get_organization_storage_entitlement(uuid) returns table(total_storage_limit_bytes bigint,storage_file_max_bytes bigint,total_storage_file_limit integer) language sql as $$select 50000000::bigint,20000000::bigint,100$$;
    create table provider_cost_centers(id uuid primary key default gen_random_uuid(),provider text unique);
    create table provider_features(id uuid primary key default gen_random_uuid(),cost_center_id uuid,feature_code text,name text,description text,unit text,enabled boolean,billable boolean,unique(cost_center_id,feature_code));
    create table billing_rates(id uuid primary key default gen_random_uuid(),cost_center_id uuid,feature_id uuid,model_id uuid,plan_code text,unit text,provider_cost_per_unit numeric,connecty_price_per_unit numeric,margin_multiplier numeric,minimum_charge_credits numeric,currency text,effective_from timestamptz,effective_to timestamptz,active boolean,metadata jsonb);`);
  for (const m of ["0147_connectyhub_voice", "0148_studio_assets", "0149_studio_operations"]) await f.db.exec(readFileSync(`supabase/migrations/${m}.sql`, "utf8"));
  await f.db.query("insert into organizations(id) values($1)", [parent]);
  await f.db.query(`create or replace function resolve_organization_contract_access(uuid) returns jsonb language sql as $$
    select jsonb_build_object('allowed',true,'billing_organization_id',case when $1='${f.org}'::uuid then '${parent}'::uuid else $1 end)$$`);
  await f.db.query("insert into billing_cycles(id,organization_id,cycle_start,cycle_end,status,included_credits) values($1,$2,now()-interval '1 day',now()+interval '1 day','open',3)", [randomUUID(), parent]);
  await f.db.exec(`with cc as (insert into provider_cost_centers(provider) values('gemini') returning id),
    feature as (insert into provider_features(cost_center_id,feature_code,unit,enabled,billable) select id,'content_generation','output_token',true,true from cc returning id,cost_center_id)
    insert into billing_rates(cost_center_id,feature_id,unit,provider_cost_per_unit,connecty_price_per_unit,margin_multiplier,minimum_charge_credits,currency,effective_from,active,metadata)
    select cost_center_id,id,u,.0000045,.0018,4,1,'BRL',now()-interval '1 day',true,'{}' from feature cross join (values('input_token'),('output_token')) v(u);`);
  const project = randomUUID(), key = randomUUID();
  await f.db.query("insert into voice_projects(id,organization_id,name) values($1,$2,'Voz')", [project, f.org]);
  await f.db.query("insert into voice_api_keys(id,project_id,name,key_hash,key_prefix) values($1,$2,'Key','hash','prefix')", [key, project]);
  const migration = readFileSync("supabase/migrations/0180_cost_center_close_leaks.sql", "utf8");
  await f.db.exec(migration);
  return { ...f, parent, project, key, migration };
}

it("attributes voice usage to the company that used it, debits the paying wallet once and records overage", async () => {
  const f = await fixture();
  try {
    const r = (await f.db.query<{ r: { id: string } }>("select reserve_voice_generation($1,$2,'one','h','voice','eleven_multilingual_v2',100,5,.005,'[]') r", [f.project, f.key])).rows[0].r;
    await f.db.query("select start_voice_generation($1)", [r.id]);
    await f.db.query("update voice_generations set object_path='private/a.mp3',bytes_size=10 where id=$1", [r.id]);
    await f.db.query("select finish_voice_generation($1,'completed')", [r.id]);
    await f.db.query("select finish_voice_generation($1,'completed')", [r.id]);
    const usage = (await f.db.query<{ organization_id: string; metadata: Record<string, string> }>("select organization_id,metadata from usage_events")).rows;
    expect(usage).toHaveLength(1);
    expect(usage[0].organization_id).toBe(f.org);
    expect(usage[0].metadata.billing_organization_id).toBe(f.parent);
    const tx = (await f.db.query<{ organization_id: string; amount_credits: string; metadata: Record<string, string> }>("select organization_id,amount_credits,metadata from credit_transactions")).rows;
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ organization_id: f.parent, metadata: { usage_organization_id: f.org } });
    expect(Number(tx[0].amount_credits)).toBe(-5);
    const wallet = (await f.db.query<{ balance_credits: string }>("select balance_credits from credit_wallets where organization_id=$1", [f.parent])).rows[0];
    expect(Number(wallet.balance_credits)).toBe(95);
    const cycle = (await f.db.query<{ used_credits: string; overage_credits: string }>("select used_credits,overage_credits from billing_cycles")).rows[0];
    expect(Number(cycle.used_credits)).toBe(5);
    expect(Number(cycle.overage_credits)).toBe(2);
  } finally { await f.db.close(); }
}, 30000);

it("attributes Studio settlements, including failures, without extra debits", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`insert into studio_capabilities(operation,model_id,provider,feature_code,enabled,confirmed_at,cost_evidence,confirmed_rates) values('gemini_tts','gemini-tts','gemini','voice_generation_audio',true,now(),'Synthetic confirmed tariff','[{"id":"rate"}]')`);
    const reserve = async (idem: string) => (await f.db.query<{ r: { id: string } }>("select reserve_studio_operation($1,$2,$3,$3,'gemini_tts','gemini-tts','voice',100,50,.1,'[]','{}','{\"inputTokens\":100,\"outputTokens\":1000}',20000000,1) r", [f.project, f.key, idem])).rows[0].r;
    const ok = await reserve("ok"), bad = await reserve("bad");
    await f.db.query("update voice_generations set object_path='private/r',bytes_size=100 where id=$1", [ok.id]);
    await f.db.query("update studio_operations set result_mime='audio/wav',result_file_count=1 where id=$1", [ok.id]);
    await f.db.query("select finish_studio_operation($1,'completed',5,.01,'{\"inputTokens\":100,\"outputTokens\":20}')", [ok.id]);
    await f.db.query("select finish_studio_operation($1,'failed')", [bad.id]);
    const rows = (await f.db.query<{ organization_id: string; status: string }>("select organization_id,status::text from usage_events order by status")).rows;
    expect(rows.find(row => row.status === "completed")?.organization_id).toBe(f.org);
    expect(rows.find(row => row.status === "failed")?.organization_id).toBe(f.org);
    expect((await f.db.query("select * from credit_transactions")).rows).toHaveLength(1);
  } finally { await f.db.close(); }
}, 30000);

it("adds the two missing tariffs once with a 5 credit minimum and keeps inner settlements private", async () => {
  const f = await fixture();
  try {
    await f.db.exec(f.migration);
    const rates = (await f.db.query<{ feature_code: string; unit: string; minimum_charge_credits: string; connecty_price_per_unit: string }>(
      "select f.feature_code,r.unit,r.minimum_charge_credits,r.connecty_price_per_unit from billing_rates r join provider_features f on f.id=r.feature_id where f.feature_code in ('sales_catalog_import','ai_traffic_manager') order by 1,2")).rows;
    expect(rates).toHaveLength(4);
    expect(rates.every(rate => Number(rate.minimum_charge_credits) === 5 && Number(rate.connecty_price_per_unit) === 0.0018)).toBe(true);
    const grants = (await f.db.query<{ routine_name: string; grantee: string }>(
      "select routine_name,grantee from information_schema.role_routine_grants where routine_name in ('finish_voice_generation','finish_studio_operation','finish_voice_generation_before_attribution','finish_studio_operation_before_attribution') and grantee in ('service_role','authenticated')")).rows;
    expect(grants.filter(g => g.grantee === "authenticated")).toHaveLength(0);
    expect(grants.map(g => g.routine_name).sort()).toEqual(["finish_studio_operation", "finish_voice_generation"]);
  } finally { await f.db.close(); }
}, 30000);

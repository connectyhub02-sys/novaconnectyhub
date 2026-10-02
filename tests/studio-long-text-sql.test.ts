import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { aiDatabaseFixture } from "./helpers/ai-database";

async function fixture() {
  const f = await aiDatabaseFixture();
  await f.db.exec(`alter type billing_provider add value 'elevenlabs'; alter table organizations add column name text;
    create schema if not exists storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table organization_storage_usage(organization_id uuid primary key,used_bytes bigint not null default 0,billable_file_count integer not null default 0);
    create function record_organization_storage_usage(uuid,bigint,integer,text,jsonb) returns void language sql as $$insert into organization_storage_usage values($1,$2,$3) on conflict(organization_id) do update set used_bytes=organization_storage_usage.used_bytes+$2,billable_file_count=organization_storage_usage.billable_file_count+$3$$;
    create function release_organization_storage_usage(uuid,bigint,integer,text,jsonb) returns void language sql as $$select$$;
    create function get_organization_storage_entitlement(uuid) returns table(total_storage_limit_bytes bigint,storage_file_max_bytes bigint,total_storage_file_limit integer) language sql as $$select 2000000000::bigint,262144000::bigint,100$$;
    create table provider_cost_centers(id uuid primary key default gen_random_uuid(),provider text unique);
    create table provider_features(id uuid primary key default gen_random_uuid(),cost_center_id uuid,feature_code text,unique(cost_center_id,feature_code));
    create table provider_models(id uuid primary key default gen_random_uuid(),cost_center_id uuid,provider_model_id text,display_name text,feature_code text,supports_billing boolean,enabled boolean,input_unit text,output_unit text,metadata jsonb,unique(cost_center_id,provider_model_id));
    create table billing_rates(id uuid primary key default gen_random_uuid(),cost_center_id uuid,feature_id uuid,model_id uuid,plan_code text,unit text,provider_cost_per_unit numeric,connecty_price_per_unit numeric,margin_multiplier numeric,minimum_charge_credits numeric,currency text,effective_from timestamptz,effective_to timestamptz,active boolean,metadata jsonb default '{}');`);
  for (const m of ["0147_connectyhub_voice", "0148_studio_assets", "0149_studio_operations"]) await f.db.exec(readFileSync(`supabase/migrations/${m}.sql`, "utf8"));
  await f.db.exec(`with cc as (insert into provider_cost_centers(provider) values('elevenlabs') returning id),
    tts as (insert into provider_features(cost_center_id,feature_code) select id,'text_to_speech' from cc returning id,cost_center_id),
    models as (insert into provider_models(cost_center_id,provider_model_id,feature_code,enabled) select cc.id,m,f,true from cc cross join (values('eleven_multilingual_v2','text_to_speech'),('eleven_flash_v2_5','voice_reply_whatsapp'),('eleven_v3','studio_dialogue')) v(m,f) returning id,provider_model_id)
    insert into billing_rates(cost_center_id,feature_id,model_id,unit,provider_cost_per_unit,connecty_price_per_unit,margin_multiplier,minimum_charge_credits,currency,effective_from,active)
    select tts.cost_center_id,tts.id,models.id,'character',.0006,.24,4,5,'BRL',now()-interval '1 day',true from tts join models on models.provider_model_id='eleven_multilingual_v2';`);
  const migration = readFileSync("supabase/migrations/0184_voice_studio_long_text.sql", "utf8");
  await f.db.exec(migration);
  const project = randomUUID(), key = randomUUID();
  await f.db.query("insert into voice_projects(id,organization_id,name) values($1,$2,'Livros')", [project, f.org]);
  await f.db.query("insert into voice_api_keys(id,project_id,name,key_hash,key_prefix) values($1,$2,'Key','hash','prefix')", [key, project]);
  const reserve = (idem: string, operation: string, model: string, charge: number, bytes: number) =>
    f.db.query<{ r: { claimed: boolean } }>("select reserve_studio_operation($1,$2,$3,$3,$4,$5,'voice',1000,$6,.01,'[]','{}','{\"characters\":1000}',$7,1) r", [project, key, idem, operation, model, charge, bytes]);
  return { ...f, migration, reserve };
}

it("adds per-character tariffs for Flash, Turbo and v3 once, at 4x the account table, minimum 5", async () => {
  const f = await fixture();
  try {
    await f.db.exec(f.migration);
    const rows = (await f.db.query<{ model: string; price: string; cost: string; minimum: string }>(`select m.provider_model_id model, r.connecty_price_per_unit price, r.provider_cost_per_unit cost, r.minimum_charge_credits minimum
      from billing_rates r join provider_models m on m.id=r.model_id order by 1`)).rows.map(r => [r.model, Number(r.price), Number(r.cost), Number(r.minimum)]);
    expect(rows).toEqual([["eleven_flash_v2_5", 0.12, 0.0003, 5], ["eleven_multilingual_v2", 0.24, 0.0006, 5], ["eleven_turbo_v2_5", 0.12, 0.0003, 5], ["eleven_v3", 0.24, 0.0006, 5]]);
    const caps = (await f.db.query<{ model_id: string; rates: Array<Record<string, unknown>> }>("select model_id, confirmed_rates rates from studio_capabilities where operation='long_tts' and enabled order by 1")).rows;
    expect(caps.map(c => c.model_id)).toEqual(["eleven_flash_v2_5", "eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_v3"]);
    expect(caps[1].rates).toEqual([expect.objectContaining({ unit: "character", connectyPricePerUnit: 0.24, providerCostPerUnit: 0.0006, minimumChargeCredits: 5 })]);
  } finally { await f.db.close(); }
}, 30000);

it("reserves the whole e-book up front, allows up to 250 MB only for long texts and refuses missing balance", async () => {
  const f = await fixture();
  try {
    const ok = (await f.reserve("book", "long_tts", "eleven_multilingual_v2", 60, 150_000_000)).rows[0].r;
    expect(ok.claimed).toBe(true);
    expect(Number((await f.db.query<{ reserved_credits: string }>("select reserved_credits from credit_wallets")).rows[0].reserved_credits)).toBe(60);
    await expect(f.reserve("too-big", "long_tts", "eleven_multilingual_v2", 5, 260_000_000)).rejects.toThrow("voice_price_invalid");
    await f.db.exec(`update studio_capabilities set enabled=true,confirmed_at=now(),cost_evidence='Synthetic confirmed tariff',confirmed_rates='[{"id":"x"}]' where operation='transcription'`);
    await expect(f.reserve("not-a-book", "transcription", "scribe_v2", 5, 30_000_000)).rejects.toThrow("voice_price_invalid");
    // The wallet starts with 100 credits and 60 are held: a 50 credit book does not fit.
    await expect(f.reserve("second", "long_tts", "eleven_flash_v2_5", 50, 1_000_000)).rejects.toThrow("voice_insufficient_credits");
  } finally { await f.db.close(); }
}, 30000);

import {it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {aiDatabaseFixture} from "./helpers/ai-database";
import {releaseAiModelIds} from "../src/lib/ai-api/capabilities";
it("migrates the catalog, pricing and project-scoped resources with immutable key bindings",async()=>{
  const f=await aiDatabaseFixture();
  try {
    await f.db.exec(`
      create type billing_unit as enum('input_token','output_token');
      create table provider_cost_centers(id uuid primary key default gen_random_uuid(),provider text unique,enabled boolean default true);
      create table provider_features(id uuid primary key default gen_random_uuid(),cost_center_id uuid,feature_code text,name text,description text,unit billing_unit,enabled boolean,billable boolean,unique(cost_center_id,feature_code));
      create table provider_models(id uuid primary key default gen_random_uuid(),cost_center_id uuid,provider_model_id text,display_name text,feature_code text,supports_billing boolean,enabled boolean,input_unit billing_unit,output_unit billing_unit,metadata jsonb default '{}',unique(cost_center_id,provider_model_id));
      create table billing_rates(id uuid primary key default gen_random_uuid(),cost_center_id uuid,feature_id uuid,model_id uuid,unit billing_unit,provider_cost_per_unit numeric,connecty_price_per_unit numeric,margin_multiplier numeric,minimum_charge_credits numeric,currency text,effective_from timestamptz,effective_to timestamptz,active boolean,metadata jsonb);
      insert into provider_cost_centers(provider) values('gemini');
    `);
    for(const migration of ["0113_external_ai_current_model","0125_ai_models_and_keys","0126_ai_owned_resources"]) await f.db.exec(readFileSync(`supabase/migrations/${migration}.sql`,"utf8"));
    expect((await f.db.query("select * from ai_public_models")).rows).toHaveLength(55);
    expect((await f.db.query<{id:string}>("select id from ai_public_models where enabled order by id")).rows.map(row=>row.id)).toEqual([...releaseAiModelIds].sort());
    const created=(await f.db.query<{id:string}>("select create_ai_project_with_model_key($1,'Meu app',$2,'prefix','flash-3.5') id",[f.org,randomUUID()])).rows[0].id;
    expect((await f.db.query<{model_id:string}>("select model_id from ai_api_keys where project_id=$1",[created])).rows[0].model_id).toBe("flash-3.5");
    await expect(f.db.query("update ai_api_keys set model_id='flash-3.6' where project_id=$1",[created])).rejects.toThrow("ai_key_model_immutable");
    await expect(f.db.query("update ai_api_keys set model_id=null where project_id=$1",[created])).rejects.toThrow("ai_key_model_immutable");
    await expect(f.db.query("select create_ai_project_with_model_key($1,'Indisponivel',$2,'prefix','music-realtime-exp')",[f.org,randomUUID()])).rejects.toThrow("ai_model_unavailable");
    expect((await f.db.query("select * from ai_projects where name='Indisponivel'")).rows).toHaveLength(0);
    const rates=(await f.db.query<{unit:string;connecty_price_per_unit:string}>("select r.unit,r.connecty_price_per_unit from billing_rates r join provider_models m on m.id=r.model_id where m.provider_model_id='gemini-3.5-flash'")).rows;
    expect(Number(rates.find(row=>row.unit==='input_token')?.connecty_price_per_unit)).toBe(.0036);
    expect(Number(rates.find(row=>row.unit==='output_token')?.connecty_price_per_unit)).toBe(.0216);
    const long=(await f.db.query<{price:string}>("select r.connecty_price_per_unit price from billing_rates r join provider_features f on f.id=r.feature_id where f.feature_code='external_ai_long_context' and r.unit='output_token'")).rows;
    expect(long).toHaveLength(2);expect(Number(long[0].price)).toBe(.0432);
    await f.db.exec("set role authenticated");
    for(const table of ["ai_public_models","ai_resources"]) await expect(f.db.query(`select * from ${table}`)).rejects.toThrow("permission denied");
    await expect(f.db.query("select create_ai_project_with_model_key($1,'No',$2,'prefix','flash-3.5')",[f.org,randomUUID()])).rejects.toThrow("permission denied");
  } finally {await f.db.close();}
});

import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {aiDatabaseFixture} from './helpers/ai-database';
import {serverModuleHarness} from './helpers/server-module-harness';
import {measureAiContent} from '../src/lib/ai-api/content-metering';
import {measureAiInteraction} from '../src/lib/ai-api/interaction-metering';
import type {AiPriceCard,AiUnits} from '../src/lib/ai-api/operation-pricing';
const pricing=serverModuleHarness<{priceAiUnits:(c:AiPriceCard,u:AiUnits)=>{credits:number;cost:number};batchAiPrices:(c:AiPriceCard)=>AiPriceCard}>('src/lib/ai-api/operation-pricing.ts');
const rate={id:'test',cost:.01,credits:1};
const prices:AiPriceCard={input:rate,output:rate,audio_input:{...rate,credits:3},audio_output:{...rate,credits:12},image_output:rate,search:rate,maps:rate,cached_input:{...rate,credits:.1}};

describe('Actual resource metering',()=>{
  it('counts reasoning, tool context and media independently without billing cached input twice',()=>{
    const units=measureAiContent({usageMetadata:{promptTokenCount:100,cachedContentTokenCount:20,toolUsePromptTokenCount:5,candidatesTokenCount:40,thoughtsTokenCount:7,
      candidatesTokensDetails:[{modality:'TEXT',tokenCount:10},{modality:'AUDIO',tokenCount:30}]},candidates:[]},prices);
    expect(units).toEqual({input:85,cached_input:20,output:17,audio_output:30});
    expect(pricing.priceAiUnits(prices,units).credits).toBe(464);
  });
  it('uses exact tool calls, not citations; deduplicates call IDs',()=>{
    const search={type:'google_search_call',id:'s1',arguments:{query:'a'}};
    const units=measureAiInteraction({status:'completed',usage:{total_input_tokens:10,total_output_tokens:4},steps:[search,search,{...search,id:'s2'},{type:'google_maps_call',id:'m1'},
      {type:'google_maps_result',call_id:'m1',result:Array(8).fill({name:'Place'})}]},prices);
    expect(units.search).toBe(2);expect(units.maps).toBe(1);
  });
  it('refuses missing and invalid tariffs instead of silently pricing expensive output at zero',()=>{
    expect(()=>pricing.priceAiUnits({}, {image_output:1})).toThrow('Tarifa ausente');
    expect(()=>pricing.priceAiUnits(prices,{input:NaN})).toThrow();
    expect(()=>pricing.priceAiUnits(prices,{output:-1})).toThrow();
    expect(()=>measureAiInteraction({steps:[{type:'model_output',content:[{type:'video',data:'abc'}]}],usage:{total_input_tokens:1,total_output_tokens:10}},prices)).toThrow('Medição de mídia');
  });
  it('retains regular tool prices in batch mode',()=>{
    expect(pricing.batchAiPrices({...prices,batch_input:{...rate,credits:.5},batch_output:{...rate,credits:.5}})).toEqual({search:rate,maps:rate,input:{...rate,credits:.5},output:{...rate,credits:.5}});
  });
  it('charges music by generated song, without inventing a text measurement',()=>{
    expect(measureAiInteraction({status:'completed',steps:[{type:'model_output',content:[{type:'audio',data:'abc'}]}]},{song:rate})).toEqual({song:1});
  });
});

async function fixture(){
  const f=await aiDatabaseFixture();
  await f.db.exec(`create type billing_unit as enum('input_token','output_token','request');
    create table provider_cost_centers(id uuid primary key default gen_random_uuid(),provider text unique,enabled boolean default true);
    create table provider_features(id uuid primary key default gen_random_uuid(),cost_center_id uuid,feature_code text,name text,description text,unit billing_unit,enabled boolean,billable boolean,unique(cost_center_id,feature_code));
    create table provider_models(id uuid primary key default gen_random_uuid(),cost_center_id uuid,provider_model_id text,display_name text,feature_code text,supports_billing boolean,enabled boolean,input_unit billing_unit,output_unit billing_unit,metadata jsonb default '{}',unique(cost_center_id,provider_model_id));
    create table billing_rates(id uuid primary key default gen_random_uuid(),cost_center_id uuid,feature_id uuid,model_id uuid,unit billing_unit,plan_code text,provider_cost_per_unit numeric,connecty_price_per_unit numeric,margin_multiplier numeric,minimum_charge_credits numeric,currency text,effective_from timestamptz,effective_to timestamptz,active boolean,metadata jsonb);
    insert into provider_cost_centers(provider) values('gemini');`);
  for(const migration of ['0113_external_ai_current_model','0125_ai_models_and_keys','0126_ai_owned_resources','0128_ai_resource_operations'])await f.db.exec(readFileSync(`supabase/migrations/${migration}.sql`,'utf8'));
  return f;
}
describe('Resource wallet transactions',()=>{
  it('settles excess real usage once, into the proper cost-center feature',async()=>{
    const f=await fixture();try{
      const r=await f.claim('media');await f.reserve(r.id,10);await f.db.query('select start_ai_request($1)',[r.id]);
      const usage=JSON.stringify({input:2,output:4,cost:.5,charge:20,featureCode:'external_ai_video'});
      for(let i=0;i<2;i++)await f.db.query("select settle_ai_operation($1,'completed',$2,'{\"object\":\"video\"}')",[r.id,usage]);
      const wallet=(await f.db.query<{balance_credits:string;reserved_credits:string}>('select * from credit_wallets where organization_id=$1',[f.org])).rows[0];
      expect(Number(wallet.balance_credits)).toBe(80);expect(Number(wallet.reserved_credits)).toBe(0);
      const events=await f.db.query<{feature_code:string}>('select feature_code from usage_events');expect(events.rows).toEqual([{feature_code:'external_ai_video'}]);
      expect((await f.db.query('select * from credit_transactions')).rows).toHaveLength(1);
    }finally{await f.db.close();}
  },20000);
  it('does not spend another operation reservation or absorb an unpaid cost',async()=>{
    const f=await fixture();try{
      const r=await f.claim('first'),other=await f.claim('other');await f.reserve(r.id,20);await f.reserve(other.id,80);
      await f.db.query('select start_ai_request($1)',[r.id]);
      await expect(f.db.query("select settle_ai_operation($1,'completed','{\"charge\":30,\"cost\":1,\"featureCode\":\"external_ai_batch\"}','{}')",[r.id])).rejects.toThrow('ai_insufficient_credits');
      expect((await f.db.query('select * from usage_events')).rows).toHaveLength(0);
      expect(Number((await f.db.query<{reserved_credits:string}>('select reserved_credits from credit_wallets')).rows[0].reserved_credits)).toBe(100);
      await f.db.exec('update credit_wallets set balance_credits=130');
      await f.db.query("select settle_ai_operation($1,'completed','{\"charge\":30,\"cost\":1,\"featureCode\":\"external_ai_batch\"}','{}')",[r.id]);
      const wallet=(await f.db.query<{balance_credits:string;reserved_credits:string}>('select * from credit_wallets')).rows[0];
      expect(Number(wallet.balance_credits)).toBe(100);expect(Number(wallet.reserved_credits)).toBe(80);
    }finally{await f.db.close();}
  },20000);
  it('consumes live access once and prevents extension after key revocation',async()=>{
    const f=await fixture();try{
      const r=await f.claim('live');await f.reserve(r.id,10);
      await f.db.query("insert into ai_resources(id,request_id,organization_id,project_id,key_id,kind,expires_at,metadata) values($1,$1,$2,$3,$4,'live',now()+interval '1 minute','{\"ticket_hash\":\"secret\"}')",[r.id,f.org,f.project,f.key]);
      await f.db.query("select consume_ai_live_ticket($1,'secret')",[r.id]);
      await expect(f.db.query("select consume_ai_live_ticket($1,'secret')",[r.id])).rejects.toThrow('ai_key_inactive');
      await f.db.query('select extend_ai_reservation($1,20)',[r.id]);
      await f.db.query("update ai_api_keys set status='revoked' where id=$1",[f.key]);
      await expect(f.db.query('select extend_ai_reservation($1,30)',[r.id])).rejects.toThrow('ai_key_inactive');
      await f.db.exec('set role authenticated');
      await expect(f.db.query('select * from ai_operation_rates')).rejects.toThrow('permission denied');
      await expect(f.db.query('select extend_ai_reservation($1,30)',[r.id])).rejects.toThrow('permission denied');
    }finally{await f.db.close();}
  },20000);
});

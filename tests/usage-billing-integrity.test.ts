import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import { aiDatabaseFixture } from "./helpers/ai-database";
import type * as Metering from "../src/lib/billing/metered-usage";
import type * as Gemini from "../src/lib/billing/gemini-metering";
import type * as CostCenter from "../src/lib/billing/cost-center";
import type * as Voice from "../src/lib/voice/tts";
import type * as Agenda from "../src/lib/automations/agenda-agent";
import type * as Reconciliation from "../src/lib/billing/usage-reconciliation";

function meteringHarness(overrides = {}) {
  return serverModuleHarness<typeof Metering>("src/lib/billing/metered-usage.ts", {
    "@/lib/billing/credit-economics": { CONNECTY_CREDIT_UNIT_BRL: .01 },
    "@/lib/billing/cost-center": { calculateGrossMargin: (cost: number, revenue: number) => revenue-cost, ...overrides },
  });
}

describe("usage billing integrity", () => {
  it("reads tariffs beyond the first REST page", async () => {
    const rates=Array.from({length:1001},(_,index)=>({id:String(index).padStart(4,"0"),cost_center_id:"cc",feature_id:"f",model_id:"m",active:true,
      unit:"input_token",provider_cost_per_unit:.001,connecty_price_per_unit:index===1000?.02:.01,minimum_charge_credits:0,
      effective_from:index===1000?"2026-01-01":"2025-01-01",effective_to:null}));
    const db=commerceDatabase({provider_cost_centers:[{id:"cc",provider:"gemini"}],
      provider_features:[{id:"f",cost_center_id:"cc",feature_code:"chat_completion",enabled:true,billable:true}],
      provider_models:[{id:"m",cost_center_id:"cc",provider_model_id:"test"}],billing_rates:rates});
    const selected=await meteringHarness().resolveActiveBillingRates(db.client as never,{provider:"gemini",featureCode:"chat_completion",modelId:"test",planCode:null});
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({id:"1000",connectyPricePerUnit:.02});
  });

  it("prices against the wallet owner's plan while retaining the consuming organization", async () => {
    const debit=vi.fn().mockResolvedValue({id:"usage"});
    const db=commerceDatabase({organizations:[{id:"child",plan_code:"starter",billing_organization_id:"owner"},{id:"owner",plan_code:"pro",status:"active"}],
      provider_cost_centers:[{id:"cc",provider:"gemini"}],provider_features:[{id:"f",cost_center_id:"cc",feature_code:"chat_completion",enabled:true,billable:true}],
      provider_models:[{id:"m",cost_center_id:"cc",provider_model_id:"test"}],billing_rates:[
        {id:"generic",cost_center_id:"cc",feature_id:"f",model_id:"m",unit:"input_token",active:true,connecty_price_per_unit:.01,provider_cost_per_unit:.001},
        {id:"contract",cost_center_id:"cc",feature_id:"f",model_id:"m",unit:"input_token",active:true,plan_code:"pro",connecty_price_per_unit:.02,provider_cost_per_unit:.001},
      ]});
    await meteringHarness({recordUsageAndDebitCredits:debit}).meterUsageEvent(db.client as never,
      {organizationId:"child",provider:"gemini",featureCode:"chat_completion",modelId:"test",inputTokens:100});
    expect(debit.mock.calls[0][1]).toMatchObject({organizationId:"child",connectyChargeCredits:2,
      metadata:{metering:{billingOrganizationId:"owner",planCode:"pro"}}});
  });

  it("authenticates agenda interpretation and meters it before applying the decision", async () => {
    const db=commerceDatabase({customer_agenda_settings:[{organization_id:"org",enabled:true}]});
    const meter=vi.fn().mockResolvedValue({usageEventId:"usage"});
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"intent":"none"}'}]}}],usageMetadata:{promptTokenCount:20,candidatesTokenCount:5}})});
    const agenda=serverModuleHarness<typeof Agenda>("src/lib/automations/agenda-agent.ts",{
      "./agenda":{getAgenda:async()=>({bookings:[],resources:[],settings:{timezone:"America/Sao_Paulo"}})},
      "@/lib/billing/gemini-metering":{meterGeminiGenerationUsage:meter},
    },[],{fetch:fetchMock});
    await agenda.processAgendaTurn({client:db.client as never,organizationId:"org",leadId:"lead",agentId:"agent",runId:"run",conversationId:"conversation",
      credentials:{apiKey:"test-key",model:"test-model"} as never,userText:"Quero agendar",messages:[],assertCurrent:async()=>{}});
    expect(fetchMock.mock.calls[0][1].headers["x-goog-api-key"]).toBe("test-key");
    expect(meter.mock.calls[0][0]).toMatchObject({organizationId:"org",requestId:"agenda:run:intent",featureCode:"chat_completion"});
    expect(db.tables.customer_agenda_turns).toHaveLength(1);
  });

  it("reconciles only marked pending debits and backs off on insufficient funds", async () => {
    const past=new Date(Date.now()-60000).toISOString();
    const db=commerceDatabase({usage_events:[
      {id:"retry",organization_id:"org",provider:"gemini",status:"pending",billing_mode:"customer_billable",connecty_charge_credits:5,debit_retry_at:past},
      {id:"history",organization_id:"org",status:"completed",billing_mode:"customer_billable",connecty_charge_credits:0,debit_retry_at:null},
      {id:"unpriced",organization_id:"org",status:"pending",billing_mode:"customer_billable",connecty_charge_credits:0,debit_retry_at:null},
    ]});
    const debit=vi.fn().mockRejectedValue(new Error("insufficient"));
    const r=serverModuleHarness<typeof Reconciliation>("src/lib/billing/usage-reconciliation.ts",{"./cost-center":{debitCredits:debit}});
    expect(await r.reconcileUsageDebits(db.client as never)).toEqual({completed:0,pending:1});
    expect(debit).toHaveBeenCalledTimes(1);
    expect(debit.mock.calls[0][1]).toMatchObject({usageEventId:"retry",amountCredits:5});
    expect(Date.parse(String(db.tables.usage_events[0].debit_retry_at))).toBeGreaterThan(Date.now());
  });

  it("uses measured TTS usage and PCM duration only when provider measurement is absent", async () => {
    const m=meteringHarness();
    const pcm=Buffer.alloc(48000).toString("base64");
    const response=(usageMetadata?: object)=>({ok:true,status:200,text:async()=>JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:"audio/L16",data:pcm}}]}}],usageMetadata})});
    const fetchMock=vi.fn().mockResolvedValueOnce(response({promptTokenCount:40,candidatesTokenCount:25})).mockResolvedValueOnce(response());
    const t=serverModuleHarness<{requestGeminiPcmAudio:(input:object)=>Promise<{usage:object}>}>("src/lib/gemini/tts.ts",
      {"@/lib/billing/metered-usage":m},["requestGeminiPcmAudio"],{fetch:fetchMock});
    const measured=await t.requestGeminiPcmAudio({apiKey:"test",modelId:"tts",voiceName:"Kore",text:"Olá"});
    expect(measured.usage).toEqual({inputTokens:40,outputTokens:25,totalTokens:65,estimated:false});
    const fallback=await t.requestGeminiPcmAudio({apiKey:"test",modelId:"tts",voiceName:"Kore",text:"Olá"});
    expect(fallback.usage).toMatchObject({outputTokens:25,estimated:true});
  });

  it("includes reasoning and tool processing once, without adding cached input twice", async () => {
    const m = meteringHarness();
    const usage = m.extractGeminiUsageMetadata({usageMetadata:{promptTokenCount:100,cachedContentTokenCount:80,
      candidatesTokenCount:10,thoughtsTokenCount:50,toolUsePromptTokenCount:20,totalTokenCount:160}})!;
    expect(m.billableGeminiUnits(usage)).toEqual({inputTokens:120,outputTokens:60,totalTokens:180});
    const meter = vi.fn().mockResolvedValue({usageEventId:"usage"});
    const g = serverModuleHarness<typeof Gemini>("src/lib/billing/gemini-metering.ts", {
      "@/lib/billing/metered-usage": {...m,meterUsageEvent:meter},
    });
    await g.meterGeminiGenerationUsage({client:{} as never,featureCode:"chat_completion",usage});
    expect(meter.mock.calls[0][1]).toMatchObject({inputUnits:120,outputUnits:60,totalTokens:180});
    // Old cached records only have the raw provider field.
    expect(m.billableGeminiUnits({...usage,toolInputTokens:undefined}).inputTokens).toBe(120);
  });

  it("records missing tariffs for review instead of completing a free customer generation", async () => {
    const record = vi.fn().mockResolvedValue({id:"pending"});
    const debit = vi.fn();
    const m = meteringHarness({recordUsageEvent:record,recordUsageAndDebitCredits:debit});
    const db = commerceDatabase({organizations:[{id:"org",plan_code:"pro",status:"active"}],provider_cost_centers:[]});
    await expect(m.meterUsageEvent(db.client as never,{organizationId:"org",provider:"gemini",featureCode:"chat_completion",
      modelId:"unpriced",inputTokens:100,outputTokens:50,requestId:"request"})).rejects.toThrow("tarifa indisponível");
    expect(record.mock.calls[0][1]).toMatchObject({status:"pending",errorMessage:"billing_rate_missing",inputTokens:100,outputTokens:50});
    expect(debit).not.toHaveBeenCalled();
  });

  it("preserves a failed debit amount as pending, without erasing consumed cost", async () => {
    const db=commerceDatabase({organizations:[{id:"org",billing_organization_id:null}]});
    const client={...db.client,rpc:vi.fn().mockResolvedValue({error:{message:"wallet unavailable"}})};
    const c=serverModuleHarness<typeof CostCenter>("src/lib/billing/cost-center.ts",{
      "@/lib/billing/trial":{getOrganizationBillingAccess:vi.fn().mockResolvedValue(null)},
    });
    // Suppress trial notification reads; the actual debit boundary is exercised.
    await expect(c.recordUsageAndDebitCredits(client as never,{organizationId:"org",provider:"gemini",featureCode:"chat_completion",
      connectyChargeCredits:5,providerCost:.01,requestId:"same",metadata:{suppressTrialNotification:true}})).rejects.toThrow();
    expect(db.tables.usage_events[0]).toMatchObject({status:"pending",connecty_charge_credits:5,provider_cost:.01,connecty_revenue_estimate:0});
    expect(client.rpc).toHaveBeenCalledWith("debit_credit_wallet", expect.objectContaining({p_amount_credits:5}));
  });

  it("does not return WhatsApp audio as successfully billed after a metering failure", async () => {
    const generated={mediaId:null,audioUrl:"https://example.test/audio",objectKey:"a",text:"oi",modelId:"voice",bytesSize:48};
    const meter=vi.fn().mockRejectedValue(new Error("billing unavailable"));
    const voice=serverModuleHarness<typeof Voice>("src/lib/voice/tts.ts",{
      "@/lib/gemini/tts":{isGeminiTtsVoiceId:()=>true,generateGeminiAudio:vi.fn().mockResolvedValue(generated)},
      "@/lib/billing/metered-usage":{meterUsageEvent:meter},
    });
    await expect(voice.generateConnectyVoiceAudio({organizationId:"org",text:"oi",source:"whatsapp_agent",client:{} as never}))
      .rejects.toThrow("billing unavailable");
  });

  it("synchronizes tariffs and debits each usage once, with reservations, isolation and retries", async () => {
    const f=await aiDatabaseFixture();
    try {
      await f.db.exec(`
        alter table organizations add column billing_organization_id uuid;
        create type billing_unit as enum('input_token','output_token');
        create table provider_cost_centers(id uuid primary key default gen_random_uuid(),provider text);
        create table provider_features(id uuid primary key default gen_random_uuid(),cost_center_id uuid,feature_code text,name text,description text,unit billing_unit,enabled boolean,billable boolean,unique(cost_center_id,feature_code));
        create table provider_models(id uuid primary key default gen_random_uuid(),cost_center_id uuid,provider_model_id text);
        create table billing_rates(id uuid primary key default gen_random_uuid(),cost_center_id uuid,feature_id uuid,model_id uuid,plan_code text,unit billing_unit,provider_cost_per_unit numeric,connecty_price_per_unit numeric,margin_multiplier numeric,minimum_charge_credits numeric,currency text,effective_from timestamptz,effective_to timestamptz,active boolean,metadata jsonb default '{}');
        insert into provider_cost_centers(provider) values('gemini');
        insert into provider_features(cost_center_id,feature_code,enabled,billable) select id,'external_ai',true,true from provider_cost_centers;
        insert into provider_features(cost_center_id,feature_code,enabled,billable) select id,'chat_completion',true,true from provider_cost_centers;
        insert into provider_models(cost_center_id,provider_model_id) select id,'gemini-3.6-flash' from provider_cost_centers;
        insert into billing_rates(cost_center_id,feature_id,model_id,unit,provider_cost_per_unit,connecty_price_per_unit,minimum_charge_credits,effective_from,active)
          select m.cost_center_id,p.id,m.id,'input_token',.0000045,.0018,1,now(),true from provider_models m join provider_features p on p.feature_code='external_ai';
      `);
      await f.db.exec(readFileSync("supabase/migrations/0127_usage_billing_integrity.sql","utf8"));
      const copied=await f.db.query<{price:string}>("select connecty_price_per_unit price from billing_rates r join provider_features p on p.id=r.feature_id where p.feature_code='chat_completion'");
      expect(Number(copied.rows[0].price)).toBe(.0018);
      const usage=randomUUID();
      await f.db.query("insert into usage_events(id,organization_id,provider,feature_code,status,connecty_charge_credits,provider_cost,metadata) values($1,$2,'gemini','chat_completion','pending',5,.01,'{}')",[usage,f.org]);
      const debit=()=>f.db.query<{id:string}>("select debit_credit_wallet($1,5,'gemini',$2) id",[f.org,usage]);
      const results=await Promise.all([debit(),debit()]);
      expect(results[0].rows[0].id).toBe(results[1].rows[0].id);
      expect((await f.db.query("select * from credit_transactions where usage_event_id=$1",[usage])).rows).toHaveLength(1);
      expect(Number((await f.db.query<{balance:string}>("select balance_credits balance from credit_wallets where organization_id=$1",[f.org])).rows[0].balance)).toBe(95);
      expect((await f.db.query("select status,error_message from usage_events where id=$1",[usage])).rows[0]).toEqual({status:"completed",error_message:null});
      await f.db.query("update usage_events set status='pending',debit_retry_at=now() where id=$1",[usage]);
      await debit();
      expect((await f.db.query("select status,debit_retry_at from usage_events where id=$1",[usage])).rows[0]).toEqual({status:"completed",debit_retry_at:null});
      await expect(f.db.query("select debit_credit_wallet($1,6,'gemini',$2)",[f.org,usage])).rejects.toThrow("does not match");
      const other=randomUUID();await f.db.query("insert into organizations(id) values($1)",[other]);
      await expect(f.db.query("select debit_credit_wallet($1,5,'gemini',$2)",[other,usage])).rejects.toThrow("does not match");
      const pending=randomUUID();
      await f.db.query("insert into usage_events(id,organization_id,provider,status,connecty_charge_credits) values($1,$2,'gemini','pending',5)",[pending,f.org]);
      await f.db.query("update credit_wallets set reserved_credits=94 where organization_id=$1",[f.org]);
      await expect(f.db.query("select debit_credit_wallet($1,5,'gemini',$2)",[f.org,pending])).rejects.toThrow("active reservations");
      expect((await f.db.query("select status from usage_events where id=$1",[pending])).rows[0]).toEqual({status:"pending"});
      await f.db.exec("set role authenticated");
      await expect(debit()).rejects.toThrow("permission denied");
    } finally { await f.db.close(); }
  },30000);
});

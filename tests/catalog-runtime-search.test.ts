import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as Search from "../src/lib/sales-catalog/runtime-search";

const search = serverModuleHarness<typeof Search>("src/lib/sales-catalog/runtime-search.ts");
it("pages the same search on more options and resets for a new product question", () => {
  const messages = [{direction:"inbound",text_content:"Você tem pizza calabresa?"},{direction:"outbound",text_content:"Opções cadastradas"},{direction:"inbound",text_content:"mais opções"},{direction:"inbound",text_content:"mais opções"}];
  expect(search.catalogSearchPlan(messages)).toEqual({query:"pizza calabresa",offset:40});
  expect(search.catalogSearchPlan([...messages,{direction:"inbound",text_content:"Quero camiseta azul"}])).toEqual({query:"camiseta azul",offset:0});
});
it("fails explicitly on a catalog lookup error", async () => {
  await expect(search.searchRuntimeCatalog({rpc:async()=>({error:{message:"offline"}})} as never,{organizationId:"org",agentId:"agent",instanceId:"instance",messages:[]})).rejects.toThrow("indisponível");
});

describe("scoped complete catalog SQL", () => {
  let db:PGlite;
  const org=randomUUID(), foreign=randomUUID(), agent=randomUUID(), instance=randomUUID();
  beforeAll(async () => {
    db=new PGlite();
    await db.exec("create role anon;create role authenticated;create role service_role;create table intelligence_memory(id uuid primary key,organization_id uuid,scope text,memory_type text,title text,content text,metadata jsonb,created_at timestamptz default now(),updated_at timestamptz default now());create table sales_catalog_skus(id uuid primary key,organization_id uuid,catalog_item_id uuid,title text,sku_code text,attributes jsonb,status text);");
    await db.exec(readFileSync("supabase/migrations/0139_catalog_runtime_search.sql","utf8"));
    for(let i=0;i<105;i++) await item(`Pizza ${String(i).padStart(3,"0")}`,{},org,`2025-01-${String(1+i%28).padStart(2,"0")}T12:00:00Z`);
  },45000);
  afterAll(async()=>{await db?.close();});
  async function item(title:string,metadata={},organization=org,created="2020-01-01T12:00:00Z") {
    const id=randomUUID();
    await db.query("insert into intelligence_memory(id,organization_id,scope,memory_type,title,content,metadata,created_at) values($1,$2,'organization','sales_catalog_item',$3,'',$4,$5)",[id,organization,title,{status:"active",...metadata},created]);
    return id;
  }
  async function find(query:string,offset=0,ids:string[]=[]) {
    return (await db.query<{result:{items:Array<{id:string;title:string}>,has_more:boolean}}>("select search_runtime_catalog($1,$2,$3,$4,$5,20,$6) result",[org,agent,instance,query,offset,ids])).rows[0].result;
  }
  it("finds an old product beyond the original eighty rows and searches actual SKU attributes/code",async()=>{
    const old=await item("Calabresa tradicional");
    expect((await find("calabresa")).items.map(i=>i.id)).toContain(old);
    await db.query("insert into sales_catalog_skus values($1,$2,$3,'Grande','CAL-42',$4,'active')",[randomUUID(),org,old,{borda:"catupiry"}]);
    expect((await find("catupiry")).items.map(i=>i.id)).toEqual([old]);
    expect((await find("CAL-42")).items.map(i=>i.id)).toContain(old);
  });
  it("has stable nonoverlapping pages beyond eighty results",async()=>{
    const pages=await Promise.all([0,20,40,60,80,100].map(offset=>find("pizza",offset)));
    expect(pages[4].has_more).toBe(true);expect(pages[5].has_more).toBe(false);
    const ids=pages.flatMap(p=>p.items.map(i=>i.id));expect(ids).toHaveLength(105);expect(new Set(ids).size).toBe(105);
  });
  it("enforces tenant, agent, instance and archived boundaries including explicitly referenced IDs",async()=>{
    const elsewhere=await item("Exclusivo",{},foreign), hidden=await item("Exclusivo",{assigned_agent_ids:[randomUUID()]}), hiddenInstance=await item("Exclusivo",{whatsapp_instance_ids:[randomUUID()]}), archived=await item("Exclusivo",{status:"archived"});
    const mine=await item("Exclusivo",{agent_ids:[agent]}), ownInstance=await item("Exclusivo",{assigned_whatsapp_instance_ids:[instance]});
    const found=await find("exclusivo",0,[elsewhere,hidden,hiddenInstance,archived]);
    expect(found.items.map(i=>i.id).sort()).toEqual([mine,ownInstance].sort());
  });
  it("keeps explicitly referenced current order items without consuming the search page",async()=>{
    const saved=await item("Bebida registrada");
    const found=await find("pizza",80,[saved]);expect(found.items).toHaveLength(21);expect(found.items.at(-1)?.id).toBe(saved);
  });
});

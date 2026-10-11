import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {it,expect} from "vitest";
it("imports once, isolates tenants, preserves consent and refuses disabled forms",async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table organizations(id uuid primary key);
      create table leads(id uuid primary key default gen_random_uuid(),organization_id uuid,channel text,display_name text,source text,status text,last_event_summary text,metadata jsonb);`);
    await db.exec(readFileSync("supabase/migrations/0193_meta_lead_ads.sql","utf8"));
    const org=randomUUID(),foreign=randomUUID(),delivery=randomUUID();
    await db.query("insert into organizations values($1),($2)",[org,foreign]);
    await db.query("insert into meta_lead_forms(organization_id,page_id,form_id,name,enabled) values($1,'123','456','Teste',true)",[org]);
    await db.query("insert into meta_lead_deliveries(id,organization_id,page_id,form_id,leadgen_id) values($1,$2,'123','456','789')",[delivery,org]);
    await expect(db.query("select import_meta_lead_delivery($1,$2,'{}')",[delivery,foreign])).rejects.toThrow("Delivery not found");
    const data=JSON.stringify({display_name:"Teste",outreach_authorized:true});
    const first=await db.query("select import_meta_lead_delivery($1,$2,$3) as id",[delivery,org,data]);
    const again=await db.query("select import_meta_lead_delivery($1,$2,$3) as id",[delivery,org,data]);
    expect(again.rows).toEqual(first.rows);
    const leads=await db.query<{metadata:Record<string,unknown>;channel:string}>("select metadata,channel from leads");
    expect(leads.rows).toHaveLength(1);expect(leads.rows[0].metadata.outreach_authorized).toBe(false);expect(leads.rows[0].channel).toBe("meta_lead_ads");
    await db.query("update meta_lead_forms set enabled=false where organization_id=$1",[org]);
    const second=randomUUID();
    await db.query("insert into meta_lead_deliveries(id,organization_id,page_id,form_id,leadgen_id) values($1,$2,'123','456','790')",[second,org]);
    await expect(db.query("select import_meta_lead_delivery($1,$2,'{}')",[second,org])).rejects.toThrow("Form not enabled");
    const rights=await db.query("select has_table_privilege('authenticated','meta_lead_deliveries','SELECT') as readable,has_function_privilege('anon','import_meta_lead_delivery(uuid,uuid,jsonb)','EXECUTE') as callable");
    expect(rights.rows[0]).toEqual({readable:false,callable:false});
  }finally{await db.close();}
});

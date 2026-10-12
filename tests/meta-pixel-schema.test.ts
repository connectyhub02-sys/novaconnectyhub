import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { it,expect } from "vitest";
it("enforces tenant consent FK, idempotent events and service-only tables",async()=>{
  const db=new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create table organizations(id uuid primary key); create table sales_catalog_payment_sessions(id uuid primary key);");
    await db.exec(readFileSync("supabase/migrations/0194_meta_pixel_conversions.sql","utf8"));
    const orgA="00000000-0000-4000-8000-000000000001",orgB="00000000-0000-4000-8000-000000000002",visitor="00000000-0000-4000-8000-000000000003";
    await db.query("insert into organizations values ($1),($2)",[orgA,orgB]);
    await db.query("insert into meta_pixel_consents values ($1,$2,true,now())",[orgA,visitor]);
    const insert="insert into meta_conversion_events(organization_id,visitor_id,pixel_id,revision,event_id,event_name,event_time,payload) values($1,$2,'123',gen_random_uuid(),'event1','PageView',1,'{}')";
    await expect(db.query(insert,[orgB,visitor])).rejects.toThrow();
    await db.query(insert,[orgA,visitor]);await expect(db.query(insert,[orgA,visitor])).rejects.toThrow();
    await db.exec("set role anon");await expect(db.query("select * from meta_pixel_connections")).rejects.toThrow();
  }finally{await db.close();}
},30000);

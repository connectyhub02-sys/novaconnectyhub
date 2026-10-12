import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
let db: PGlite;
const org="11111111-1111-4111-8111-111111111111", user="22222222-2222-4222-8222-222222222222";
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
 create table auth.users(id uuid primary key); create table organizations(id uuid primary key);
 insert into auth.users values('${user}'); insert into organizations values('${org}');`);
 await db.exec(readFileSync("supabase/migrations/0195_meta_creative_studio.sql","utf8"));
},30000);
afterAll(async()=>{await db.close();});
it("keeps provider output inaccessible to browser roles",async()=>{
 for(const role of ["anon","authenticated"]){await db.exec(`set role ${role}`);
 try { await expect(db.query("select provider_response from meta_creative_jobs")).rejects.toThrow(/permission denied/); }
 finally { await db.exec("reset role"); }}
});
it("allows only one active generation per organization and reuses no request IDs",async()=>{
 const insert=`insert into meta_creative_jobs(id,organization_id,user_id,input_hash,mode,brief) values(gen_random_uuid(),'${org}','${user}','hash','analysis','{}') returning id`;
 const first=await db.query<{id:string}>(insert);
 await expect(db.query(insert)).rejects.toThrow(/unique/);
 await db.query("update meta_creative_jobs set status='completed' where id=$1",[first.rows[0].id]);
 await expect(db.query(insert)).resolves.toBeDefined();
 await expect(db.query(`insert into meta_creative_jobs select * from meta_creative_jobs where id=$1`,[first.rows[0].id])).rejects.toThrow(/unique/);
});

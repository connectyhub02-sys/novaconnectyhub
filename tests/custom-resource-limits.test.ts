import {beforeAll,afterAll,it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import type {PGlite} from "@electric-sql/pglite";
import {commercialDb} from "./helpers/commercial-db";
let db:PGlite;
const owner=randomUUID(),root=randomUUID(),child=randomUUID(),sub=randomUUID();
beforeAll(async()=>{
 db=await commercialDb();
 await db.exec(`alter table profiles add column is_platform_admin boolean default false;
 create function is_platform_admin() returns boolean language sql as $$select coalesce((select is_platform_admin from profiles where id=auth.uid()),false)$$;
 create function is_organization_member(uuid) returns boolean language sql as $$select exists(select 1 from organization_members where user_id=auth.uid() and organization_id=$1)$$;
 create table agent_registry(id uuid primary key default gen_random_uuid(),organization_id uuid,scope text,status text,metadata jsonb);
 alter table whatsapp_instances add column status text default 'connected';
 alter table billing_plans add column storage_limit_bytes bigint default 1000,add column storage_file_limit integer default 10,add column storage_image_max_bytes bigint default 100,add column storage_video_max_bytes bigint default 100,add column storage_file_max_bytes bigint default 100;
 create table storage_addon_packages(code text,storage_bytes bigint,file_limit integer,status text);
 create table organization_storage_addons(organization_id uuid,package_code text,quantity integer,status text,current_period_end timestamptz);`);
 const storage=readFileSync("supabase/migrations/0055_storage_limits_and_addons.sql","utf8");await db.exec(storage.slice(storage.indexOf("create or replace function public.get_organization_storage_entitlement"),storage.indexOf("create or replace function public.record_organization_storage_usage")));
 for(const migration of ["0107_custom_contracts","0111_custom_resource_limits"])await db.exec(readFileSync(`supabase/migrations/${migration}.sql`,"utf8"));
 await db.query("insert into auth.users(id) values($1)",[owner]);await db.query("insert into organizations(id,owner_id,plan_code,status) values($1,$2,'pro','active')",[root,owner]);
 await db.exec("insert into billing_plans(plan_code,name) values('pro','Pro')");
 await db.query("insert into organization_subscriptions(id,organization_id,plan_code,status,current_period_end,metadata) values($1,$2,'pro','active',now()+interval '1 month',$3)",[sub,root,JSON.stringify({commercial_terms:{billing_cycle:"recurring",custom_contract_id:randomUUID(),resource_limits:{organization_limit:2,agent_limit:1,whatsapp_instance_limit:1,user_limit:2,storage_limit_bytes:9000,storage_file_limit:90}}})]);
 await db.query("insert into organizations(id,owner_id,billing_organization_id,plan_code,status) values($1,$2,$3,'pro','active')",[child,owner,root]);
},60000);
afterAll(async()=>{await db?.close();});
it("shares company and agent capacities across the billing account",async()=>{
 await expect(db.query("insert into organizations(owner_id,billing_organization_id,plan_code,status) values($1,$2,'pro','active')",[owner,root])).rejects.toThrow("Limite do contrato");
 await db.query("insert into agent_registry(organization_id,scope,status,metadata) values($1,'organization','active','{\"client_created\":true}')",[child]);
 await expect(db.query("insert into agent_registry(organization_id,scope,status,metadata) values($1,'organization','active','{\"client_created\":true}')",[root])).rejects.toThrow("Limite do contrato");
 await db.query("update agent_registry set status='paused' where organization_id=$1",[child]);
 await db.query("insert into whatsapp_instances(organization_id,status) values($1,'connected')",[root]);
 await expect(db.query("insert into whatsapp_instances(organization_id,status) values($1,'connected')",[child])).rejects.toThrow("Limite do contrato");
});
it("gives a member of a child company the shared capacity without exposing another account",async()=>{
 const member=randomUUID();await db.query("insert into organization_members(organization_id,user_id) values($1,$2)",[child,member]);await db.query("select set_config('test.uid',$1,false)",[member]);
 expect((await db.query<{total_storage_limit_bytes:number;total_storage_file_limit:number}>("select total_storage_limit_bytes,total_storage_file_limit from get_organization_storage_entitlement($1)",[child])).rows[0]).toMatchObject({total_storage_limit_bytes:9000,total_storage_file_limit:90});
 expect((await db.query("select * from get_organization_storage_entitlement($1)",[randomUUID()])).rows).toEqual([]);
 await db.query("select set_config('test.uid','',false)");
});

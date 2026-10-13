import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001", customer = "00000000-0000-4000-8000-000000000002", other = "00000000-0000-4000-8000-000000000003";
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create table profiles(id uuid primary key,is_platform_admin boolean); create table organizations(id uuid primary key,status text,plan_code text); create table infra_projects(id text primary key,name text,company text,environment text,topology text,app text,supabase text,inngest text,worker text,storage text,organization_id uuid references organizations(id),client_access_enabled boolean default false); create table infra_audit(project_id text,actor text,action text,result text,reason text,before_state jsonb,after_state jsonb); insert into profiles values('${admin}',true),('${customer}',false); insert into organizations values('${customer}','active','custom'),('${other}','active','custom'); insert into infra_projects(id,name) values('vision','Vision'),('connectyhub','ConnectyHub');`);
  await db.exec(readFileSync("supabase/migrations/0204_infrastructure_customer_binding.sql", "utf8"));
}, 30000);
afterAll(() => db.close());
it("requires admin and leaves inventory unchanged on rejection", async () => {
  await expect(db.query("select infra_save_customer_binding('vision',$1,true,0,$1)", [customer])).rejects.toThrow("platform_admin_required");
  expect((await db.query("select * from infra_audit")).rows).toHaveLength(0);
});
it("atomically assigns, audits, rejects stale edits and revokes access", async () => {
  await db.query("select infra_save_customer_binding('vision',$1,true,0,$2)", [customer, admin]);
  await expect(db.query("select infra_save_customer_binding('vision',$1,true,0,$2)", [other, admin])).rejects.toThrow("binding_conflict");
  expect((await db.query("select organization_id,client_access_enabled from infra_projects where id='vision'")).rows[0]).toEqual({ organization_id: customer, client_access_enabled: true });
  await db.query("select infra_save_customer_binding('vision',null,false,1,$1)", [admin]);
  expect((await db.query("select organization_id,client_access_enabled from infra_projects where id='vision'")).rows[0]).toEqual({ organization_id: null, client_access_enabled: false });
  expect((await db.query("select * from infra_audit")).rows).toHaveLength(2);
});
it("blocks shared-platform exposure and self-service RPC invocation", async () => {
  await expect(db.query("select infra_save_customer_binding('connectyhub',$1,true,0,$2)", [customer, admin])).rejects.toThrow("shared_platform");
  await db.exec("set role authenticated");
  await expect(db.query("select infra_register_project('owned','Owned',$1)", [admin])).rejects.toThrow("permission denied");
  await db.exec("reset role");
});
it("registers inventory without automatically binding a tenant or allocating services", async () => {
  await db.query("select infra_register_project('new-project','Novo projeto',$1)", [admin]);
  expect((await db.query("select organization_id,client_access_enabled,topology from infra_projects where id='new-project'")).rows[0]).toEqual({ organization_id: null, client_access_enabled: false, topology: "unknown" });
});

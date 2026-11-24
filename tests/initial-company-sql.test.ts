import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
let db: PGlite;
const user = randomUUID();
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key, is_platform_admin boolean default false, signup_completed_at timestamptz,
      full_name text, phone_verified_at timestamptz, cpf_hash text, account_type text, document_type text, company_name text, cpf_preview text);
    create table organizations(id uuid primary key default gen_random_uuid(), name text, slug text unique, owner_id uuid,
      plan_code text,status text,created_at timestamptz default now(),metadata jsonb default '{}', billing_organization_id uuid);
    create table organization_members(id uuid default gen_random_uuid(),organization_id uuid references organizations,user_id uuid,
      role text,created_at timestamptz default now(),unique(organization_id,user_id));
    create table billing_plans(id uuid default gen_random_uuid(),plan_code text,status text,trial_days integer);
    insert into billing_plans(plan_code,status,trial_days) values('trial','active',7);
    create table billing_cycles(organization_id uuid references organizations,plan_id uuid,cycle_start timestamptz,cycle_end timestamptz,included_credits numeric,status text,metadata jsonb);
    create table grants(organization_id uuid, user_id uuid, cycle_start timestamptz, reference text);
    create table organization_subscriptions(id uuid,organization_id uuid,plan_code text,subscription_kind text,status text,current_period_end timestamptz,next_billing_at timestamptz,metadata jsonb,created_at timestamptz);
    create table platform_billing_settings(setting_key text,metadata jsonb);
    create function grant_connectyhub_trial_credits(uuid,uuid,timestamptz,text) returns uuid language plpgsql as $$
      begin insert into grants values($1,$2,$3,$4); return gen_random_uuid(); end $$;
  `);
  await db.exec(readFileSync("supabase/migrations/0227_initial_company_pf_pj.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0203_admin_contract_controls.sql", "utf8").split("revoke all on function")[0]);
});
beforeEach(async () => {
  await db.exec("truncate organization_members,organizations,grants,profiles cascade");
  await db.query("insert into profiles values($1,false,now()-interval '2 days','Pessoa',now(),'hash','person','cpf',null,null)",[user]);
});
afterAll(async () => db.close());
const create = async (name = "Nome escolhido", automatic = false) =>
  (await db.query<{company: {id: string; name: string; status: string} | null}>("select create_initial_client_company($1,$2,$3) company",[user,name,automatic])).rows[0].company;
it("PF automatic does nothing; explicit creation is atomic and idempotent, with original trial date", async () => {
  expect(await create("Pessoa",true)).toBeNull();
  const a=await create(); const b=await create("Outro nome");
  expect(b?.id).toBe(a?.id); expect(b?.name).toBe("Nome escolhido");
  expect((await db.query("select count(*)::int n from organizations")).rows).toEqual([{n:1}]);
  expect((await db.query("select count(*)::int n from grants")).rows).toEqual([{n:1}]);
  expect((await db.query("select g.cycle_start=p.signup_completed_at same from grants g join profiles p on p.id=g.user_id")).rows).toEqual([{same:true}]);
});
it("PJ automatic uses the company field and cannot rename an existing company", async () => {
  await db.exec("update profiles set account_type='company',document_type='cnpj',company_name='Loja Azul'");
  expect((await create("Nome pessoal",true))?.name).toBe("Loja Azul");
  await db.exec("update organizations set name='Nome editado'");
  expect((await create("Ignorado",true))?.name).toBe("Nome editado");
});
it("late first creation preserves expiry and grants no expired bonus", async () => {
  await db.exec("update profiles set signup_completed_at=now()-interval '30 days'");
  const company=await create();
  expect(company?.status).toBe("trial_expired");
  expect((await db.query("select * from grants")).rows).toEqual([]);
  expect((await db.query("select cycle_end < now() expired, included_credits from billing_cycles")).rows).toEqual([{expired:true,included_credits:"0"}]);
  expect((await db.query<{access:{allowed:boolean}}>("select resolve_organization_contract_access($1) access",[company!.id])).rows[0].access.allowed).toBe(false);
});
it("does not reactivate archived companies or create another trial", async () => {
  await create(); await db.exec("delete from organization_members; update organizations set status='archived'");
  await expect(create()).rejects.toThrow("EXISTING_ACCOUNT_REQUIRES_SUPPORT");
  expect((await db.query("select count(*)::int n from grants")).rows).toEqual([{n:1}]);
});
it("repairs a missing owner link without renaming or granting credits again", async () => {
  const first=await create(); await db.exec("delete from organization_members");
  expect((await create("Outra"))?.id).toBe(first?.id);
  expect((await db.query("select count(*)::int n from grants")).rows).toEqual([{n:1}]);
});
it("rejects incomplete profiles and rolls back if billing provisioning fails", async () => {
  await db.exec("update profiles set phone_verified_at=null");
  await expect(create()).rejects.toThrow("ACCOUNT_COMPLETION_REQUIRED");
  await db.exec("update profiles set phone_verified_at=now(); alter table grants add constraint reject_grant check(false)");
  try { await expect(create()).rejects.toThrow(); expect((await db.query("select * from organizations")).rows).toEqual([]); }
  finally { await db.exec("alter table grants drop constraint reject_grant"); }
});
it("denies anonymous and regular-user RPC execution", async () => {
  for(const role of ["anon","authenticated"]) {
    await db.exec(`set role ${role}`);
    try { await expect(create()).rejects.toThrow("permission denied"); } finally { await db.exec("reset role"); }
  }
  await db.exec("set role service_role");
  try { expect((await create())?.name).toBe("Nome escolhido"); } finally { await db.exec("reset role"); }
});

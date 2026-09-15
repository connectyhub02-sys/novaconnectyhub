import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
export const ids={orgA:'10000000-0000-4000-8000-000000000001',orgB:'10000000-0000-4000-8000-000000000002',admin:'20000000-0000-4000-8000-000000000001',productAdmin:'20000000-0000-4000-8000-000000000002',a:'20000000-0000-4000-8000-000000000003',b:'20000000-0000-4000-8000-000000000004',viewer:'20000000-0000-4000-8000-000000000005',pA:'30000000-0000-4000-8000-000000000001',pA2:'30000000-0000-4000-8000-000000000002',pB:'30000000-0000-4000-8000-000000000003'};
export async function managedDatabaseFixture(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 create table organizations(id uuid primary key,name text);create table organization_members(organization_id uuid references organizations,user_id uuid references auth.users,role text,primary key(organization_id,user_id));
 create table profiles(id uuid primary key,is_platform_admin boolean default false);
 create table ai_projects(id uuid primary key,organization_id uuid not null references organizations);create table voice_projects(id uuid primary key,organization_id uuid not null references organizations);
 grant select on organization_members to authenticated;
 `);
 await db.exec(readFileSync('supabase/migrations/0150_managed_projects.sql','utf8'));
 for(const user of [ids.admin,ids.productAdmin,ids.a,ids.b,ids.viewer])await db.query('insert into auth.users values($1)',[user]);
 await db.query("insert into organizations values($1,'Cliente A'),($2,'Cliente B')",[ids.orgA,ids.orgB]);
 await db.query('insert into infrastructure_admins(user_id) values($1)',[ids.admin]);
 await db.query('insert into profiles values($1,true)',[ids.productAdmin]);
 await db.query("insert into organization_members values($1,$2,'member'),($3,$4,'owner'),($1,$5,'member')",[ids.orgA,ids.a,ids.orgB,ids.b,ids.viewer]);
 await db.query("insert into managed_projects(id,organization_id,name,slug,status) values($1,$2,'Projeto A','projeto-a','active'),($3,$2,'Outro projeto A','outro-a','active'),($4,$5,'Projeto B','projeto-b','active')",[ids.pA,ids.orgA,ids.pA2,ids.pB,ids.orgB]);
 await db.query("insert into managed_project_members values($1,$2,$3,'operator'),($4,$5,$6,'operator'),($1,$2,$7,'viewer')",[ids.pA,ids.orgA,ids.a,ids.pB,ids.orgB,ids.b,ids.viewer]);
 for(const [project,hash] of [[ids.pA,'a'.repeat(64)],[ids.pB,'b'.repeat(64)]])await db.query("insert into managed_workers(project_id,key_hash,expires_at) values($1,$2,now()+interval '1 day')",[project,hash]);
 async function as(user:string,sql:string,args:unknown[]=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');try{return await db.query<Record<string,unknown>>(sql,args);}finally{await db.exec('reset role');}}
 async function service(sql:string,args:unknown[]=[]){await db.exec('set role service_role');try{return await db.query<Record<string,unknown>>(sql,args);}finally{await db.exec('reset role');}}
 return {db,as,service};
}

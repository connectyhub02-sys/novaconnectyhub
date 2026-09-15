import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,lstat,realpath,readdir,rm,chmod,chown} from 'node:fs/promises';
import {resolve,join,dirname,basename,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export const here=dirname(fileURLToPath(import.meta.url));
export const repo=resolve(here,'../..');
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const json=async p=>JSON.parse(await readFile(p,'utf8'));
export const packageFiles=['Dockerfile','Dockerfile.dockerignore','compose.review.yml','lib.mjs','runner.mjs','harness.mjs'].map(p=>`services/managed-rehearsal/${p}`).concat(['0150_managed_projects.sql','0151_managed_objects.sql','0152_managed_inngest_bindings.sql','0153_managed_persistent_alerts.sql'].map(p=>`supabase/migrations/${p}`),['worker.mjs','gateway.mjs','telemetry-gateway.mjs','telemetry-gateway-main.mjs'].map(p=>`services/managed-worker/${p}`),['main.mjs','server.mjs','protocol.mjs','disk-store.mjs'].map(p=>`services/managed-objects/${p}`));
export async function sourceManifest(){return Object.fromEntries(await Promise.all(packageFiles.map(async p=>[p,hash(await readFile(join(repo,p)))])));}
export function assert(value,message){if(!value)throw Error(message);}
export const hex=()=>randomBytes(32).toString('hex');
export const uuid=v=>{assert(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),'Invalid fixture UUID');return v;};
export function jwt(secret,role,expires){const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const p=Buffer.from(JSON.stringify({role,aud:'authenticated',exp:expires})).toString('base64url');return `${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;}
export async function noSymlink(path){const absolute=resolve(path);let current=absolute;while(true){assert(!(await lstat(current)).isSymbolicLink(),'Symlink path refused');if(dirname(current)===current)break;current=dirname(current);}assert(await realpath(absolute)===absolute,'Non-canonical path');return absolute;}
export async function marker(root){root=await noSymlink(root);const m=await json(join(root,'manifest.json'));uuid(m.id);assert(m.kind==='connectyhub-managed-rehearsal-v1'&&m.root===root&&basename(root)===`managed-rehearsal-${m.id}`,'Invalid rehearsal ownership marker');assert(m.project===`connectyhub-managed-rehearsal-${m.id.replaceAll('-','')}`,'Invalid project scope');return m;}
export async function treeSafe(path){await noSymlink(path);for(const item of await readdir(path,{withFileTypes:true})){assert(!item.isSymbolicLink(),'Symlink in disposable tree');if(item.isDirectory())await treeSafe(join(path,item.name));}}
export async function fileManifest(root,relative=''){await noSymlink(join(root,relative));const out=[];for(const item of (await readdir(join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){assert(!item.isSymbolicLink(),'Unsafe backup entry');const p=join(relative,item.name);if(item.isDirectory())out.push(...await fileManifest(root,p));else{const bytes=await readFile(join(root,p));assert(bytes.length<=21*1024*1024,'Unexpected fixture size');out.push({path:p.replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)});}}return out;}
export async function removeOwnedChild(root,child){await marker(root);assert(['data','restore','backup','secrets','inputs'].includes(child),'Non-disposable child');const target=resolve(root,child);assert(target.startsWith(root+sep),'Cleanup escaped root');try{await treeSafe(target);}catch(e){if(e.code==='ENOENT')return;throw e;}await rm(target,{recursive:true});}
export async function prepare(parent){parent=await noSymlink(parent);const id=randomUUID(),root=join(parent,`managed-rehearsal-${id}`);await mkdir(root,{mode:0o700});
 const created=new Date().toISOString(),expires=Math.floor(Date.now()/1000)+86400;
 const m={kind:'connectyhub-managed-rehearsal-v1',id,root,project:`connectyhub-managed-rehearsal-${id.replaceAll('-','')}`,created,expires,source:repo};
 await writeFile(join(root,'manifest.json'),JSON.stringify(m,null,2),{mode:0o600,flag:'wx'});
 await writeFile(join(root,'source-manifest.json'),JSON.stringify(await sourceManifest(),null,2),{mode:0o600,flag:'wx'});
 for(const d of ['data','data/postgres','data/objects','restore','restore/postgres','restore/objects','backup','secrets','inputs','evidence'])await mkdir(join(root,d),{recursive:true,mode:0o700});
 const signing=hex();const secrets={'database-password':hex(),'auth-password':hex(),'rest-password':hex(),'jwt-secret':signing,'service-key':jwt(signing,'service_role',expires),'worker-key':`mpw_${hex()}`,'worker-b-key':`mpw_${hex()}`,'telemetry-key':hex(),'object-key':hex()};
 for(const [name,value]of Object.entries(secrets))await writeFile(join(root,'secrets',name),value+'\n',{mode:0o444,flag:'wx'});
 const accounts=Object.fromEntries(['admin','productAdmin','a','b'].map(k=>[k,{email:`${k.toLowerCase()}@managed-fixture.example`,password:hex()}]));
 await writeFile(join(root,'secrets','accounts.json'),JSON.stringify(accounts),{mode:0o444,flag:'wx'});
 await writeFile(join(root,'inputs','auth.env'),`DATABASE_URL=postgresql://supabase_auth_admin:${secrets['auth-password']}@database:5432/managed_rehearsal?sslmode=disable\nGOTRUE_JWT_SECRET=${signing}\n`,{mode:0o600,flag:'wx'});
 await writeFile(join(root,'inputs','rest.env'),`PGRST_DB_URI=postgresql://authenticator:${secrets['rest-password']}@database:5432/managed_rehearsal\nPGRST_JWT_SECRET=${signing}\n`,{mode:0o600,flag:'wx'});
 if(process.platform==='linux'&&process.getuid()===0){for(const path of ['data/postgres','restore/postgres'])await chown(join(root,path),70,70);for(const path of ['data/objects','restore/objects','evidence'])await chown(join(root,path),1000,1000);}
 return m;
}
export async function secret(root,name){assert(/^[a-z-]+$/.test(name),'Invalid secret filename');return (await readFile(join(root,'secrets',name),'utf8')).trim();}
export async function rolesSql(root,{restore=false}={}){const m=await marker(root),auth=await secret(root,'auth-password'),rest=await secret(root,'rest-password');for(const v of [auth,rest])assert(/^[a-f0-9]{64}$/.test(v),'Invalid fixture password');
 return `BEGIN;
DO $$ BEGIN IF current_database()<>'managed_rehearsal' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE; END IF; END $$;
ALTER ROLE authenticator PASSWORD '${rest}'; ALTER ROLE supabase_auth_admin PASSWORD '${auth}';
GRANT anon,authenticated,service_role TO authenticator; GRANT CONNECT ON DATABASE managed_rehearsal TO authenticator,supabase_auth_admin; GRANT CREATE ON DATABASE managed_rehearsal TO supabase_auth_admin; ALTER ROLE supabase_auth_admin SET search_path=auth;
${restore?'':`CREATE SCHEMA IF NOT EXISTS rehearsal_meta; CREATE TABLE IF NOT EXISTS rehearsal_meta.owner(id uuid PRIMARY KEY); DO $$ BEGIN IF EXISTS(SELECT FROM rehearsal_meta.owner WHERE id<>'${m.id}') THEN RAISE EXCEPTION 'Foreign rehearsal'; END IF; END $$; INSERT INTO rehearsal_meta.owner VALUES('${m.id}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS rehearsal_meta.migrations(name text PRIMARY KEY,sha256 text NOT NULL); CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;`}
COMMIT;`;
}
export const baseSql=`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;
CREATE TABLE IF NOT EXISTS public.organizations(id uuid PRIMARY KEY,name text);
CREATE TABLE IF NOT EXISTS public.organization_members(organization_id uuid REFERENCES public.organizations,user_id uuid REFERENCES auth.users,role text,PRIMARY KEY(organization_id,user_id));
CREATE TABLE IF NOT EXISTS public.profiles(id uuid PRIMARY KEY,is_platform_admin boolean DEFAULT false);
CREATE TABLE IF NOT EXISTS public.ai_projects(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations);
CREATE TABLE IF NOT EXISTS public.voice_projects(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations);
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role; GRANT SELECT ON public.organization_members TO authenticated;`;
export const ids={orgA:'10000000-0000-4000-8000-000000000001',orgB:'10000000-0000-4000-8000-000000000002',pA:'30000000-0000-4000-8000-000000000001',pB:'30000000-0000-4000-8000-000000000003'};
export async function seedSql(root){const users=await json(join(root,'evidence','users.json'));for(const value of Object.values(users))uuid(value);assert(Object.keys(users).sort().join(',')==='a,admin,b,productAdmin','Unexpected user set');const {admin,productAdmin,a,b}=users;const ha=hash(await secret(root,'worker-key')),hb=hash(await secret(root,'worker-b-key'));
 return `BEGIN; DO $$ BEGIN IF (SELECT count(*) FROM auth.users WHERE (id,email) IN (('${admin}','admin@managed-fixture.example'),('${productAdmin}','productadmin@managed-fixture.example'),('${a}','a@managed-fixture.example'),('${b}','b@managed-fixture.example')))<>4 THEN RAISE EXCEPTION 'Unexpected Auth fixture'; END IF; END $$;
INSERT INTO public.organizations VALUES('${ids.orgA}','Fictional A'),('${ids.orgB}','Fictional B') ON CONFLICT DO NOTHING;
INSERT INTO public.infrastructure_admins(user_id) VALUES('${admin}') ON CONFLICT DO NOTHING; INSERT INTO public.profiles VALUES('${productAdmin}',true) ON CONFLICT(id) DO UPDATE SET is_platform_admin=true;
INSERT INTO public.organization_members VALUES('${ids.orgA}','${a}','member'),('${ids.orgB}','${b}','owner') ON CONFLICT DO NOTHING;
INSERT INTO public.managed_projects(id,organization_id,name,slug,status) VALUES('${ids.pA}','${ids.orgA}','Fictional A','fictional-a','active'),('${ids.pB}','${ids.orgB}','Fictional B','fictional-b','active') ON CONFLICT DO NOTHING;
INSERT INTO public.managed_project_members VALUES('${ids.pA}','${ids.orgA}','${a}','operator'),('${ids.pB}','${ids.orgB}','${b}','operator') ON CONFLICT DO NOTHING;
INSERT INTO public.managed_workers(project_id,key_hash,expires_at) VALUES('${ids.pA}','${ha}',now()+interval '2 hours'),('${ids.pB}','${hb}',now()+interval '2 hours') ON CONFLICT(key_hash) DO NOTHING;
COMMIT;`;
}

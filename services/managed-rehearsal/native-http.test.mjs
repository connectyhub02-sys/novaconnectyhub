// Optional Windows-native compatibility check; no Docker/Linux/network isolation claim.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {prepare,rolesSql,seedSql,secret,ids,repo,uuid,hash,fileManifest} from './lib.mjs';
import {command,migrations} from './runner.mjs';
const enabled=process.env.REHEARSAL_PG_BIN&&process.env.REHEARSAL_AUTH_BIN&&process.env.REHEARSAL_REST_BIN;
test('native HTTP harness with real Auth/REST/database/gateways/objects and offline restore',{skip:!enabled,timeout:300000},async()=>{
 const parent=await mkdtemp(join(tmpdir(),'managed-rehearsal-http-')),m=await prepare(parent),bin=process.env.REHEARSAL_PG_BIN,exe=n=>join(bin,n+(process.platform==='win32'?'.exe':'')),children=[];let pgStarted=false;const ports={},portSet=new Set();
 for(const name of ['database','auth','kong','managed-gateway','objects','telemetry-gateway']){do{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));ports[name]=server.address().port;await new Promise(r=>server.close(r));}while(portSet.has(ports[name]));portSet.add(ports[name]);}
 const url=n=>`http://127.0.0.1:${ports[n]}/`;const envBase={...process.env,PATH:bin+(process.platform==='win32'?';':':')+process.env.PATH};
 function start(file,args,env){const p=spawn(file,args,{env:{...envBase,...env},stdio:['ignore','ignore','ignore'],windowsHide:true});children.push(p);return p;}
 async function stop(p){if(p.exitCode!==null||p.signalCode!==null)return;await new Promise((r,j)=>{const t=setTimeout(()=>{p.kill('SIGKILL');j(Error('Native service stop deadline'));},10000);p.once('exit',()=>{clearTimeout(t);r();});p.kill();});}
 const sql=(text,db='managed_rehearsal')=>command(exe('psql'),['-X','-h','127.0.0.1','-p',String(ports.database),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-q','-t','-A'],{input:text});
 const dc=async(_args,options)=>sql(options.input);
 try{
  const data=join(m.root,'data/postgres');await command(exe('initdb'),['-D',data,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8'],{timeout:30000});pgStarted=true;await command(exe('pg_ctl'),['start','-D',data,'-l',join(m.root,'evidence/postgres.log'),'-o',`-h 127.0.0.1 -p ${ports.database} -c shared_buffers=32MB -c max_connections=20`],{timeout:30000,exitOnly:true});await sql('CREATE DATABASE managed_rehearsal;','postgres');await sql(await rolesSql(m.root));
  const signing=await secret(m.root,'jwt-secret');
  function auth(){return start(process.env.REHEARSAL_AUTH_BIN,[],{GOTRUE_DB_DRIVER:'postgres',DATABASE_URL:`postgresql://supabase_auth_admin:${secrets.auth}@127.0.0.1:${ports.database}/managed_rehearsal?sslmode=disable`,GOTRUE_DB_NAMESPACE:'auth',GOTRUE_API_HOST:'127.0.0.1',PORT:String(ports.auth),API_EXTERNAL_URL:url('auth'),GOTRUE_SITE_URL:'http://fixture.invalid',GOTRUE_JWT_SECRET:signing,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_EXTERNAL_PHONE_ENABLED:'false',GOTRUE_LOG_LEVEL:'error'});}
  const secrets={auth:await secret(m.root,'auth-password'),rest:await secret(m.root,'rest-password')};let authP=auth();
  const aliasRoot=join(m.root,'inputs/native-secrets');await mkdir(aliasRoot);for(const [a,b]of Object.entries({database_service_key:'service-key',project_worker_key:'worker-key',worker_b_key:'worker-b-key',telemetry_key:'telemetry-key',object_signing_key:'object-key',fixture_accounts:'accounts.json'}))await writeFile(join(aliasRoot,a),await readFile(join(m.root,'secrets',b)),{mode:0o600});
  const loopback=Object.fromEntries(Object.keys(ports).filter(n=>n!=='database').map(n=>[n,url(n)]));const results=[];
  async function harness(phase){try{const result=await command(process.execPath,[join(repo,'services/managed-rehearsal/harness.mjs'),phase],{env:{REHEARSAL_LOCAL_EVIDENCE:join(m.root,'evidence'),REHEARSAL_LOCAL_SECRETS:aliasRoot,REHEARSAL_LOOPBACK_MAP:JSON.stringify(loopback)},timeout:120000});results.push(JSON.parse(result));}catch(e){try{const r=JSON.parse(await readFile(join(m.root,`evidence/result-${phase}.json`)));throw Error(`Harness ${phase}: ${r.failure}`);}catch(inner){if(inner.code==='ENOENT')throw e;throw inner;}}}
  await harness('users');await migrations(m,dc);await sql(await seedSql(m.root));
  function rest(){return start(process.env.REHEARSAL_REST_BIN,[],{PGRST_DB_URI:`postgresql://authenticator:${secrets.rest}@127.0.0.1:${ports.database}/managed_rehearsal`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:signing,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(ports.kong),PGRST_DB_POOL:'3'});}
  let restP=rest();const shared={MANAGED_DATABASE_REST_URL:url('kong'),MANAGED_DATABASE_KEY_FILE:join(m.root,'secrets/service-key'),MANAGED_GATEWAY_BIND:'127.0.0.1'};
  let gate=start(process.execPath,[join(repo,'services/managed-worker/gateway.mjs')],{...shared,PORT:String(ports['managed-gateway'])});
  let tele=start(process.execPath,[join(repo,'services/managed-worker/telemetry-gateway-main.mjs')],{...shared,PORT:String(ports['telemetry-gateway']),MANAGED_TELEMETRY_KEY_FILE:join(m.root,'secrets/telemetry-key')});
  function objects(root){return start(process.execPath,[join(repo,'services/managed-objects/main.mjs')],{MANAGED_OBJECT_ROOT:root,MANAGED_OBJECT_SECRET_FILE:join(m.root,'secrets/object-key'),MANAGED_OBJECT_BIND:'127.0.0.1',PORT:String(ports.objects)});}
  let obj=objects(join(m.root,'data/objects'));await harness('exercise');const lease=JSON.parse(await readFile(join(m.root,'evidence/lease.json')));await sql(`UPDATE managed_jobs SET lease_until=now()-interval '1 second' WHERE id='${uuid(lease.id)}';`);await harness('expired');
  const worker=start(process.execPath,[join(repo,'services/managed-worker/worker.mjs')],{MANAGED_GATEWAY_URL:url('managed-gateway')+'api/managed-workers',MANAGED_WORKER_KEY_FILE:join(m.root,'secrets/worker-key')});await harness('worker');await stop(worker);await harness('load');
  const u=JSON.parse(await readFile(join(m.root,'evidence/users.json')));await sql(`DELETE FROM organization_members WHERE user_id='${uuid(u.a)}'; UPDATE managed_workers SET enabled=false WHERE project_id='${ids.pA}';`);await harness('revoked');await sql(`INSERT INTO organization_members VALUES('${ids.orgA}','${uuid(u.a)}','member'); UPDATE managed_workers SET enabled=true WHERE project_id='${ids.pA}';`);
  for(const p of [authP,restP,gate,tele,obj])await stop(p);
  const dump=join(m.root,'backup/database.dump');await command(exe('pg_dump'),['-h','127.0.0.1','-p',String(ports.database),'-U','postgres','-d','managed_rehearsal','-Fc'],{outputFile:dump,maxBytes:64*1024*1024});await cp(join(m.root,'data/objects'),join(m.root,'restore/objects'),{recursive:true,errorOnExist:true,force:false});assert.deepEqual(await fileManifest(join(m.root,'data/objects')),await fileManifest(join(m.root,'restore/objects')));
  // Preserve original database under an explicit fixture name; restore into a new empty database.
  await sql('ALTER DATABASE managed_rehearsal RENAME TO managed_rehearsal_original;','postgres');await sql('CREATE DATABASE managed_rehearsal;','postgres');await command(exe('pg_restore'),['-h','127.0.0.1','-p',String(ports.database),'-U','postgres','-d','managed_rehearsal','--clean','--if-exists','--exit-on-error','--single-transaction',dump]);
  authP=auth();restP=rest();obj=objects(join(m.root,'restore/objects'));await harness('restored');
  const report={native_http_passed:true,checks:results.reduce((n,r)=>n+r.checks,0),phases:results,linux_containers_executed:false,network_isolation_tested:false,pressure_tmpfs_tested:false,production_mutations:0,restoration:'new PostgreSQL database and new objects directory, original preserved during verification'};
  await writeFile(join(repo,'docs/evidencias/managed-rehearsal-native-2026-09-15.json'),JSON.stringify(report,null,2)+'\n');
 }finally{for(const p of children.reverse())await stop(p);if(pgStarted)await command(exe('pg_ctl'),['stop','-D',join(m.root,'data/postgres'),'-m','fast'],{timeout:30000});assert.ok(resolve(parent).startsWith(resolve(tmpdir())));await rm(parent,{recursive:true,force:true});}
});

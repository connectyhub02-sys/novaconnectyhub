// Runs inside the isolated, resource-limited executor. No provider calls or Inngest.
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createConnection} from 'node:net';
import {setTimeout as pause} from 'node:timers/promises';
import {ids,hash,assert} from './lib.mjs';
import {signObjectCapability} from '../managed-objects/protocol.mjs';
const phase=process.argv[2],evidence=process.env.REHEARSAL_LOCAL_EVIDENCE??'/evidence',secretRoot=process.env.REHEARSAL_LOCAL_SECRETS??'/run/secrets';
const local=process.env.REHEARSAL_LOOPBACK_MAP?JSON.parse(process.env.REHEARSAL_LOOPBACK_MAP):null;
if(local){for(const [name,base]of Object.entries(local)){assert(['auth','kong','managed-gateway','objects','telemetry-gateway'].includes(name),'Unknown local endpoint');const u=new URL(base);assert(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&Number(u.port)>1024&&u.pathname==='/'&&!u.username&&!u.password&&!u.search,'Loopback-only native test endpoint required');}}
const key=async name=>(await readFile(`${secretRoot}/${name}`,'utf8')).trim();
const service=await key('database_service_key'),worker=await key('project_worker_key'),workerB=await key('worker_b_key'),objectKey=await key('object_signing_key'),telemetry=await key('telemetry_key');
const accounts=JSON.parse(await readFile(`${secretRoot}/fixture_accounts`,'utf8'));
const checks=[];function check(v,label){assert(v,label);checks.push(label);}
async function request(url,{method='GET',token,body,raw}={}){if(local){const u=new URL(url);assert(local[u.hostname],'Unmapped native endpoint refused');url=new URL(u.pathname+u.search,local[u.hostname]);}const r=await fetch(url,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},body:raw??(body?JSON.stringify(body):undefined),redirect:'error',signal:AbortSignal.timeout(10000)});const bytes=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(bytes.toString());}catch{data=undefined;}return {status:r.status,ok:r.ok,data,bytes};}
const rest=(path,token,body,method=body?'POST':'GET')=>{if(path.startsWith('managed_jobs?')&&!path.includes('select='))path+='&select=id,status';return request(`http://kong:3000/${path}`,{token,body,method});};
const rpc=(name,token,body)=>rest(`rpc/${name}`,token,body);
const gateway=(body,token=worker)=>request('http://managed-gateway:3080/api/managed-workers',{token,body,method:'POST'});
async function ready(url){for(let i=0;i<120;i++){try{if((await request(url)).ok)return;}catch{}await pause(500);}throw Error('Service readiness deadline');}
async function login(name){const r=await request('http://auth:9999/token?grant_type=password',{method:'POST',body:accounts[name]});check(r.ok&&r.data.access_token,`password login ${name}`);return r.data;}
async function sessions(){await ready('http://auth:9999/health');return Object.fromEntries(await Promise.all(Object.keys(accounts).map(async k=>[k,await login(k)])));}
async function save(name,value){await writeFile(`${evidence}/${name}.json`,JSON.stringify(value,null,2),{mode:0o600});}
const load=async name=>JSON.parse(await readFile(`${evidence}/${name}.json`,'utf8'));
async function object(method,object,bytes,project=ids.pA,tokenOverride){const claim={method,object,project,bytes:bytes.length,sha256:hash(bytes),expires:Date.now()+30000};return request(`http://objects:3081/objects/${project}/${object}`,{method,token:tokenOverride??signObjectCapability(claim,objectKey),raw:method==='PUT'?bytes:undefined});}
async function egress(){if(local)return;const connected=await new Promise(resolve=>{const socket=createConnection({host:'1.1.1.1',port:443});let done=false;const end=v=>{if(done)return;done=true;socket.destroy();resolve(v);};socket.setTimeout(2000,()=>end(false));socket.once('connect',()=>end(true));socket.once('error',()=>end(false));});check(!connected,'external TCP unavailable (single non-production probe)');}
try{
 if(phase==='health'){await ready('http://auth:9999/health');check(true,'official Linux Auth healthy');}
 else if(phase==='users'){
  await ready('http://auth:9999/health');const users={};
  for(const [name,account]of Object.entries(accounts)){const r=await request('http://auth:9999/admin/users',{method:'POST',token:service,body:{...account,email_confirm:true}});check(r.ok&&r.data.id,`create fictional ${name}`);users[name]=r.data.id;}
  await save('users',users);
 }else if(phase==='exercise'){
  await ready('http://kong:3000/');await ready('http://managed-gateway:3080/health');await egress();const s=await sessions(),a=s.a.access_token,b=s.b.access_token,admin=s.admin.access_token;
  check((await rest('managed_projects?select=id',a)).data?.[0]?.id===ids.pA,'A project scope');check((await rest('managed_projects?select=id',b)).data?.[0]?.id===ids.pB,'B project scope');
  check((await rpc('is_infrastructure_admin',s.productAdmin.access_token,{})).data===false,'product admin is not infrastructure admin');check((await rpc('is_infrastructure_admin',admin,{})).data===true,'explicit infrastructure admin');
  check((await rest('managed_projects','malformed')).status===401,'invalid JWT denied');check((await rest('managed_workers',admin)).status===403,'admin cannot read worker secret hashes');
  const refresh=await request('http://auth:9999/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:s.b.refresh_token}});check(refresh.ok&&refresh.data.access_token,'real refresh');check((await request('http://auth:9999/user',{token:refresh.data.access_token})).ok,'refreshed session valid');
  check((await rest('managed_records',a,{project_id:ids.pA,organization_id:ids.orgA,collection:'notes',data:{text:'fictional Linux rehearsal'}})).ok,'record persisted');
  check((await rest('managed_records',b)).data?.length===0,'cross-client record invisible');check((await rest('managed_records',b,{project_id:ids.pA,organization_id:ids.orgA,collection:'notes',data:{text:'denied'}})).status===403,'cross-client write denied');
  check((await rpc('managed_put_file',a,{p_project:ids.pA,p_name:'oversized',p_base64:Buffer.alloc(1048577).toString('base64')})).status>=400,'database file 1MiB limit');
  const objects=[];for(const size of [0,1024,1048576]){
   const id=randomUUID(),bytes=Buffer.alloc(size,65),reserve={p_project:ids.pA,p_object:id,p_name:`fixture-${size}.bin`,p_bytes:size,p_sha256:hash(bytes)};
   check((await rpc('managed_object_reserve',a,reserve)).ok,`reserve ${size}`);check((await rpc('managed_object_complete',a,{p_project:ids.pA,p_object:id,p_deleted:false})).status>=400,'client cannot finalize');
   check((await object('PUT',id,bytes)).ok,`sidecar put ${size}`);check((await object('PUT',id,bytes)).ok,'same bytes retry');
   check((await rpc('managed_object_complete',service,{p_project:ids.pA,p_object:id,p_deleted:false})).data===true,'service finalizes once');check((await rpc('managed_object_complete',service,{p_project:ids.pA,p_object:id,p_deleted:false})).data===true,'finalization idempotent');
   check((await object('GET',id,bytes)).bytes.equals(bytes),'bytes round trip');
   const cap=signObjectCapability({method:'GET',project:ids.pA,object:id,bytes:size,sha256:hash(bytes),expires:Date.now()+30000},objectKey);check((await object('GET',id,bytes,ids.pB,cap)).status===403,'capability cannot cross project');objects.push({id,size});
  }
  check((await rest('managed_objects',b)).data?.length===0,'catalog invisible to B');
  const dead=objects[0];check((await rpc('managed_object_delete_begin',a,{p_project:ids.pA,p_object:dead.id})).ok,'begin deletion');check((await object('DELETE',dead.id,Buffer.alloc(0))).ok,'tombstone persisted');check((await rpc('managed_object_complete',service,{p_project:ids.pA,p_object:dead.id,p_deleted:true})).data===true,'deletion finalized');check((await object('PUT',dead.id,Buffer.alloc(0))).status===409,'tombstone prevents resurrection');
  check((await rest(`managed_usage?operation_id=eq.${objects[1].id}&unit=eq.stored_bytes`,a)).data?.length===1,'exactly one storage debit record');
  const pending=randomUUID();check((await rpc('managed_object_reserve',a,{p_project:ids.pA,p_object:pending,p_name:'pending.bin',p_bytes:1,p_sha256:hash(Buffer.from('P'))})).ok,'pending reservation retained');
  check((await rpc('managed_object_reserve',b,{p_project:ids.pA,p_object:randomUUID(),p_name:'bad',p_bytes:1,p_sha256:hash(Buffer.from('x'))})).status>=400,'foreign reservation denied');
  const tooBig=await rpc('managed_object_reserve',a,{p_project:ids.pA,p_object:randomUUID(),p_name:'quota',p_bytes:10485760,p_sha256:'a'.repeat(64)});check(tooBig.status>=400,'project storage quota enforced');
  const job=(await rpc('managed_enqueue',a,{p_project:ids.pA,p_idempotency:'rehearsal-once'})).data;check(typeof job==='string','job enqueued');check((await rpc('managed_enqueue',a,{p_project:ids.pA,p_idempotency:'rehearsal-once'})).data===job,'enqueue idempotent');
  const claims=await Promise.all([gateway({action:'claim'}),gateway({action:'claim'})]);const leases=claims.filter(x=>x.data?.result);check(leases.length===1,'two concurrent claims yield one lease');const lease=leases[0].data.result;
  check((await gateway({action:'finish',job_id:job,lease_token:lease.lease_token,success:true},workerB)).data?.result===false,'foreign worker cannot finish');
  check((await gateway({action:'finish',job_id:job,lease_token:lease.lease_token,success:true})).data?.result===true,'finish accepted');check((await gateway({action:'finish',job_id:job,lease_token:lease.lease_token,success:true})).data?.result===false,'finish replay fenced');
  check((await rest(`managed_usage?operation_id=eq.${job}&unit=eq.job`,a)).data?.length===1,'one job usage');check([403,503].includes((await gateway({action:'claim'},`mpw_${'0'.repeat(64)}`)).status),'unregistered worker denied');
  const expired=(await rpc('managed_enqueue',a,{p_project:ids.pA,p_idempotency:'expire-me'})).data;await pause(1000);const expLease=(await gateway({action:'claim'})).data?.result;check(expLease?.id===expired,'lease to expire');await save('lease',expLease);
  const now=Date.now();for(let i=0;i<3;i++){const sample={measured_at:new Date(now+i).toISOString(),cpu_percent:99,memory_total:100,memory_available:80,disk_total:100,disk_used:30,network_rx_bytes:0,network_tx_bytes:0,services:[],not_persisted:'fictional'};check((await request('http://telemetry-gateway:3082/api/managed-telemetry',{method:'POST',token:telemetry,body:sample})).ok,'telemetry saved');if(i===2)check((await request('http://telemetry-gateway:3082/api/managed-telemetry',{method:'POST',token:telemetry,body:sample})).ok,'telemetry replay harmless');}
  check((await rest('infrastructure_alert_events',admin)).data?.filter(e=>e.event==='opened').length===1,'one sustained alert');check((await rest('infrastructure_alert_events',b)).data?.length===0,'global alert hidden');check((await request('http://telemetry-gateway:3082/api/managed-telemetry',{method:'POST',token:'invalid',body:{}})).status===401,'telemetry authentication');
  await save('restore-expected',{objects,pending,job,recordCount:(await rest('managed_records',a)).data.length});
 }else if(phase==='pressure'){
  let started=false;for(let i=0;i<60;i++){try{if((await request('http://objects-pressure:3081/')).status===403){started=true;break;}}catch{}await pause(500);}check(started,'pressure sidecar ready');
  const control=Buffer.from('space-control'),controlId=randomUUID();check((await request(`http://objects-pressure:3081/objects/${ids.pA}/${controlId}`,{method:'PUT',token:signObjectCapability({method:'PUT',object:controlId,project:ids.pA,bytes:control.length,sha256:hash(control),expires:Date.now()+30000},objectKey),raw:control})).ok,'pressure filesystem accepts small control write');
  const bytes=Buffer.alloc(2*1024*1024,70),id=randomUUID(),claim={method:'PUT',object:id,project:ids.pA,bytes:bytes.length,sha256:hash(bytes),expires:Date.now()+30000};
  const r=await request(`http://objects-pressure:3081/objects/${ids.pA}/${id}`,{method:'PUT',token:signObjectCapability(claim,objectKey),raw:bytes});check(r.status===409,'bounded 1MiB tmpfs refuses 2MiB write');
  claim.method='GET';claim.expires=Date.now()+30000;check((await request(`http://objects-pressure:3081/objects/${ids.pA}/${id}`,{token:signObjectCapability(claim,objectKey)})).status===409,'failed write not exposed as ready');
 }else if(phase==='expired'){
  const s=await sessions(),lease=await load('lease');check((await gateway({action:'claim'})).data?.result===null,'expired job not replayed');check((await gateway({action:'finish',job_id:lease.id,lease_token:lease.lease_token,success:true})).data?.result===false,'expired finish fenced');check((await rest(`managed_jobs?id=eq.${lease.id}`,s.a.access_token)).data?.[0]?.status==='uncertain','uncertain status persisted');
 }else if(phase==='worker'){
  const s=await sessions(),job=(await rpc('managed_enqueue',s.a.access_token,{p_project:ids.pA,p_idempotency:'real-worker'})).data;let ok=false;for(let i=0;i<25;i++){if((await rest(`managed_jobs?id=eq.${job}`,s.a.access_token)).data?.[0]?.status==='succeeded'){ok=true;break;}await pause(500);}check(ok,'separate worker process completed diagnostic');
 }else if(phase==='revoked'){
  const s=await sessions();check((await rest('managed_projects',s.a.access_token)).data?.length===0,'membership revocation effective');check([403,503].includes((await gateway({action:'claim'})).status),'revoked worker denied');
 }else if(phase==='load'){
  const s=await sessions(),latencies=[];let count=0,errors=0;for(const rate of [1,5,10]){for(let second=0;second<10;second++){const started=Date.now();await Promise.all(Array.from({length:rate},async()=>{const t=Date.now();const r=await rest('managed_projects?select=id',s.a.access_token);latencies.push(Date.now()-t);count++;if(!r.ok)errors++;}));await pause(Math.max(0,1000-(Date.now()-started)));}}
  latencies.sort((a,b)=>a-b);check(errors===0,'limited REST load without errors');await save('load-metrics',{requests:count,duration_seconds:30,max_concurrency:10,errors,p50_ms:latencies[Math.floor(latencies.length*.5)],p95_ms:latencies[Math.floor(latencies.length*.95)],scope:'fictional read-only REST, not production capacity'});
 }else if(phase==='restored'){
  await ready('http://kong:3000/');const s=await sessions(),expected=await load('restore-expected'),a=s.a.access_token;
  check((await rest('managed_projects',a)).data?.length===1,'restored RLS A');check((await rest('managed_records',s.b.access_token)).data?.length===0,'restored RLS B');check((await rest('managed_records',a)).data?.length===expected.recordCount,'restored record count');
  for(const o of expected.objects){const r=await object('GET',o.id,Buffer.alloc(o.size,65));if(o.size===0)check(r.status===409,'restored tombstone');else check(r.ok&&r.bytes.equals(Buffer.alloc(o.size,65)),'restored object hash and bytes');}
  check((await rest(`managed_objects?id=eq.${expected.pending}`,a)).data?.[0]?.status==='pending','restored pending reservation');check((await rest(`managed_jobs?id=eq.${expected.job}`,a)).data?.[0]?.status==='succeeded','restored job result');check((await rpc('managed_enqueue',a,{p_project:ids.pA,p_idempotency:'rehearsal-once'})).data===expected.job,'restored idempotency');check((await rest('infrastructure_alert_events',s.admin.access_token)).data?.filter(e=>e.event==='opened').length===1,'restored alert event');check((await rest('infrastructure_alert_events',s.b.access_token)).data?.length===0,'restored alert isolation');
 }else throw Error('Unknown bounded harness phase');
 await save(`result-${phase}`,{passed:true,checks,engine:'not included',paid_calls:0,runtime:local?'native loopback; network isolation not tested':'Linux container'});console.log(JSON.stringify({phase,passed:true,checks:checks.length}));
}catch(error){await save(`result-${phase}`,{passed:false,checks,failure:String(error.message).slice(0,180)});console.error(JSON.stringify({phase,passed:false,checks:checks.length,message:String(error.message).slice(0,180)}));process.exitCode=1;}

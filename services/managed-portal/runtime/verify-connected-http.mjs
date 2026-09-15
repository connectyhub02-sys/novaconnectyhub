// Private credentials arrive on stdin; no generation, messages or production writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const {owner,client,project}=JSON.parse(fs.readFileSync(0,'utf8'));
let checks=0;
async function session(credentials){
 const jar=new Map();
 async function call(path,body,method='GET'){
  const response=await fetch('http://127.0.0.1:3126'+path,{method:body?'POST':method,redirect:'manual',headers:{Host:'infraestrutura.connectyhub.com.br','X-Forwarded-Proto':'https',Origin:'https://infraestrutura.connectyhub.com.br','Content-Type':'application/json',Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')},...(body?{body:JSON.stringify(body)}:{})});
  for(const cookie of response.headers.getSetCookie()){const item=cookie.split(';')[0],index=item.indexOf('=');jar.set(item.slice(0,index),item.slice(index+1));}
  return response;
 }
 if(credentials){assert.equal((await call('/api/session',{action:'login',...credentials})).status,200);checks++;}
 return call;
}
const anonymous=await session();assert.equal((await anonymous(`/api/connected-projects/${project}`)).status,401);checks++;
const admin=await session(owner),member=await session(client);
assert.equal((await anonymous('/api/managed-infrastructure')).status,401);assert.equal((await member('/api/managed-infrastructure')).status,403);checks+=2;
const telemetry=await admin('/api/managed-infrastructure');assert.equal(telemetry.status,200);assert.match(telemetry.headers.get('cache-control'),/no-store/);const metrics=await telemetry.json();assert.ok(metrics.samples.length>0);assert.ok(Date.now()-Date.parse(metrics.samples[0].measured_at)<180000);checks+=4;
const response=await admin(`/api/connected-projects/${project}`);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);checks+=2;
const source=await response.json();assert.equal(source.collection_status,'ok');assert.equal(source.snapshot.organization.id,source.source_organization_id);assert.ok(source.snapshot.database.table_count>0);assert.ok(Date.now()-Date.parse(source.collected_at)<180000);checks+=4;
const serialized=JSON.stringify(source);for(const forbidden of ['encrypted_value','password','access_token','service_role','public_url','object_key']){assert.ok(!serialized.includes('"'+forbidden+'"'));checks++;}
assert.equal((await member(`/api/connected-projects/${project}`)).status,403);checks++;
const clientProjects=await (await member('/api/managed-projects')).json();assert.ok(!clientProjects.projects.some(p=>p.id===project));checks++;
const page=await member(`/infraestrutura/projetos/${project}/banco`);assert.ok([403,404].includes(page.status));checks++;
assert.equal((await admin(`/api/connected-projects/${project}`,{action:'anything'})).status,405);checks++;
assert.equal((await admin(`/api/managed-projects/${project}`,{action:'record.create',collection:'blocked',data:{}})).status,403);checks++;
for(const route of ['banco','banco/tabelas','banco/arquivos','banco/consumo','automacoes']){const page=await admin(`/infraestrutura/projetos/${project}/${route}`);assert.equal(page.status,200);assert.match(await page.text(),/CONSULTA EM LEITURA/);checks++;}
const engine=source.snapshot.inngest;assert.equal(engine.status,'ok');assert.equal(engine.app_id,'f4b90922-c8bc-54b2-958c-48840fd9bd3e');assert.ok(engine.function_count>0);assert.ok(engine.runs.length>0);assert.ok(Date.now()-Date.parse(engine.collected_at)<180000);checks+=5;
const verifiedFiles=[];
for(const f of source.snapshot.files.filter(f=>f.availability==='registered')){
 const path=`/api/connected-projects/${project}/files/${f.source}/${f.id}`;
 assert.equal((await anonymous(path)).status,401);assert.equal((await member(path)).status,403);assert.equal((await admin(path,{})).status,405);checks+=3;
 const head=await admin(path,null,'HEAD');assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),Number(f.bytes));checks+=2;
 const content=await admin(path);assert.equal(content.status,200);assert.match(content.headers.get('cache-control'),/no-store/);assert.match(content.headers.get('content-disposition'),/^attachment/);assert.equal(content.headers.get('x-content-type-options'),'nosniff');checks+=4;
 const bytes=Buffer.from(await content.arrayBuffer());assert.equal(bytes.length,Number(f.bytes));checks++;
 verifiedFiles.push({id:f.id,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
assert.ok(verifiedFiles.length>0);checks++;
for(const invalid of ['lead_files/00000000-0000-0000-0000-000000000000','studio_assets/00000000-0000-0000-0000-000000000000']){assert.equal((await admin(`/api/connected-projects/${project}/files/${invalid}`)).status,404);checks++;}
console.log(JSON.stringify({checks,admin_real_source:true,client_denied:true,write_routes_denied:true,source_recent:true,sections:5,engine_functions:engine.function_count,engine_runs_sample:engine.runs.length,engine_failed_sample:engine.failures.length,verified_files:verifiedFiles}));

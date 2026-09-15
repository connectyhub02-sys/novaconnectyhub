// Private credentials arrive on stdin; no generation, messages or production writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {owner,client,project}=JSON.parse(fs.readFileSync(0,'utf8'));
let checks=0;
async function session(credentials){
 const jar=new Map();
 async function call(path,body){
  const response=await fetch('http://127.0.0.1:3126'+path,{method:body?'POST':'GET',redirect:'manual',headers:{Host:'infraestrutura.connectyhub.com.br','X-Forwarded-Proto':'https',Origin:'https://infraestrutura.connectyhub.com.br','Content-Type':'application/json',Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')},...(body?{body:JSON.stringify(body)}:{})});
  for(const cookie of response.headers.getSetCookie()){const item=cookie.split(';')[0],index=item.indexOf('=');jar.set(item.slice(0,index),item.slice(index+1));}
  return response;
 }
 if(credentials){assert.equal((await call('/api/session',{action:'login',...credentials})).status,200);checks++;}
 return call;
}
const anonymous=await session();assert.equal((await anonymous(`/api/connected-projects/${project}`)).status,401);checks++;
const admin=await session(owner),member=await session(client);
const response=await admin(`/api/connected-projects/${project}`);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);checks+=2;
const source=await response.json();assert.equal(source.collection_status,'ok');assert.equal(source.snapshot.organization.id,source.source_organization_id);assert.ok(source.snapshot.database.table_count>0);assert.ok(Date.now()-Date.parse(source.collected_at)<180000);checks+=4;
const serialized=JSON.stringify(source);for(const forbidden of ['encrypted_value','password','access_token','service_role','public_url','object_key']){assert.ok(!serialized.includes('"'+forbidden+'"'));checks++;}
assert.equal((await member(`/api/connected-projects/${project}`)).status,403);checks++;
const clientProjects=await (await member('/api/managed-projects')).json();assert.ok(!clientProjects.projects.some(p=>p.id===project));checks++;
const page=await member(`/infraestrutura/projetos/${project}/banco`);assert.ok([403,404].includes(page.status));checks++;
assert.equal((await admin(`/api/connected-projects/${project}`,{action:'anything'})).status,405);checks++;
assert.equal((await admin(`/api/managed-projects/${project}`,{action:'record.create',collection:'blocked',data:{}})).status,403);checks++;
for(const route of ['banco','banco/tabelas','banco/arquivos','banco/consumo','automacoes']){const page=await admin(`/infraestrutura/projetos/${project}/${route}`);assert.equal(page.status,200);assert.match(await page.text(),/CONSULTA EM LEITURA/);checks++;}
console.log(JSON.stringify({checks,admin_real_source:true,client_denied:true,write_routes_denied:true,source_recent:true,sections:5}));

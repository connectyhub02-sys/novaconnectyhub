// Runs exclusively inside the isolated portal web container; receives private owner access on stdin.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
const owner=JSON.parse(fs.readFileSync(0,'utf8'));let checks=0;
const root='http://127.0.0.1:3126',origin='https://infraestrutura.connectyhub.com.br';
async function request(path,body,jar=new Map(),method=body?'POST':'GET'){
 const r=await fetch(root+path,{method,redirect:'manual',headers:{Host:'infraestrutura.connectyhub.com.br','X-Forwarded-Proto':'https',Origin:origin,'Content-Type':'application/json',Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')},...(body?{body:JSON.stringify(body)}:{})});
 for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));if(pair.startsWith('managed-portal-session')){assert.match(c,/HttpOnly/i);assert.match(c,/Secure/i);checks++;}}
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};
}
const good=(result,status=200)=>{assert.equal(result.status,status,JSON.stringify(result.data));checks++;return result.data;};
const admin=new Map();good(await request('/api/session',{action:'login',email:owner.email,password:owner.password},admin));
good(await request('/api/managed-projects'),401);
const stamp=Date.now(),a={email:`qa-a-${stamp}@homolog.example`,password:randomBytes(24).toString('base64url')},b={email:`qa-b-${stamp}@homolog.example`,password:randomBytes(24).toString('base64url')};
const oa=good(await request('/api/clients',{action:'company',name:'Homologação QA A'},admin)).result;
const ob=good(await request('/api/clients',{action:'company',name:'Homologação QA B'},admin)).result;
const ua=good(await request('/api/clients',{action:'user',organization_id:oa,...a},admin)).result.id;
const ub=good(await request('/api/clients',{action:'user',organization_id:ob,...b},admin)).result.id;
const pa=good(await request('/api/managed-projects',{name:'QA A · persistência',slug:`qa-a-${stamp}`,organization_id:oa},admin),201).id;
const pb=good(await request('/api/managed-projects',{name:'QA B · isolamento',slug:`qa-b-${stamp}`,organization_id:ob},admin),201).id;
for(const [p,u]of [[pa,ua],[pb,ub]]){good(await request(`/api/managed-projects/${p}`,{action:'project.update',status:'active',concurrency_limit:1,queue_limit:100,storage_limit_bytes:10485760},admin));good(await request(`/api/managed-projects/${p}`,{action:'member.put',user_id:u,role:'operator'},admin));}
const ja=new Map(),jb=new Map();good(await request('/api/session',{action:'login',...a},ja));good(await request('/api/session',{action:'login',...b},jb));
const visible=good(await request('/api/managed-projects',null,ja));assert.deepEqual(visible.projects.map(p=>p.id),[pa]);assert.equal(visible.admin,false);checks+=2;
good(await request(`/api/managed-projects/${pa}`,null,jb),404);
good(await request('/api/managed-infrastructure',null,ja),403);
good(await request('/api/clients',{action:'company',name:'Forbidden'},ja),403);
good(await request(`/api/managed-projects/${pa}`,{action:'member.put',user_id:ub,role:'operator'},admin),409);
const record=good(await request(`/api/managed-projects/${pa}`,{action:'record.create',collection:'checks',data:{text:'persistent QA record',stamp}},ja)).result.id;
const object=randomUUID(),content=Buffer.from('Private homologation file '+stamp).toString('base64');
good(await request(`/api/managed-projects/${pa}/objects/${object}`,{action:'put',name:'homologacao.txt',base64:content},ja));
const downloaded=good(await request(`/api/managed-projects/${pa}/objects/${object}`,null,ja));assert.equal(downloaded,Buffer.from(content,'base64').toString());checks++;
good(await request(`/api/managed-projects/${pa}/objects/${object}`,null,jb),404);
good(await request(`/api/managed-projects/${pa}/engine`,null,ja));
good(await request(`/api/managed-projects/${pa}`,{action:'job.create',idempotency_key:`verify-${stamp}`},ja));
let snapshot;for(let i=0;i<20;i++){snapshot=good(await request(`/api/managed-projects/${pa}`,null,ja));if(snapshot.jobs.some(j=>j.status==='succeeded'))break;await new Promise(r=>setTimeout(r,2000));}
assert.ok(snapshot.jobs.some(j=>j.status==='succeeded'&&j.result_code==='diagnostic.ok'));checks++;
const saved={a,b,pa,pb,ua,ub,record,object,content,stamp};fs.writeFileSync('/tmp/portal-qa.json',JSON.stringify(saved),{mode:0o600});
console.log(JSON.stringify({checks,login:true,company_creation:true,real_users:true,project_isolation:true,private_object_download:true,diagnostic_completed:true,pa,pb,record,object}));

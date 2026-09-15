import fs from 'node:fs';
import assert from 'node:assert/strict';
const saved=JSON.parse(fs.readFileSync(0,'utf8')),jar=new Map();
async function call(path,body){const r=await fetch('http://127.0.0.1:3126'+path,{method:body?'POST':'GET',headers:{Host:'infraestrutura.connectyhub.com.br','X-Forwarded-Proto':'https',Origin:'https://infraestrutura.connectyhub.com.br','Content-Type':'application/json',Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')},...(body?{body:JSON.stringify(body)}:{})});for(const c of r.headers.getSetCookie()){const p=c.split(';')[0],i=p.indexOf('=');jar.set(p.slice(0,i),p.slice(i+1));}assert.equal(r.status,200);return r;}
await call('/api/session',{action:'login',...saved.a});
const snapshot=await (await call(`/api/managed-projects/${saved.pa}`)).json();
assert.ok(snapshot.records.some(r=>r.id===saved.record&&r.data.stamp===saved.stamp));
assert.equal(snapshot.jobs.length,1);assert.equal(snapshot.jobs[0].status,'succeeded');
assert.equal(await (await call(`/api/managed-projects/${saved.pa}/objects/${saved.object}`)).text(),Buffer.from(saved.content,'base64').toString());
assert.equal(snapshot.objects.filter(o=>o.status==='ready').length,1);
console.log(JSON.stringify({persistent_login:true,persistent_record:true,persistent_object:true,one_completed_job:true}));

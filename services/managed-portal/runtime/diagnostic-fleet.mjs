// Homologation-only diagnostics. No arbitrary code, URL, provider call or billing.
import {readFile} from 'node:fs/promises';
import {createHash,createHmac} from 'node:crypto';
const key=(await readFile('/run/secrets/service-key','utf8')).trim();
const seed=(await readFile('/run/secrets/worker-seed','utf8')).trim();
const headers={Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'};
async function call(path,body,method='POST'){const r=await fetch(`http://127.0.0.1:3000/${path}`,{method,headers:{...headers,Prefer:'resolution=ignore-duplicates,return=representation'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('database_unavailable');const text=await r.text();return text?JSON.parse(text):null;}
let stop=false;process.on('SIGTERM',()=>stop=true);
while(!stop){try{const projects=await call('managed_projects?select=id&status=eq.active&order=created_at&limit=50',null,'GET');for(const project of projects){const secret='mpw_'+createHmac('sha256',seed).update(project.id).digest('hex'),hash=createHash('sha256').update(secret).digest('hex');await call('managed_workers?on_conflict=key_hash',{project_id:project.id,key_hash:hash,expires_at:'2030-01-01T00:00:00Z'});const job=await call('rpc/managed_claim',{p_worker_hash:hash});if(job)await call('rpc/managed_finish',{p_worker_hash:hash,p_job:job.id,p_token:job.lease_token,p_success:job.kind==='diagnostic.ping'});}}catch{console.error('diagnostic_cycle_unavailable');}await new Promise(r=>setTimeout(r,3000));}

// Private continuous collector sink. No dependency on Vercel and no scheduler installation.
import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
const names=new Set(['supabase-db','supabase-auth','supabase-storage','supabase-studio','connectyhub-inngest-inngest-1','connectyhub-inngest-postgres-1','connectyhub-inngest-redis-1','container-collector']);
const statuses=new Set(['healthy','unhealthy','starting','running','exited','restarting','unknown','unavailable']);
const integer=(n,min,max)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('invalid_sample');return n;};
export function normalizeHostSample(b,now=Date.now()){
 const time=Date.parse(b?.measured_at);if(!Number.isFinite(time)||Math.abs(now-time)>300000)throw Error('stale_sample');
 if(b.cpu_percent!==null&&(typeof b.cpu_percent!=='number'||!Number.isFinite(b.cpu_percent)||b.cpu_percent<0||b.cpu_percent>100))throw Error('invalid_sample');
 const mem=integer(b.memory_total,1,Number.MAX_SAFE_INTEGER),disk=integer(b.disk_total,1,Number.MAX_SAFE_INTEGER);
 if(!Array.isArray(b.services)||b.services.length>names.size||b.services.some(s=>!s||!names.has(s.name)||!statuses.has(s.status))||new Set(b.services.map(s=>s.name)).size!==b.services.length)throw Error('invalid_services');
 return {measured_at:new Date(time).toISOString(),cpu_percent:b.cpu_percent,memory_total:mem,memory_available:integer(b.memory_available,0,mem),disk_total:disk,disk_used:integer(b.disk_used,0,disk),network_rx_bytes:b.network_rx_bytes===null?null:integer(b.network_rx_bytes,0,Number.MAX_SAFE_INTEGER),network_tx_bytes:b.network_tx_bytes===null?null:integer(b.network_tx_bytes,0,Number.MAX_SAFE_INTEGER),services:b.services.map(s=>({name:s.name,status:s.status}))};
}
export function telemetryGateway({key,persist}){
 if(typeof key!=='string'||key.length<32)throw Error('private_key_required');
 const hash=v=>createHash('sha256').update(v).digest();const expected=hash(key);let active=false;
 const server=createServer(async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(req.method!=='POST'||req.url!=='/api/managed-telemetry')return send(404,{error:'not_found'});
  const supplied=(req.headers.authorization??'').replace(/^Bearer /,'');if(!timingSafeEqual(expected,hash(supplied)))return send(401,{error:'unauthorized'});
  if(active)return send(429,{error:'busy'});active=true;
  try{
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20000)return send(413,{error:'sample_too_large'});chunks.push(chunk);}
   let sample;try{sample=normalizeHostSample(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{return send(400,{error:'invalid_sample'});}
   try{await persist(sample);return send(200,{ok:true});}catch{return send(503,{error:'not_persisted'});}
  }catch{return send(400,{error:'invalid_request'});}finally{active=false;}
 });
 server.requestTimeout=20000;server.headersTimeout=10000;return server;
}
export function telemetryRestSink({root,key,request=fetch}){
 const url=new URL(root);if(url.username||url.password||url.search||url.hash||!['/','/rest/v1/'].includes(url.pathname)||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','kong'].includes(url.hostname))))throw Error('private_rest_required');
 if(typeof key!=='string'||key.length<32)throw Error('service_key_required');let lastPruned=0;
 return async sample=>{
  const headers={Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'};
  const result=await request(new URL('infrastructure_samples?on_conflict=measured_at',url),{method:'POST',headers,body:JSON.stringify(sample),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!result.ok)throw Error('sample_not_persisted');
  const now=Date.now();if(now-lastPruned>3600000){const cutoff=new Date(now-7*86400000).toISOString();const pruned=await request(new URL(`infrastructure_samples?measured_at=lt.${encodeURIComponent(cutoff)}`,url),{method:'DELETE',headers,redirect:'error',signal:AbortSignal.timeout(10000)});if(!pruned.ok)throw Error('retention_not_confirmed');lastPruned=now;}
 };
}

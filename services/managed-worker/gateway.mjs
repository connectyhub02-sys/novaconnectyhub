// Internal VPS gateway; polling must not be deployed as a Vercel function.
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root=new URL(process.env.MANAGED_DATABASE_REST_URL??'http://127.0.0.1:8000/rest/v1/');
if(root.username||root.password||!['http:','https:'].includes(root.protocol))throw Error('Invalid private database URL');
if(!process.env.MANAGED_DATABASE_KEY_FILE)throw Error('Database service key file required');
const databaseKey=(await readFile(process.env.MANAGED_DATABASE_KEY_FILE,'utf8')).trim();
if(!databaseKey)throw Error('Empty database service key');
const hash=value=>createHash('sha256').update(value).digest('hex');
const recent=new Map();const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const server=createServer(async(request,response)=>{
 const send=(status,body)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(body));};
 if(request.method==='GET'&&request.url==='/health')return send(200,{status:'running'});
 if(request.method!=='POST'||request.url!=='/api/managed-workers')return send(404,{error:'Not found'});
 const key=/^Bearer (mpw_[a-zA-Z0-9_-]{32,128})$/.exec(request.headers.authorization??'')?.[1];if(!key)return send(401,{error:'Credential required'});
 const keyHash=hash(key),now=Date.now();for(const [k,entry]of recent)if(now-entry.start>=1000)recent.delete(k);
 let entry=recent.get(keyHash);
 if(!entry){if(recent.size>=1000)return send(503,{error:'Gateway busy'});entry={start:now,count:0};recent.set(keyHash,entry);}
 // A fast diagnostic must be able to finish immediately after claiming its lease.
 if(++entry.count>10)return send(429,{error:'Rate limited'});
 try{
  const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>4096)return send(413,{error:'Request too large'});chunks.push(chunk);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,{error:'Invalid JSON'});}
  if(!body||Array.isArray(body))return send(400,{error:'Invalid request'});
  let routine,args;
  if(body.action==='claim'){routine='managed_claim';args={p_worker_hash:keyHash};}
  else if(body.action==='finish'&&uuid.test(body.job_id)&&uuid.test(body.lease_token)&&typeof body.success==='boolean'){routine='managed_finish';args={p_worker_hash:keyHash,p_job:body.job_id,p_token:body.lease_token,p_success:body.success};}
  else return send(400,{error:'Invalid action'});
  const result=await fetch(new URL(`rpc/${routine}`,root.href.endsWith('/')?root:new URL(root.href+'/')),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',apikey:databaseKey,Authorization:`Bearer ${databaseKey}`},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
  if(!result.ok)return send(result.status>=500?503:403,{error:'Worker unavailable'});
  return send(200,{result:await result.json()});
 }catch{return send(503,{error:'Gateway unavailable'});}
});
server.requestTimeout=20000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;
server.listen(Number(process.env.PORT??3080),process.env.MANAGED_GATEWAY_BIND??'127.0.0.1');
process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());

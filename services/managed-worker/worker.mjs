// Project-scoped worker. Does not accept arbitrary URLs, code, commands or provider payloads.
import {readFile} from 'node:fs/promises';
const url=new URL(process.env.MANAGED_GATEWAY_URL??'http://127.0.0.1:3026/api/managed-workers');
if(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]','managed-gateway'].includes(url.hostname))throw Error('HTTPS required outside loopback or the private compose gateway');
if(!url.pathname.endsWith('/api/managed-workers'))throw Error('Unexpected gateway path');
const secret=process.env.MANAGED_WORKER_KEY_FILE?(await readFile(process.env.MANAGED_WORKER_KEY_FILE,'utf8')).trim():process.env.MANAGED_WORKER_KEY;
if(!secret?.startsWith('mpw_'))throw Error('Project-scoped worker key required');
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function call(body){const response=await fetch(url,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(`Gateway status ${response.status}`);return (await response.json()).result;}
do{
 try{const job=await call({action:'claim'});if(job){
   // Diagnostic intentionally has no external side effects. A future provider handler needs its own idempotency contract.
   const success=job.kind==='diagnostic.ping';
   const accepted=await call({action:'finish',job_id:job.id,lease_token:job.lease_token,success});
   console.log(JSON.stringify({job_id:job.id,status:accepted?(success?'succeeded':'failed'):'lease_not_accepted'}));
 }else if(!process.env.MANAGED_WORKER_ONCE)await sleep(3000);
 }catch(error){console.error(JSON.stringify({status:'gateway_unavailable',message:error.message}));if(process.env.MANAGED_WORKER_ONCE)process.exitCode=1;else await sleep(10000);}
}while(!stopping&&!process.env.MANAGED_WORKER_ONCE);

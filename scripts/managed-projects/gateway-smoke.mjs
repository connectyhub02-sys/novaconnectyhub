import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'managed-gateway-test-'));
const secretFile=join(directory,'fictional-key');
await writeFile(secretFile,'fictional-database-key');
const calls=[];
const database=createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 calls.push({path:req.url,body:JSON.parse(body),authorization:req.headers.authorization});
 res.writeHead(200,{'Content-Type':'application/json'});res.end(req.url.endsWith('managed_claim')?'null':'true');
});
await new Promise(resolve=>database.listen(0,'127.0.0.1',resolve));
const portServer=createServer();await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));
const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
const child=spawn(process.execPath,['services/managed-worker/gateway.mjs'],{env:{...process.env,PORT:String(port),MANAGED_DATABASE_KEY_FILE:secretFile,MANAGED_DATABASE_REST_URL:`http://127.0.0.1:${database.address().port}/rest/v1/`},stdio:'pipe'});
const base=`http://127.0.0.1:${port}`;const key='mpw_FICTIONAL_PROJECT_WORKER_FOR_LOCAL_TEST_ONLY';
const request=(body,authorization=`Bearer ${key}`)=>fetch(base+'/api/managed-workers',{method:'POST',headers:{authorization,'Content-Type':'application/json'},body:JSON.stringify(body)});
try{
 let ready=false;for(let i=0;i<50;i++){try{ready=(await fetch(base+'/health')).ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}assert.ok(ready);
 assert.equal((await request({action:'claim'},'')).status,401);
 assert.equal((await request({action:'claim'})).status,200);
 assert.equal((await request({action:'finish',job_id:'30000000-0000-4000-8000-000000000001',lease_token:'40000000-0000-4000-8000-000000000001',success:true})).status,200);
 assert.equal(calls.length,2);assert.equal(calls[0].path,'/rest/v1/rpc/managed_claim');assert.equal(calls[1].path,'/rest/v1/rpc/managed_finish');
 assert.match(calls[0].body.p_worker_hash,/^[a-f0-9]{64}$/);assert.equal(calls[0].authorization,'Bearer fictional-database-key');assert.ok(!JSON.stringify(calls).includes(key));
 assert.equal((await request({action:'run-sql',sql:'select 1'})).status,400);assert.equal(calls.length,2);
 let limited=false;for(let i=0;i<12;i++){if((await request({action:'claim'})).status===429)limited=true;}assert.ok(limited);
 assert.equal((await fetch(base+'/arbitrary')).status,404);
 console.log(JSON.stringify({passed:true,scope:'real gateway process with simulated PostgREST',immediate_finish:true,rate_limit:true,production_mutations:0}));
}finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));await new Promise(resolve=>database.close(resolve));await unlink(secretFile);await rmdir(directory);}

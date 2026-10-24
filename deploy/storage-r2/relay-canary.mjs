// Run inside the candidate relay image with its private R2 env file.
// Uses synthetic content and a local control stub; no AI provider or billing call.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createR2AssetStore} from '/app/r2-assets.mjs';
import {createStudioAssetHandler} from '/app/studio-assets.mjs';

const store=createR2AssetStore({endpoint:process.env.STUDIO_R2_ENDPOINT,
 bucket:process.env.STUDIO_R2_BUCKET,accessKeyId:process.env.STUDIO_R2_ACCESS_KEY_ID,
 secretAccessKey:process.env.STUDIO_R2_SECRET_ACCESS_KEY});
let input='';for await(const c of process.stdin)input+=c;
const manifest=JSON.parse(input);
for(const item of manifest){
 const bytes=await store.read(item.id);
 if(bytes.length!==item.bytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Existing asset mismatch');
}
const stateDir=await mkdtemp(join(tmpdir(),'r2-canary-')),id=randomUUID(),ticket='a'.repeat(64);
const handler=createStudioAssetHandler({control:'https://synthetic.invalid',secret:'synthetic',stateDir,objectStore:store,
 measure:async()=>({duration_seconds:1}),fetcher:async(_,request)=>{
 const b=JSON.parse(request.body);
 return Response.json(b.action==='asset.connect'?{id,size_bytes:3,mime_type:'audio/wav'}:{id,status:b.status});
 }});
const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});
try{
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}/studio-assets/${id}`;
 const send=(method)=>fetch(url,{method,headers:{Authorization:`Bearer ${ticket}`,'Content-Type':'audio/wav'},...(method==='PUT'?{body:'abc'}:{})});
 if((await send('PUT')).status!==201)throw Error('Upload failed');
 if((await readdir(stateDir)).length)throw Error('Local payload created');
 if(await (await send('GET')).text()!=='abc')throw Error('Download failed');
 if((await send('DELETE')).status!==200||await store.exists(id))throw Error('Delete failed');
 console.log(JSON.stringify({relay_r2_crud:true,no_local_payload:true,existing_assets_hash_verified:manifest.length}));
}finally{
 handler.close();await new Promise(resolve=>server.close(resolve));await store.remove(id);
 await rm(stateDir,{recursive:true,force:true});
}

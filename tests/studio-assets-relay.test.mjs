import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStudioAssetHandler} from '../services/ai-relay/studio-assets.mjs';
async function fixture({reject=false,confirm=true,measureFail=false}={}){
 const stateDir=await mkdtemp(join(tmpdir(),'studio-assets-')),id=randomUUID(),ticket='a'.repeat(64),calls=[];let canConfirm=confirm;
 const fetcher=async(url,request)=>{
  expect(String(url)).toBe('https://control.example/internal');const body=JSON.parse(request.body);calls.push(body);
  if(body.action==='asset.connect')return Response.json({id,size_bytes:3,mime_type:'audio/wav'},{status:reject?401:200});
  return Response.json({id,status:body.status},{status:canConfirm?200:503});
 };
 const options={control:'https://control.example/internal',secret:'secret',stateDir,fetcher,measure:async()=>{if(measureFail)throw new Error('invalid');return {duration_seconds:1.5};}};
 let handler=createStudioAssetHandler(options);
 const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}/studio-assets/${id}`;
 const send=(method='PUT')=>fetch(url,{method,headers:{Authorization:`Bearer ${ticket}`,'Content-Type':'audio/wav'},...(method==='PUT'?{body:'abc'}:{})});
 return {id,stateDir,calls,url,send,restart:async()=>{handler.close();canConfirm=true;handler=createStudioAssetHandler(options);await handler.flush();},close:async()=>{handler.close();await new Promise(r=>server.close(r));await rm(stateDir,{recursive:true,force:true});}};
}
it('stores bounded audio privately, returns a receipt and downloads only after ticket validation',async()=>{
 const f=await fixture();try{
  expect((await f.send()).status).toBe(201);
  expect(await readdir(f.stateDir)).toEqual([`${f.id}.audio`]);
  expect((await readFile(join(f.stateDir,`${f.id}.audio`))).toString()).toBe('abc');
  expect(f.calls[1]).toMatchObject({action:'asset.complete',duration_seconds:1.5,size_bytes:3});
  const result=await f.send('GET');expect(result.status).toBe(200);expect(await result.text()).toBe('abc');expect(result.headers.get('cache-control')).toBe('no-store');
  expect(f.calls.at(-1)).toMatchObject({action:'asset.connect',purpose:'download'});
  expect((await f.send('DELETE')).status).toBe(200);expect(await readdir(f.stateDir)).toEqual([]);
 }finally{await f.close();}
});
it('persists confirmation across a restart without storing ticket secrets or decoding twice',async()=>{
 const f=await fixture({confirm:false});try{
  const result=await f.send();expect(result.status).toBe(503);expect((await result.json()).error.code).toBe('asset_confirmation_pending');
  const receipt=await readFile(join(f.stateDir,`${f.id}.json`),'utf8');expect(receipt).not.toContain('access_key');expect(receipt).not.toContain('abc');
  await f.restart();expect(await readdir(f.stateDir)).toEqual([`${f.id}.audio`]);
  expect(f.calls.filter(c=>c.action==='asset.connect')).toHaveLength(1);
 }finally{await f.close();}
});
it('rejects invalid tickets before storing or inspecting content',async()=>{
 const f=await fixture({reject:true});try{expect((await f.send()).status).toBe(401);expect(await readdir(f.stateDir)).toEqual([]);expect(f.calls).toHaveLength(1);}finally{await f.close();}
});
it('releases the upload after invalid audio and never declares it ready',async()=>{
 const f=await fixture({measureFail:true});try{expect((await f.send()).status).toBe(422);expect(f.calls.at(-1).action).toBe('asset.fail');expect(await readdir(f.stateDir)).toEqual([]);}finally{await f.close();}
});

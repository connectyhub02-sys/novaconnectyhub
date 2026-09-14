import {mkdir,readdir,readFile,writeFile,rename,unlink,link,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {measureStudioAudio,studioMediaLimits} from './audio-measure.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
class AssetFailure extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
export function createStudioAssetHandler({control,secret,stateDir,fetcher=fetch,measure=measureStudioAudio,maxActive=2}) {
 if(!stateDir)throw new Error('Studio requires a private persistent asset directory');
 let active=0,draining=false;
 const ready=mkdir(stateDir,{recursive:true,mode:0o700});
 const audio=id=>join(stateDir,`${id}.audio`),manifest=id=>join(stateDir,`${id}.json`);
 const remove=path=>unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});
 const call=async body=>{
  const response=await fetcher(control,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new AssetFailure([401,403,404,409,422,429].includes(response.status)?response.status:503,'asset_control_unavailable');
  return response.json();
 };
 const remember=async item=>{await writeFile(manifest(item.id)+'.tmp',JSON.stringify(item),{mode:0o600});await rename(manifest(item.id)+'.tmp',manifest(item.id));};
 const confirm=async item=>{
  if(item.status==='deleted')await remove(audio(item.id));
  else {
   const bytes=await readFile(audio(item.id));
   if(bytes.length!==item.size_bytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('asset_integrity');
  }
  const result=await call({action:'asset.complete',...item});await remove(manifest(item.id));return result;
 };
 const flush=async()=>{
  if(draining)return;draining=true;
  try{await ready;for(const name of await readdir(stateDir)){
   if(!name.endsWith('.json')||!uuid.test(name.slice(0,-5)))continue;
   try{
    const item=JSON.parse(await readFile(join(stateDir,name),'utf8'));
    if(item.id!==name.slice(0,-5)||!['ready','deleted'].includes(item.status))continue;
    try{await confirm(item);}catch(error){
     if(error.code==='ENOENT'&&item.status==='ready'&&Number.isFinite(item.created_at)&&Date.now()-item.created_at>600000){
      await call({action:'asset.fail',id:item.id});await remove(audio(item.id)+'.tmp');await remove(manifest(item.id));
     }
    }
   }catch{/* Keep receipt for reconciliation; never retry generation. */}
  }}finally{draining=false;}
 };
 const timer=setInterval(()=>flush().catch(()=>{}),15000);timer.unref();
 const handler=async(req,res)=>{
  const match=req.url?.match(/^\/studio-assets\/([^/?]+)$/);if(!match)return false;
  const id=match[1],cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'PUT, GET, DELETE, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'};
  const reply=(status,body)=>{if(!res.destroyed&&!res.writableEnded&&!res.headersSent){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...cors});res.end(JSON.stringify(body));}};
  let claimed=false,durable=false,slot=false,ownedFile=false,session;
  const purpose={PUT:'upload',GET:'download',DELETE:'delete'}[req.method];
  try{
   if(!uuid.test(id))throw new AssetFailure(404,'asset_not_found');
   if(req.method==='OPTIONS'){res.writeHead(204,cors);res.end();return true;}
   if(!purpose)throw new AssetFailure(405,'method_not_allowed');
   const ticket=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
   if(!ticket)throw new AssetFailure(401,'invalid_asset_ticket');
   if(active>=maxActive)throw new AssetFailure(429,'asset_capacity');
   let size;
   if(purpose==='upload'){
    size=Number(req.headers['content-length']);
    if(!Number.isSafeInteger(size)||size<1||size>studioMediaLimits.bytes)throw new AssetFailure(413,'asset_size_limit');
   }
   active++;slot=true;await ready;
   if((await readdir(stateDir)).filter(n=>n.endsWith('.json')).length>=1024)throw new AssetFailure(503,'asset_recovery_capacity');
   session=await call({action:'asset.connect',id,purpose,access_key:ticket});claimed=true;
   if(session.id!==id||!Number.isSafeInteger(session.size_bytes)||session.size_bytes<1||session.size_bytes>studioMediaLimits.bytes||!/^audio\/(wav|mpeg|mp4|aac|ogg|flac|webm)$/.test(session.mime_type))throw new AssetFailure(422,'asset_metadata');
   req.setTimeout(60000,()=>req.destroy());res.setTimeout(60000,()=>res.destroy());
   if(purpose==='delete'){
    const item={id,status:'deleted'};await remember(item);durable=true;
    reply(200,await confirm(item));return true;
   }
   if(purpose==='download'){
    const file=await stat(audio(id));if(file.size!==session.size_bytes)throw new AssetFailure(503,'asset_integrity');
    res.writeHead(200,{'Content-Type':session.mime_type,'Content-Length':file.size,'Content-Disposition':'attachment; filename="audio"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...cors});
    await pipeline(createReadStream(audio(id)),res);return true;
   }
   if(size!==session.size_bytes||req.headers['content-type']!==session.mime_type)throw new AssetFailure(422,'asset_metadata');
   const chunks=[];let received=0;
   for await(const chunk of req){received+=chunk.length;if(received>size)throw new AssetFailure(413,'asset_size_limit');chunks.push(chunk);}
   if(received!==size)throw new AssetFailure(422,'asset_incomplete');
   const bytes=Buffer.concat(chunks,received);
   let measurement;try{measurement=await measure(bytes);}catch{throw new AssetFailure(422,'audio_invalid_or_limit');}
   if(!Number.isFinite(measurement.duration_seconds)||measurement.duration_seconds<=0||measurement.duration_seconds>studioMediaLimits.seconds)throw new AssetFailure(422,'audio_invalid_or_limit');
   const item={id,status:'ready',size_bytes:received,duration_seconds:measurement.duration_seconds,sha256:createHash('sha256').update(bytes).digest('hex'),created_at:Date.now()};
   // Persist intent first so a crash before the atomic file link is recoverable.
   await remember(item);durable=true;
   const temporary=audio(id)+'.tmp';await writeFile(temporary,bytes,{mode:0o600,flag:'wx'});
   try{await link(temporary,audio(id));ownedFile=true;}finally{await remove(temporary);}
   // Durable receipt before acknowledgment. No provider key or ticket is stored.
   reply(201,await confirm(item));
  }catch(error){
   if(claimed&&purpose==='upload'&&!durable){
    if(ownedFile)await remove(audio(id)).catch(()=>{});
    await call({action:'asset.fail',id}).catch(()=>{});
   }
   reply(error instanceof AssetFailure?error.status:503,{error:{code:durable?'asset_confirmation_pending':error instanceof AssetFailure?error.code:'asset_unavailable',message:durable?'Confirmação pendente; consulte o arquivo pelo ID.':'Não foi possível concluir a operação.',asset_id:uuid.test(id)?id:undefined}});
  }finally{if(slot)active--;req.resume();}
  return true;
 };
 handler.close=()=>clearInterval(timer);handler.flush=flush;return handler;
}

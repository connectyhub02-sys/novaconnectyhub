import {mkdir,readdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
const origin='https://generativelanguage.googleapis.com';
const maximum=20_000_000;
class UploadFailure extends Error {
  constructor(status,code){super(code);this.status=status;this.code=code;}
}
/** Customer-initiated uploads, bounded in memory. No generation or debit here. */
export function createUploadHandler({control,secret,fetcher=fetch,maxUploads=4,stateDir}) {
  if(!stateDir)throw new Error('Upload requires a private persistent state directory');
  let active=0;
  const wallets=new Map();
  const call=async body=>{
    const response=await fetcher(control,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new UploadFailure([401,403,404,409,422,429].includes(response.status)?response.status:503,'upload_control_unavailable');
    return response.json();
  };
  let storageError;
  const ready=mkdir(stateDir,{recursive:true,mode:0o700}).catch(error=>{storageError=error;});
  const remember=async(id,name)=>{
    await ready;
    if(storageError)throw storageError;
    const path=join(stateDir,`${id}.json`);
    await writeFile(path+'.tmp',JSON.stringify({id,name,created:Date.now()}),{mode:0o600});
    await rename(path+'.tmp',path);
  };
  const forget=id=>unlink(join(stateDir,`${id}.json`)).catch(()=>undefined);
  let draining=false;
  const drain=async()=>{
    if(draining)return;draining=true;
    try{await ready;for(const name of await readdir(stateDir)){
      if(!/^[a-f0-9-]{36}\.json$/i.test(name))continue;
      try{const item=JSON.parse(await readFile(join(stateDir,name),'utf8'));
        if(item.id!==name.slice(0,-5)||!/^files\/[a-zA-Z0-9_-]+$/.test(item.name))continue;
        await call({action:'upload.complete',id:item.id,name:item.name});await forget(item.id);
      }catch(error){
        // A removed resource or a terminal conflict cannot be confirmed later.
        if(error instanceof UploadFailure&&[404,409].includes(error.status))await forget(name.slice(0,-5));
      }
    }}finally{draining=false;}
  };
  const timer=setInterval(()=>drain().catch(()=>undefined),15000);timer.unref();
  const upload=async function(req,res) {
    const match=req.url?.match(/^\/uploads\/([a-f0-9-]{36})$/i);
    if(!match)return false;
    let claimed=false,providerCreated=false,wallet,slot=false;
    const id=match[1];
    const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'PUT, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Expose-Headers':'Retry-After'};
    const reply=(status,value)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...cors,...(status===429?{'Retry-After':'60'}:{})});res.end(JSON.stringify(value));}};
    try {
      if(req.method==='OPTIONS'){res.writeHead(204,{...cors,'Access-Control-Max-Age':'600'});res.end();return true;}
      if(req.method!=='PUT')throw new UploadFailure(405,'method_not_allowed');
      const ticket=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      if(!ticket)throw new UploadFailure(401,'invalid_upload_ticket');
      await ready;
      if(storageError||(await readdir(stateDir)).filter(name=>name.endsWith('.json')).length>=1024)throw new UploadFailure(503,'upload_recovery_capacity');
      const length=Number(req.headers['content-length']);
      if(!Number.isSafeInteger(length)||length<1||length>maximum)throw new UploadFailure(413,'invalid_upload_size');
      if(active>=maxUploads)throw new UploadFailure(429,'upload_capacity');
      active++;slot=true;
      const session=await call({action:'upload.connect',id,access_key:ticket});claimed=true;
      if(session.id!==id||session.size_bytes!==length||session.mime_type!==req.headers['content-type']||typeof session.api_key!=='string'||!session.organization_id)throw new UploadFailure(422,'upload_metadata_mismatch');
      wallet=session.organization_id;
      if((wallets.get(wallet)??0)>=2){wallet=undefined;throw new UploadFailure(429,'upload_capacity');}
      wallets.set(wallet,(wallets.get(wallet)??0)+1);
      req.setTimeout(60000,()=>req.destroy());
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>length||size>maximum)throw new UploadFailure(413,'invalid_upload_size');chunks.push(chunk);}
      if(size!==length)throw new UploadFailure(422,'upload_incomplete');
      const bytes=Buffer.concat(chunks,size);
      const start=await fetcher(`${origin}/upload/v1beta/files`,{method:'POST',redirect:'error',headers:{'x-goog-api-key':session.api_key,'Content-Type':'application/json','X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(size),'X-Goog-Upload-Header-Content-Type':session.mime_type},body:JSON.stringify({file:{display_name:session.display_name}}),signal:AbortSignal.timeout(30000)});
      if(!start.ok)throw new UploadFailure(502,'upload_provider_unavailable');
      const target=new URL(start.headers.get('x-goog-upload-url')??'');
      if(target.origin!==origin||target.username||target.password||!target.pathname.startsWith('/upload/'))throw new UploadFailure(502,'upload_provider_unavailable');
      const finish=await fetcher(target,{method:'POST',redirect:'error',headers:{'Content-Type':session.mime_type,'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize'},body:bytes,signal:AbortSignal.timeout(60000)});
      if(!finish.ok)throw new UploadFailure(502,'upload_provider_unavailable');
      const result=await finish.json(),name=result.file?.name;
      if(typeof name!=='string'||!/^files\/[a-zA-Z0-9_-]+$/.test(name))throw new UploadFailure(502,'upload_provider_unavailable');
      providerCreated=true;
      // Persist only resource identifiers, never content, bearer tickets or API keys.
      await remember(id,name);
      // Retry only the idempotent confirmation, never the bytes or generation.
      let confirmed,lastError;
      for(let attempt=0;attempt<3;attempt++)try{confirmed=await call({action:'upload.complete',id,name});break;}catch(error){lastError=error;}
      if(!confirmed)throw lastError??new UploadFailure(503,'upload_confirmation_pending');
      await forget(id);
      reply(201,confirmed);
    }catch(error){
      if(claimed&&!providerCreated)await call({action:'upload.fail',id}).catch(()=>undefined);
      reply(error instanceof UploadFailure?error.status:503,{error:{code:providerCreated?'upload_confirmation_pending':error instanceof UploadFailure?error.code:'upload_unavailable',message:providerCreated?'Confirmação pendente; consulte o arquivo pelo ID antes de repetir.':'Não foi possível concluir este envio.',file_id:id}});
    }finally{
      if(slot)active--;
      if(wallet){const count=(wallets.get(wallet)??1)-1;if(count)wallets.set(wallet,count);else wallets.delete(wallet);}
      req.resume();
    }
    return true;
  };
  upload.close=()=>clearInterval(timer);
  upload.flush=drain;
  return upload;
}

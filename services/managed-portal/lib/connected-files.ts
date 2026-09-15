import 'server-only';
import {readFile} from 'node:fs/promises';
import {request as httpRequest} from 'node:http';
import type {SupabaseClient} from '@supabase/supabase-js';
import {ManagedError,id} from '@/lib/managed-projects/server';
import {connectedSource} from './connected-source';
const limit=20_000_000;
export async function connectedFile(db:SupabaseClient,admin:boolean,projectId:string,source:string,fileId:string,head=false){
 const connection=await connectedSource(db,admin,projectId);
 if(connection.source_key!=='connectyhub-production'||source!=='lead_files'||!connection.snapshot?.files.some(f=>f.id===id(fileId)&&f.source===source&&f.availability==='registered'))throw new ManagedError(404,'Arquivo não disponível nesta conexão.');
 const key=(await readFile('/run/secrets/file-gateway-key','utf8')).trim();
 const result=await new Promise<{bytes:Buffer;size:number}>((resolve,reject)=>{
  const req=httpRequest({socketPath:'/run/connected-files/gateway.sock',path:`/files/lead_files/${fileId}`,method:head?'HEAD':'GET',headers:{Authorization:`Bearer ${key}`}},res=>{
   if(res.statusCode!==200){res.resume();reject(new ManagedError(res.statusCode===404?404:res.statusCode===413?413:503,'Arquivo indisponível na origem.'));return;}
   const chunks:Buffer[]=[];let size=0;
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>limit){res.destroy();reject(new ManagedError(413,'Arquivo excede o limite de 20 MB.'));}else chunks.push(chunk);});
   res.on('end',()=>resolve({bytes:Buffer.concat(chunks),size:head?Number(res.headers['content-length']??0):size}));res.on('error',()=>reject(new ManagedError(503,'Não foi possível ler o arquivo.')));
  });
  req.setTimeout(30000,()=>req.destroy());req.on('error',()=>reject(new ManagedError(503,'Leitura de arquivos temporariamente indisponível.')));req.end();
 });
 return new Response(head?null:new Uint8Array(result.bytes),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(result.size),'Content-Disposition':`attachment; filename="${fileId}.bin"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}

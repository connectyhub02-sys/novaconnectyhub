// Local integration only. The gateway routes to real rehearsal Auth/PostgREST.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createServerClient} from '@supabase/ssr';

export async function realNextSessions({issued,ids,anonKey,serviceKey,check}){
 const gateway=createServer(async(req,res)=>{
  const prefix=req.url.startsWith('/auth/v1/')?'/auth/v1':req.url.startsWith('/rest/v1/')?'/rest/v1':null;
  if(!prefix){res.writeHead(404);res.end();return;}
  try{
   const target=`http://127.0.0.1:${prefix==='/auth/v1'?18302:18301}${req.url.slice(prefix.length)}`;
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const headers={};for(const name of ['authorization','content-type','prefer','accept','range'])if(req.headers[name])headers[name]=req.headers[name];
   const result=await fetch(target,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined,redirect:'manual',signal:AbortSignal.timeout(15000)});
   res.writeHead(result.status,{'Content-Type':result.headers.get('content-type')??'application/json'});res.end(Buffer.from(await result.arrayBuffer()));
  }catch{res.writeHead(502);res.end('{}');}
 });
 await new Promise(r=>gateway.listen(18303,'127.0.0.1',r));
 let child;let logs='';
 try{
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3027'],{stdio:'pipe',windowsHide:true,env:{...process.env,MANAGED_PROJECTS_ENABLED:'true',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:18303',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:anonKey,SUPABASE_SECRET_KEY:serviceKey}});
  child.stdout.on('data',b=>{logs=(logs+String(b)).slice(-3000);});child.stderr.on('data',b=>{logs=(logs+String(b)).slice(-3000);});
  let ready=false;for(let i=0;i<120;i++){try{ready=(await fetch('http://127.0.0.1:3027/api/managed-projects',{signal:AbortSignal.timeout(3000)})).status===401;if(ready)break;}catch{}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,500));}
  check(ready,'Next anonymous session denied; startup '+logs.replaceAll(anonKey,'[redacted]').replaceAll(serviceKey,'[redacted]'));
  const cookies=new Map();
  for(const user of [ids.a,ids.b,ids.admin,ids.productAdmin]){
   const jar=new Map();const sdk=createServerClient('http://127.0.0.1:18303',anonKey,{cookies:{getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll:values=>{for(const {name,value}of values)jar.set(name,value);}}});
   const session=issued.get(user);const result=await sdk.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});check(!result.error,'SSR accepted real Auth session');
   const cookie=Array.from(jar,([k,v])=>`${k}=${v}`).join('; ');cookies.set(user,cookie);
   const response=await fetch('http://127.0.0.1:3027/api/managed-projects',{headers:{Cookie:cookie}});const body=await response.json();
   check(response.ok,'Next cookie authenticated');
   const expected=user===ids.admin?[ids.pA,ids.pB]:user===ids.a?[ids.pA]:user===ids.b?[ids.pB]:[];
   check(JSON.stringify(body.projects.map(p=>p.id).sort())===JSON.stringify(expected.sort()),'Next project scope');
   check(body.admin===(user===ids.admin),'Next explicit infrastructure admin');
  }
  const ownEngine=await fetch(`http://127.0.0.1:3027/api/managed-projects/${ids.pA}/engine`,{headers:{Cookie:cookies.get(ids.a)}});check(ownEngine.ok&&(await ownEngine.json()).configured===false,'Next engine unconfigured rather than fabricated');
  const crossEngine=await fetch(`http://127.0.0.1:3027/api/managed-projects/${ids.pA}/engine`,{headers:{Cookie:cookies.get(ids.b)}});check(crossEngine.status===404,'Next engine cross-project denied');
  const page=await fetch(`http://127.0.0.1:3027/infraestrutura/projetos/${ids.pA}/banco`,{headers:{Cookie:cookies.get(ids.a)}});const html=await page.text();check(page.ok&&html.includes('fictional-a')&&!html.includes('fictional-b'),'Next renders only own project');
  const denied=await fetch(`http://127.0.0.1:3027/api/managed-projects/${ids.pA}`,{headers:{Cookie:cookies.get(ids.b)}});check(denied.status===404,'Next cross-project detail denied');
  const invalid=await fetch('http://127.0.0.1:3027/api/managed-projects',{headers:{Cookie:'sb-127-auth-token=invalid'}});check(invalid.status===401,'Next invalid cookie denied');
 }finally{
  if(child&&child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
  await new Promise(r=>gateway.close(r));
 }
}

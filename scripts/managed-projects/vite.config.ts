import {defineConfig} from 'vite';
import {resolve} from 'node:path';
const root=process.cwd();const here=resolve(root,'scripts/managed-projects');
process.env.MANAGED_TELEMETRY_TOKEN='LOCAL_PILOT_TELEMETRY_NOT_A_PRODUCTION_SECRET';
export default defineConfig({root:here,resolve:{alias:[
 {find:'@/lib/managed-projects/server',replacement:resolve(here,'server-adapter.ts')},
 {find:'@/lib/supabase/service',replacement:resolve(here,'pilot-db.ts')},
 {find:'@/lib/supabase/server',replacement:resolve(here,'empty.ts')},
 {find:'server-only',replacement:resolve(here,'empty.ts')},
 {find:'next/link',replacement:resolve(here,'navigation.tsx')},
 {find:'next/navigation',replacement:resolve(here,'navigation.tsx')},
 {find:'@',replacement:resolve(root,'src')},
 ]},server:{host:'127.0.0.1',port:3026,strictPort:true,fs:{allow:[root]}},plugins:[{name:'isolated-managed-pilot',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(!req.url?.startsWith('/api/')&&!req.url?.startsWith('/__pilot/'))return next();
 try{
 const db=await server.ssrLoadModule(resolve(here,'pilot-db.ts'));const origin='http://127.0.0.1:3026';const url=new URL(req.url,origin);
 const identity=/pilot_identity=([a-z]+)/.exec(req.headers.cookie??'')?.[1]??'admin';const user=db.users[identity]??db.users.connectyhub;
 await db.context.run({user},async()=>{
 let response:Response;
 if(url.pathname==='/__pilot/state'){
 const api=await server.ssrLoadModule(resolve(here,'server-adapter.ts'));const session=await api.managedSession();const path=(url.searchParams.get('path')??'/infraestrutura').split('/').filter(Boolean).slice(1);
 const companies=api.unwrap(await session.db.rpc("managed_companies"))??[];
 const projects=api.unwrap(await session.db.from('managed_projects').select('*').order('name',{ascending:true}).limit(200));let snapshot;let samples;let settings;
 if(path[0]==='projetos'&&path[1])snapshot=await api.projectSnapshot(session.db,path[1]);
 if(path[0]==='vps'){api.requireInfrastructure(session.admin);samples=api.unwrap(await session.db.from('infrastructure_samples').select('*').order('measured_at',{ascending:false}).limit(120));settings=api.unwrap(await session.db.from('infrastructure_alert_settings').select('*').eq('id',true).single());}
 response=Response.json({identity,admin:session.admin,userId:session.userId,projects,companies,snapshot,path,samples,settings});
 }else{
 const parts=url.pathname.split('/').filter(Boolean);let file:string;let params:Record<string,string>={};
 if(parts[1]==='managed-projects'&&!parts[2])file='managed-projects/route.ts';else if(parts[1]==='managed-projects'&&parts[2]&&!parts[3]){file='managed-projects/[projectId]/route.ts';params={projectId:parts[2]};}else if(parts[1]==='managed-projects'&&parts[3]==='files'&&parts[4]){file='managed-projects/[projectId]/files/[fileId]/route.ts';params={projectId:parts[2],fileId:parts[4]};}else if(['managed-infrastructure','managed-workers','managed-telemetry'].includes(parts[1]))file=parts[1]+'/route.ts';else{res.statusCode=404;res.end();return;}
 const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1450000){res.statusCode=413;res.end();return;}chunks.push(chunk);}
 const headers=new Headers();for(const [key,v]of Object.entries(req.headers))if(typeof v==='string')headers.set(key,v);
 const request=new Request(url,{method:req.method,headers,...(req.method!=='GET'&&req.method!=='HEAD'?{body:Buffer.concat(chunks)}:{})});
 const route=await server.ssrLoadModule(resolve(root,'src/app/api',file));response=await route[req.method??'GET'](request,{params:Promise.resolve(params)});
 }
 res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await response.arrayBuffer()));
 });
 }catch(error){res.statusCode=error&&typeof error==='object'&&'status'in error?Number(error.status):500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error instanceof Error?error.message:'Pilot unavailable'}));}
 });}}]});

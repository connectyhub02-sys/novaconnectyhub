import {notFound,redirect} from 'next/navigation';
import {ManagedPortal,type PortalProps} from '@/components/managed-projects/portal';
import {managedSession,ManagedError,projectSnapshot,requireInfrastructure,unwrap} from '@/lib/managed-projects/server';
import type {HostSample,AlertSettings} from '@/lib/managed-projects/contracts';
export const dynamic='force-dynamic';
export const metadata={title:'Infraestrutura e projetos | ConnectyHub',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{path?:string[]}>}){
 const path=(await params).path??[];
 let props:PortalProps;let failure:string|undefined;
 try{
 const {db,admin,userId}=await managedSession();
 const companies=unwrap(await db.rpc('managed_companies'))??[];
 const projects=unwrap(await db.from('managed_projects').select('*').order('name').limit(200))??[];
 let snapshot;let samples:HostSample[]|undefined;let settings:AlertSettings|undefined;
 if(path[0]==='projetos'&&path[1]){
  if(path.length>4||!['banco','automacoes','configuracoes'].includes(path[2]??'banco'))notFound();
  const allowed=path[2]==='automacoes'?['apps','functions','runs','events']:['tabelas','arquivos','auth','logs'];if(path[3]&&!allowed.includes(path[3]))notFound();
  snapshot=await projectSnapshot(db,path[1]);
 }else if(path[0]==='vps'&&path.length===1){requireInfrastructure(admin);const [s,a]=await Promise.all([db.from('infrastructure_samples').select('*').order('measured_at',{ascending:false}).limit(120),db.from('infrastructure_alert_settings').select('*').eq('id',true).single()]);samples=unwrap(s)??[];settings=unwrap(a);}
 else if(path.length)notFound();
 props={projects,companies,snapshot,admin,userId,path,samples,settings};
 }catch(e){if(e instanceof ManagedError){if(e.status===401)redirect('/login');if(e.status===403||e.status===404)notFound();failure=e.message;}else throw e;}
 if(failure)return <main style={{padding:32}}><h1>Projetos gerenciados</h1><p>{failure}</p></main>;
 return <ManagedPortal {...props!}/>;
}

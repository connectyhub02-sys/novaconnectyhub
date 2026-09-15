import {managedSession,managedFailure,projectSnapshot,readBody,requireInfrastructure,unwrap,id,label,integer,ManagedError} from '@/lib/managed-projects/server';
type Context={params:Promise<{projectId:string}>};
export async function GET(_request:Request,context:Context){try{const {db}=await managedSession();return Response.json(await projectSnapshot(db,(await context.params).projectId),{headers:{'Cache-Control':'no-store'}});}catch(e){return managedFailure(e);}}
export async function POST(request:Request,context:Context){try{
 const {db,admin}=await managedSession();const projectId=id((await context.params).projectId);const snapshot=await projectSnapshot(db,projectId);const b=await readBody(request);let result:unknown;
 switch(b.action){
 case 'record.create':{const collection=label(b.collection,48);if(!/^[a-z][a-z0-9_]{0,47}$/.test(collection)||!b.data||typeof b.data!=='object'||Array.isArray(b.data)||Buffer.byteLength(JSON.stringify(b.data))>16384)throw new ManagedError(400,'Registro inválido.');result=unwrap(await db.from('managed_records').insert({project_id:projectId,organization_id:snapshot.project.organization_id,collection,data:b.data}).select('id').single());break;}
 case 'record.update':{if(!b.data||typeof b.data!=='object'||Array.isArray(b.data)||Buffer.byteLength(JSON.stringify(b.data))>16384)throw new ManagedError(400,'Registro inválido.');result=unwrap(await db.from('managed_records').update({data:b.data}).eq('project_id',projectId).eq('id',id(b.id)).select('id').single());break;}
 case 'resource.link':requireInfrastructure(admin);if(!['ai','voice'].includes(String(b.kind)))throw new ManagedError(400,'Tipo de recurso inválido.');result=unwrap(await db.from('managed_resource_links').insert({project_id:projectId,organization_id:snapshot.project.organization_id,[b.kind==='ai'?'ai_project_id':'voice_project_id']:id(b.resource_id)}).select('*').single());break;
 case 'resource.unlink':requireInfrastructure(admin);result=unwrap(await db.from('managed_resource_links').delete().eq('project_id',projectId).eq('id',id(b.id)).select('id'));break;
 case 'record.delete':result=unwrap(await db.from('managed_records').delete().eq('project_id',projectId).eq('id',id(b.id)).select('id'));break;
 case 'file.create':result=unwrap(await db.rpc('managed_put_file',{p_project:projectId,p_name:label(b.name,120),p_base64:label(b.base64,1398104)}));break;
 case 'file.delete':result=unwrap(await db.rpc('managed_delete_file',{p_project:projectId,p_file:id(b.id)}));break;
 case 'job.create':result=unwrap(await db.rpc('managed_enqueue',{p_project:projectId,p_idempotency:label(b.idempotency_key)}));break;
 case 'member.put':requireInfrastructure(admin);if(!['viewer','operator'].includes(String(b.role)))throw new ManagedError(400,'Papel inválido.');result=unwrap(await db.from('managed_project_members').upsert({project_id:projectId,organization_id:snapshot.project.organization_id,user_id:id(b.user_id),role:b.role},{onConflict:'project_id,user_id'}).select('user_id,role'));break;
 case 'member.delete':requireInfrastructure(admin);result=unwrap(await db.from('managed_project_members').delete().eq('project_id',projectId).eq('user_id',id(b.user_id)).select('user_id'));break;
 case 'project.update':requireInfrastructure(admin);if(!['draft','active','paused'].includes(String(b.status)))throw new ManagedError(400,'Estado inválido.');result=unwrap(await db.from('managed_projects').update({status:b.status,concurrency_limit:integer(b.concurrency_limit,1,8),queue_limit:integer(b.queue_limit,1,10000),storage_limit_bytes:integer(b.storage_limit_bytes,0,1073741824)}).eq('id',projectId).select('*').single());break;
 default:throw new ManagedError(400,'Ação não disponível.');
 }return Response.json({result});
 }catch(e){return managedFailure(e);}}

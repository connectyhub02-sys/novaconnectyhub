import {managedSession,managedFailure,id,unwrap,ManagedError} from '@/lib/managed-projects/server';
import {readInngestMetadata} from '../../../../../../services/managed-worker/inngest-reader.mjs';

export async function GET(_request:Request,{params}:{params:Promise<{projectId:string}>}){
 try{
  const {db}=await managedSession();const projectId=id((await params).projectId);
  const project=unwrap(await db.from('managed_projects').select('id').eq('id',projectId).maybeSingle());
  if(!project)throw new ManagedError(404,'Projeto não encontrado.');
  const binding=unwrap(await db.from('managed_inngest_bindings').select('app_id').eq('project_id',projectId).maybeSingle());
  if(!binding)return Response.json({configured:false},{headers:{'Cache-Control':'no-store'}});
  const endpoint=process.env.MANAGED_INNGEST_GRAPHQL_URL,authorization=process.env.MANAGED_INNGEST_AUTHORIZATION;
  if(!endpoint||!authorization)throw new ManagedError(503,'Conexão do motor ainda não configurada.');
  const metadata=await readInngestMetadata({endpoint,authorization,appId:binding.app_id});
  return Response.json({configured:true,...metadata},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return managedFailure(error);}
}

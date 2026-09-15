import {managedSession,managedFailure,projectSnapshot} from '@/lib/managed-projects/server';
export async function GET(_r:Request,{params}:{params:Promise<{projectId:string}>}){try{const {db}=await managedSession();await projectSnapshot(db,(await params).projectId);return Response.json({configured:false},{headers:{'Cache-Control':'no-store'}});}catch(e){return managedFailure(e);}}

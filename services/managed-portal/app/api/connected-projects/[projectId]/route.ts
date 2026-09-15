import {managedSession,managedFailure} from '@/lib/managed-projects/server';
import {connectedSource} from '@portal/lib/connected-source';
export async function GET(_request:Request,{params}:{params:Promise<{projectId:string}>}){
 try{const {db,admin}=await managedSession();return Response.json(await connectedSource(db,admin,(await params).projectId),{headers:{'Cache-Control':'private, no-store'}});}
 catch(error){return managedFailure(error);}
}

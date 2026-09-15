import {managedSession,managedFailure} from '@/lib/managed-projects/server';
import {connectedFile} from '@portal/lib/connected-files';
type Context={params:Promise<{projectId:string;source:string;fileId:string}>};
async function serve(request:Request,context:Context){
 try{const {db,admin}=await managedSession(),p=await context.params;return await connectedFile(db,admin,p.projectId,p.source,p.fileId,request.method==='HEAD');}
 catch(error){return managedFailure(error);}
}
export const GET=serve;
export const HEAD=serve;

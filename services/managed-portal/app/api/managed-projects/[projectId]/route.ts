import {GET as originalGet,POST as originalPost} from '@source/app/api/managed-projects/[projectId]/route';
import {managedSession,id,unwrap,ManagedError,managedFailure} from '@/lib/managed-projects/server';
type Context={params:Promise<{projectId:string}>};
async function guard(context:Context){const {db}=await managedSession();const projectId=id((await context.params).projectId);const connected=unwrap(await db.rpc('portal_is_connected_project',{p_project:projectId}));if(connected)throw new ManagedError(403,'Projeto conectado somente em leitura; use a consulta de origem.');}
export async function GET(request:Request,context:Context){try{await guard(context);return originalGet(request,context);}catch(error){return managedFailure(error);}}
export async function POST(request:Request,context:Context){try{await guard(context);return originalPost(request,context);}catch(error){return managedFailure(error);}}

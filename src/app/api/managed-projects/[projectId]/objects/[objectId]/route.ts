import {managedSession,managedFailure,id,label,readBody,ManagedError} from '@/lib/managed-projects/server';
import {getObject,putObject,deleteObject} from '@/lib/managed-projects/objects';
type Context={params:Promise<{projectId:string;objectId:string}>};
export async function GET(_request:Request,context:Context){try{const {db}=await managedSession();const params=await context.params;const {row,bytes}=await getObject(db,id(params.projectId),id(params.objectId));return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return managedFailure(e);}}
export async function POST(request:Request,context:Context){try{const {db}=await managedSession();const params=await context.params;const project=id(params.projectId),object=id(params.objectId),body=await readBody(request);let result;
 if(body.action==='put'){const encoded=typeof body.base64==='string'?body.base64:'';if(encoded.length>1398104||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw new ManagedError(400,'Arquivo inválido.');result=await putObject(db,project,object,label(body.name,120),Buffer.from(encoded,'base64'));}
 else if(body.action==='delete')result=await deleteObject(db,project,object);else throw new ManagedError(400,'Ação inválida.');return Response.json({result});
 }catch(e){return managedFailure(e);}}

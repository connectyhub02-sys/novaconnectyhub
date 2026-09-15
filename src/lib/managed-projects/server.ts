import 'server-only';
import {createClient} from '@/lib/supabase/server';
import type {SupabaseClient} from '@supabase/supabase-js';
import {uuidPattern,type ProjectSnapshot} from './contracts';

export const managedEnabled=()=>process.env.MANAGED_PROJECTS_ENABLED==='true';
export class ManagedError extends Error {constructor(public status:number,message:string){super(message);}}
export async function managedSession(){
 if(!managedEnabled())throw new ManagedError(404,'Recurso indisponível.');
 const db=await createClient();const {data,error}=await db.auth.getUser();
 if(error||!data.user)throw new ManagedError(401,'Entre na sua conta.');
 const admin=await db.rpc('is_infrastructure_admin');
 if(admin.error)throw new ManagedError(503,'Infraestrutura de projetos ainda não configurada.');
 return {db,userId:data.user.id,admin:admin.data===true};
}
export function requireInfrastructure(admin:boolean){if(!admin)throw new ManagedError(403,'Acesso exclusivo da administração de infraestrutura.');}
export function id(value:unknown){if(typeof value!=='string'||!uuidPattern.test(value))throw new ManagedError(400,'Identificador inválido.');return value;}
export function label(value:unknown,max=100){if(typeof value!=='string'||!value.trim()||value.length>max)throw new ManagedError(400,'Texto inválido.');return value.trim();}
export function integer(value:unknown,min:number,max:number){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new ManagedError(400,'Limite inválido.');return value;}
export function unwrap<T>(result:{data:T;error:unknown}):T{if(result.error)throw new ManagedError(409,'Operação não concluída. Confira permissões, estado e limites do projeto.');return result.data;}
export async function projectSnapshot(db:SupabaseClient,projectId:string):Promise<ProjectSnapshot>{
 const project=unwrap(await db.from('managed_projects').select('*').eq('id',id(projectId)).maybeSingle());
 if(!project)throw new ManagedError(404,'Projeto não encontrado.');
 const names=['managed_records','managed_files','managed_jobs','managed_logs','managed_usage','managed_project_members','managed_resource_links','managed_objects'] as const;
 const selections=['id,collection,data,created_at','id,name,bytes,created_at','id,kind,status,created_at,started_at,finished_at,result_code','id,job_id,code,created_at','id,operation_id,unit,quantity,created_at','user_id,role','id,ai_project_id,voice_project_id','id,name,bytes,status,sha256,created_at'];
 const rows=await Promise.all(names.map((name,i)=>{let q=db.from(name).select(selections[i]).eq('project_id',projectId).limit(201);if(name!=='managed_project_members'&&name!=='managed_resource_links')q=q.order('created_at',{ascending:false});return q;}));
 const data=rows.map(r=>unwrap(r)??[]);return {project,records:data[0].slice(0,200),files:data[1].slice(0,200),jobs:data[2].slice(0,200),logs:data[3].slice(0,200),usage:data[4].slice(0,200),members:data[5].slice(0,200),resources:data[6].slice(0,200),objects:data[7].slice(0,200),truncated:data.some(d=>d.length>200)} as unknown as ProjectSnapshot;
}
export async function readBody(request:Request,max=1450000):Promise<Record<string,unknown>>{
 const origin=request.headers.get('origin');const expectedOrigin=process.env.MANAGED_PUBLIC_ORIGIN??new URL(request.url).origin;if(origin&&origin!==expectedOrigin)throw new ManagedError(403,'Origem inválida.');
 const reader=request.body?.getReader();if(!reader)throw new ManagedError(400,'Dados obrigatórios.');
 const chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max){await reader.cancel();throw new ManagedError(413,'Arquivo ou requisição muito grande.');}chunks.push(value);}}finally{reader.releaseLock();}
 try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new ManagedError(400,'JSON inválido.');}
}
export function managedFailure(error:unknown){return Response.json({error:error instanceof ManagedError?error.message:'Serviço temporariamente indisponível.'},{status:error instanceof ManagedError?error.status:503,headers:{'Cache-Control':'no-store'}});}

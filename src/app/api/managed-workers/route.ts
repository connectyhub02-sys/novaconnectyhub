import {createHash} from 'node:crypto';
import {createServiceClient} from '@/lib/supabase/service';
import {managedEnabled,managedFailure,ManagedError,readBody,id} from '@/lib/managed-projects/server';
export async function POST(request:Request){try{
 if(!managedEnabled())throw new ManagedError(404,'Recurso indisponível.');
 const match=/^Bearer (mpw_[a-zA-Z0-9_-]{32,128})$/.exec(request.headers.get('authorization')??'');
 if(!match)throw new ManagedError(401,'Credencial de worker obrigatória.');
 const hash=createHash('sha256').update(match[1]).digest('hex');const b=await readBody(request,4096);const db=createServiceClient();
 const r=b.action==='claim'?await db.rpc('managed_claim',{p_worker_hash:hash}):b.action==='finish'&&typeof b.success==='boolean'?await db.rpc('managed_finish',{p_worker_hash:hash,p_job:id(b.job_id),p_token:id(b.lease_token),p_success:b.success}):null;
 if(!r)throw new ManagedError(400,'Ação inválida.');if(r.error)throw new ManagedError(403,'Worker indisponível ou credencial inválida.');
 return Response.json({result:r.data},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return managedFailure(e);}}

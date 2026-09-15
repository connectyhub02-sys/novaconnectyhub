import {createHash,timingSafeEqual} from 'node:crypto';
import {createServiceClient} from '@/lib/supabase/service';
import {managedEnabled,managedFailure,ManagedError,readBody,integer,unwrap} from '@/lib/managed-projects/server';
const names=new Set(['supabase-db','supabase-auth','supabase-storage','supabase-studio','connectyhub-inngest-inngest-1','connectyhub-inngest-postgres-1','connectyhub-inngest-redis-1','container-collector']);
const statuses=new Set(['healthy','unhealthy','starting','running','exited','restarting','unknown','unavailable']);
export async function POST(request:Request){try{
 if(!managedEnabled())throw new ManagedError(404,'Recurso indisponível.');
 const expected=process.env.MANAGED_TELEMETRY_TOKEN;if(!expected||expected.length<32)throw new ManagedError(503,'Coleta não configurada.');
 const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
 const hash=(s:string)=>createHash('sha256').update(s).digest();if(!timingSafeEqual(hash(expected),hash(supplied)))throw new ManagedError(401,'Credencial inválida.');
 const b=await readBody(request,20000);const measured=Date.parse(String(b.measured_at));if(!Number.isFinite(measured)||Math.abs(Date.now()-measured)>300000)throw new ManagedError(400,'Horário de coleta inválido.');
 const cpu=b.cpu_percent;if(cpu!==null&&(typeof cpu!=='number'||!Number.isFinite(cpu)||cpu<0||cpu>100))throw new ManagedError(400,'CPU inválida.');
 if(!Array.isArray(b.services)||b.services.length>names.size||b.services.some(s=>!s||!names.has(s.name)||!statuses.has(s.status))||new Set(b.services.map(s=>s.name)).size!==b.services.length)throw new ManagedError(400,'Serviços inválidos.');
 const mem=integer(b.memory_total,1,Number.MAX_SAFE_INTEGER),disk=integer(b.disk_total,1,Number.MAX_SAFE_INTEGER);
 unwrap(await createServiceClient().rpc('managed_record_host_sample',{p_sample:{measured_at:new Date(measured).toISOString(),cpu_percent:cpu,memory_total:mem,memory_available:integer(b.memory_available,0,mem),disk_total:disk,disk_used:integer(b.disk_used,0,disk),network_rx_bytes:b.network_rx_bytes===null?null:integer(b.network_rx_bytes,0,Number.MAX_SAFE_INTEGER),network_tx_bytes:b.network_tx_bytes===null?null:integer(b.network_tx_bytes,0,Number.MAX_SAFE_INTEGER),services:b.services.map(s=>({name:s.name,status:s.status}))}}));return Response.json({ok:true});
 }catch(e){return managedFailure(e);}}

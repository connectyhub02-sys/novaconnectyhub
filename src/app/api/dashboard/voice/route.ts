import {voiceWorkspace,createVoiceSecret} from '@/lib/voice-api/auth';
import {voiceJson,voiceFailure,VoiceError} from '@/lib/voice-api/contract';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const {client,org,billingOrg}=await voiceWorkspace();
 const days=Math.min(90,Math.max(1,Number(new URL(request.url).searchParams.get('days'))||30));
 const [projects,wallet,summary,history]=await Promise.all([
  client.from('voice_projects').select('id,name,status,monthly_credit_limit,voice_api_keys(id,name,key_prefix,status,expires_at)').eq('organization_id',org).order('created_at'),
  client.from('credit_wallets').select('balance_credits,reserved_credits').eq('organization_id',billingOrg).maybeSingle(),
  client.rpc('voice_usage_summary',{p_org:org,p_days:days}),
  client.from('voice_generations').select('id,project_id,operation,voice_id,model_id,status,characters,charged_credits,reserved_credits,error_code,created_at').eq('organization_id',org).gte('created_at',new Date(Date.now()-days*86400000).toISOString()).order('created_at',{ascending:false}).limit(50),
 ]);
 if([projects,wallet,summary,history].some(r=>r.error))throw new VoiceError('service_unavailable',503,'Não foi possível carregar a gestão de Voz.');
 return voiceJson({projects:projects.data,wallet:wallet.data,summary:summary.data,history:history.data,billing_organization_id:billingOrg});
}catch(e){return voiceFailure(e);}}
export async function POST(request:Request){try{
 const {w,client,org}=await voiceWorkspace();
 const membership=await client.from('organization_members').select('role').eq('organization_id',org).eq('user_id',w.user.id).maybeSingle();
 if(!w.profile.isPlatformAdmin && (membership.error||!['owner','admin'].includes(membership.data?.role)))throw new VoiceError('forbidden',403,'Somente administradores da conta podem gerenciar projetos e chaves.');
 const b=await request.json();
 if(b.action==='create_project'){
  const name=typeof b.name==='string'?b.name.trim():'';
  if(!name||name.length>100)throw new VoiceError('invalid_name',422,'Informe um nome de até 100 caracteres.');
  const {data,error}=await client.from('voice_projects').insert({organization_id:org,name}).select('id').single();
  if(error)throw new VoiceError('save_failed',503,'Não foi possível criar o projeto.');return voiceJson({project:data});
 }
 const {data:p,error}=await client.from('voice_projects').select('id').eq('id',b.project_id).eq('organization_id',org).maybeSingle();
 if(error||!p)throw new VoiceError('not_found',404,'Projeto não encontrado.');
 if(b.action==='create_key'){
  const key=createVoiceSecret();
  const name=String(b.name||'Chave de Voz').trim().slice(0,100);if(!name)throw new VoiceError('invalid_name',422,'Nome obrigatório.');
  const saved=await client.from('voice_api_keys').insert({project_id:p.id,name,key_hash:key.key_hash,key_prefix:key.key_prefix});
  if(saved.error)throw new VoiceError('save_failed',503,'Não foi possível criar a chave.');return voiceJson({secret:key.secret});
 }
 if(b.action==='revoke_key'){
  const saved=await client.from('voice_api_keys').update({status:'revoked'}).eq('id',b.key_id).eq('project_id',p.id);
  if(saved.error)throw new VoiceError('save_failed',503,'Não foi possível revogar a chave.');
 }else if(b.action==='update_project'){
  const limit=b.monthly_credit_limit===null?null:Number(b.monthly_credit_limit);
  if(limit!==null && (!Number.isFinite(limit)||limit<=0))throw new VoiceError('invalid_limit',422,'Informe limite positivo ou nenhum limite.');
  if(!['active','paused'].includes(b.status))throw new VoiceError('invalid_status',422,'Estado inválido.');
  const saved=await client.from('voice_projects').update({status:b.status,monthly_credit_limit:limit}).eq('id',p.id);
  if(saved.error)throw new VoiceError('save_failed',503,'Não foi possível salvar.');
 }else throw new VoiceError('invalid_action',422,'Ação inválida.');
 return voiceJson({ok:true});
}catch(e){return voiceFailure(e);}}

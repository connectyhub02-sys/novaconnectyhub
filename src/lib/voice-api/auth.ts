import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import {createServiceClient} from '@/lib/supabase/service';
import {assertOrganizationOperationalAccess,assertOrganizationFeatureAccess} from '@/lib/billing/access-control';
import {assertContractAccess} from '@/lib/billing/contract-access';
import {getCurrentWorkspace} from '@/lib/supabase/profile';
import type {SupabaseClient} from '@supabase/supabase-js';
import {VoiceError} from './contract';
export const voiceHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function createVoiceSecret() {const secret=`ch_voice_${randomBytes(32).toString('hex')}`;return {secret,key_hash:voiceHash(secret),key_prefix:secret.slice(0,18)};}
export type VoiceProject={id:string;organization_id:string;name:string;status:string;monthly_credit_limit:number|null};
export type VoiceAuth={client:SupabaseClient;project:VoiceProject;keyId:string|null;planCode:string|null;billingOrg:string;studio:boolean};
export async function voiceAccess(client:SupabaseClient,project:VoiceProject,keyId:string|null,studio=false):Promise<VoiceAuth> {
  if(project.status!=='active') throw new VoiceError('project_paused',403,'Este projeto está pausado.');
  const billing=await assertOrganizationOperationalAccess({organizationId:project.organization_id,client});
  await assertOrganizationFeatureAccess({organizationId:project.organization_id,featureCode:'voice_api',client});
  const contract=await assertContractAccess(project.organization_id,client);
  return {client,project,keyId,planCode:billing.planCode,billingOrg:contract.billing_organization_id,studio};
}
export async function authenticateVoice(request:Request,client=createServiceClient()) {
  const secret=request.headers.get('authorization')?.match(/^Bearer (ch_voice_[a-f0-9]{64})$/)?.[1];
  if(!secret) throw new VoiceError('invalid_api_key',401,'Use uma chave ConnectyHub Voz no cabeçalho Authorization.');
  const {data:key,error}=await client.from('voice_api_keys').select('id,project_id,status,expires_at').eq('key_hash',voiceHash(secret)).maybeSingle();
  if(error) throw new VoiceError('service_unavailable',503,'Não foi possível verificar a chave.');
  if(!key || key.status!=='active' || (key.expires_at && Date.parse(key.expires_at)<=Date.now())) throw new VoiceError('invalid_api_key',401,'Chave inválida, revogada ou expirada.');
  const {data:project,error:pe}=await client.from('voice_projects').select('*').eq('id',key.project_id).maybeSingle<VoiceProject>();
  if(pe || !project) throw new VoiceError('project_unavailable',403,'Projeto indisponível.');
  return voiceAccess(client,project,key.id);
}
export async function voiceWorkspace() {
  const w=await getCurrentWorkspace();
  if(!w?.organization) throw new VoiceError('session_required',401,'Entre na sua conta.');
  const client=createServiceClient();
  const contract=await assertContractAccess(w.organization.id,client);
  return {w,client,org:w.organization.id,billingOrg:contract.billing_organization_id,planCode:contract.plan_code};
}
export async function authenticateVoiceStudio(request:Request) {
  const {client,org}=await voiceWorkspace();
  const id=new URL(request.url).searchParams.get('project');
  if(!id || !/^[a-f0-9-]{36}$/i.test(id)) throw new VoiceError('project_required',422,'Escolha um projeto de Voz.');
  const {data:project,error}=await client.from('voice_projects').select('*').eq('id',id).eq('organization_id',org).maybeSingle<VoiceProject>();
  if(error || !project) throw new VoiceError('not_found',404,'Projeto não encontrado nesta conta.');
  return voiceAccess(client,project,null,true);
}

import 'server-only';
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AiApiError,record} from './gateway';
import type {AiAuth} from './operation-ledger';
import {getOwnedAiResource} from './files';
import {aiProviderRequest} from './provider-http';
import {aiModelDefinition} from './model-catalog';

export async function createManagedAiResource(client:SupabaseClient,auth:AiAuth,collection:string,body:Record<string,unknown>) {
  const id=randomUUID(),kind=collection==='agents'?'agent':'environment';
  const model=aiModelDefinition(String(auth.key.model_id??'flash-3.5'));
  if(!model)throw new AiApiError('model_unavailable',422,'Modelo indisponível.');
  const environment:Record<string,unknown>={};
  if(body.network!==undefined)environment.network=body.network;
  if(body.sources!==undefined) {
    if(!Array.isArray(body.sources))throw new AiApiError('invalid_source',422,'Informe sources como lista.');
    // Inline sources avoid using the platform's storage identity for customer input.
    for(const value of body.sources) {
      const source=record(value);
      if(source.type!=='inline'||typeof source.content!=='string'||typeof source.target!=='string'||source.target.includes('..'))throw new AiApiError('invalid_source',422,'Use fontes inline com destino relativo no ambiente.');
    }
    environment.sources=body.sources;
  }
  let payload:Record<string,unknown>=environment;
  if(kind==='agent') {
    const tools=Array.isArray(body.tools)?body.tools.map(record):[];
    for(const tool of tools)if(!['function','code_execution','web_search','url_context','mcp_server'].includes(String(tool.type)))throw new AiApiError('invalid_tool',422,'Ferramenta inválida para o agente.');
    payload={id:`ch_${id.replaceAll('-','')}`,description:String(body.display_name??'Agente').slice(0,200),system_instruction:String(body.system_instruction??''),
      base_agent:'antigravity-preview-05-2026',agent_config:{type:'antigravity',model:model.providerId},tools:tools.map(t=>({...t,type:t.type==='web_search'?'google_search':t.type})),
      ...(Object.keys(environment).length?{base_environment:{type:'remote',...environment}}:{})};
    if(body.environment_id) {
      const env=await getOwnedAiResource(client,auth,String(body.environment_id),'environment');
      if(env.status!=='active')throw new AiApiError('resource_not_ready',422,'Ambiente indisponível.');payload.base_environment=env.provider_name;
    }
  }
  const saved=await client.from('ai_resources').insert({id,organization_id:auth.billingOrganizationId,project_id:auth.project.id,key_id:auth.key.id,model_id:model.id,kind,
    metadata:{display_name:String(body.display_name??(kind==='agent'?'Agente':'Ambiente')).slice(0,200)}}).select('*').single();
  if(saved.error)throw new Error('Não foi possível registrar o recurso.');
  try {
    const result=await aiProviderRequest(client,`/v1beta/${collection}`,'POST',payload);
    if(typeof result.id!=='string')throw new Error('Recurso sem identidade.');
    const update=await client.from('ai_resources').update({provider_name:result.id,status:'active'}).eq('id',id);
    if(update.error)throw new Error('Não foi possível confirmar o recurso.');
    return {id,object:kind,model:model.id,status:'active',display_name:record(saved.data?.metadata).display_name};
  }catch(error){await client.from('ai_resources').update({status:'uncertain'}).eq('id',id);throw error;}
}

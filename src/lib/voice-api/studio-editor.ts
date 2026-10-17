import 'server-only';
import {parseSpeechEffects} from './speech-options';
import {isVoiceFormat} from './contract';
import type {VoiceAuth} from './auth';
import {VoiceError,voiceBody} from './contract';
import {publicVoiceGeneration} from './generations';
import {ownedStudioOperation,publicStudioOperation} from './studio-operations';
import {parseVoiceSettings} from './studio-contract';
import {parsePerformance,speechCapabilities,type SpeechScript} from './performance';

export function parseDraft(raw:unknown):SpeechScript {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new VoiceError('invalid_draft',422,'Rascunho inválido.');
  const b=raw as Record<string,unknown>;
  if(typeof b.text!=='string'||b.text.length>240000||typeof b.voice_id!=='string'||!/^[\w-]{0,100}$/.test(b.voice_id)
    ||typeof b.model_id!=='string'||!Object.hasOwn(speechCapabilities,b.model_id))throw new VoiceError('invalid_draft',422,'Rascunho fora dos limites.');
  const ids=b.dictionary_ids??[];
  if(!Array.isArray(ids)||ids.length>3||ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id)))throw new VoiceError('invalid_draft',422,'Dicionário inválido.');
  if(b.language_code!==undefined&&(typeof b.language_code!=='string'||!/^[a-z]{2,3}$/.test(b.language_code)))throw new VoiceError('invalid_draft',422,'Idioma inválido.');
  let performance;try{performance=parsePerformance(b.performance);}catch{throw new VoiceError('invalid_draft',422,'Interpretação inválida.');}
  let effects;try{effects=parseSpeechEffects(b.audio_effects);}catch{throw new VoiceError('invalid_draft',422,'Efeitos inválidos.');}
  if(b.output_format!==undefined&&!isVoiceFormat(b.output_format))throw new VoiceError('invalid_draft',422,'Formato inválido.');
  return {...(effects?{audio_effects:effects}:{}),...(b.output_format?{output_format:String(b.output_format)}:{}),text:b.text,voice_id:b.voice_id,model_id:b.model_id,voice_settings:b.voice_settings===undefined?{}:parseVoiceSettings(b.voice_settings),
    dictionary_ids:ids,performance:{...performance,preview:false},...(b.language_code?{language_code:b.language_code as string}:{})};
}
export async function studioDraft(auth:VoiceAuth,request:Request) {
  if(!auth.studio||!auth.userId)throw new VoiceError('session_required',401,'Entre no Estúdio.');
  const scoped=()=>auth.client.from('voice_studio_drafts').select('script,version,updated_at').eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).eq('user_id',auth.userId!);
  if(request.method==='GET'){
    const {data,error}=await scoped().maybeSingle();
    if(error)throw new VoiceError('draft_unavailable',503,'Não foi possível recuperar o rascunho.');
    return {draft:data};
  }
  let body;try{body=JSON.parse(new TextDecoder().decode(await voiceBody(request,1200000)));}catch(e){if(e instanceof VoiceError)throw e;throw new VoiceError('invalid_json',422,'JSON inválido.');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new VoiceError('invalid_draft',422,'Rascunho inválido.');
  const script=parseDraft(body.script),version=body.version;
  if(!Number.isSafeInteger(version)||version<0)throw new VoiceError('invalid_draft',422,'Versão inválida.');
  const values={script,version:version+1,updated_at:new Date().toISOString()};
  const result=version===0
    ?await auth.client.from('voice_studio_drafts').insert({...values,project_id:auth.project.id,organization_id:auth.project.organization_id,user_id:auth.userId}).select('version').maybeSingle()
    :await auth.client.from('voice_studio_drafts').update(values).eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).eq('user_id',auth.userId).eq('version',version).select('version').maybeSingle();
  if(result.error||!result.data)throw new VoiceError(result.error&&result.error.code!=='23505'?'draft_unavailable':'draft_conflict',result.error&&result.error.code!=='23505'?503:409,'Rascunho não salvo. Outra aba pode ter uma versão mais recente. Copie seu texto antes de recarregar.');
  return result.data;
}

export async function studioHistoryPage(auth:VoiceAuth,request:Request) {
  const params=new URL(request.url).searchParams;
  let query=auth.client.from('voice_studio_history').select('*').eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id)
    .in('operation',['text_to_speech','studio']).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(21);
  const kind=params.get('kind');if(kind&&kind!=='voice_change')throw new VoiceError('invalid_filter',422,'Tipo de histórico inválido.');
  query=kind==='voice_change'?query.eq('model_id','eleven_multilingual_sts_v2'):query.neq('model_id','eleven_multilingual_sts_v2');
  const cursor=params.get('cursor');
  if(cursor){
    const [date,id]=cursor.split('|');
    if(!date||!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(date)||!Number.isFinite(Date.parse(date))||!/^[a-f0-9-]{36}$/i.test(id??''))throw new VoiceError('invalid_cursor',422,'Página inválida.');
    query=query.or(`created_at.lt.${date},and(created_at.eq.${date},id.lt.${id})`);
  }
  for(const field of ['voice_id','model_id']){const value=params.get(field);if(value){if(!/^[\w-]{1,100}$/.test(value))throw new VoiceError('invalid_filter',422,'Filtro inválido.');query=query.eq(field,value);}}
  const since=params.get('since');if(since){if(!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(since)||!Number.isFinite(Date.parse(since)))throw new VoiceError('invalid_filter',422,'Data inválida.');query=query.gte('created_at',since);}
  const search=params.get('search')?.trim();if(search){if(search.length>200)throw new VoiceError('invalid_filter',422,'Busca muito longa.');query=query.ilike('studio_script->>text',`%${search.replace(/[\\%_]/g,'\\$&')}%`);}
  const {data,error}=await query;
  if(error)throw new VoiceError('history_unavailable',503,'Não foi possível consultar o histórico.');
  const rows=(data??[]).slice(0,20),generations=[];
  for(const row of rows){
    if(row.operation==='studio'){const {r,s}=await ownedStudioOperation(auth,row.id);if(['long_tts','voice_change'].includes(s.operation))generations.push(publicStudioOperation(r,s));}
    else generations.push(publicVoiceGeneration(row));
  }
  const last=rows.at(-1);
  return {generations,next_cursor:data&&data.length>20&&last?`${last.created_at}|${last.id}`:null};
}

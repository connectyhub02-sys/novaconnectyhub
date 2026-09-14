import 'server-only';
import type {VoiceAuth} from './auth';
import {VoiceError} from './contract';
export type DictionaryLocator={pronunciation_dictionary_id:string;version_id:string};
export function parseDictionaryIds(value:unknown):string[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>3||new Set(value).size!==value.length||value.some(v=>typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)))throw new VoiceError('invalid_dictionary',422,'Selecione até três dicionários diferentes deste projeto.');
 return value as string[];
}
export async function resolveStudioDictionaries(auth:VoiceAuth,ids:readonly string[]):Promise<DictionaryLocator[]>{
 if(!ids.length)return [];
 if(process.env.STUDIO_OPERATIONS_ENABLED!=='true')throw new VoiceError('dictionary_unavailable',422,'Dicionários ainda indisponíveis.');
 const {data,error}=await auth.client.from('studio_resources').select('id,provider_id,provider_version,studio_operations!inner(voice_generations!inner(status))').in('id',[...ids]).eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).eq('kind','dictionary').eq('status','ready').eq('studio_operations.voice_generations.status','completed');
 if(error)throw new VoiceError('service_unavailable',503,'Não foi possível conferir os dicionários.');
 return ids.map(id=>{const r=data?.find(r=>r.id===id);if(!r||!r.provider_version||! /^[a-zA-Z0-9_-]{1,150}$/.test(r.provider_id)||! /^[a-zA-Z0-9_-]{1,150}$/.test(r.provider_version))throw new VoiceError('dictionary_unavailable',404,'Dicionário não disponível neste projeto.');return {pronunciation_dictionary_id:r.provider_id,version_id:r.provider_version};});
}

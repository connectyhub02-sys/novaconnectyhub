import {parseDictionaryIds} from './studio-dictionaries';
import {VoiceError} from './contract';
export const studioDefinitions={
 transcription:{name:'Transcrição',model:'scribe_v2',provider:'elevenlabs',feature:'studio_transcription',unit:'minute',audio:true},
 audio_isolation:{name:'Limpeza de áudio',model:'audio-isolation-v1',provider:'elevenlabs',feature:'studio_audio_isolation',unit:'minute',audio:true},
 voice_change:{name:'Troca de voz',model:'eleven_multilingual_sts_v2',provider:'elevenlabs',feature:'studio_voice_change',unit:'minute',audio:true},
 forced_alignment:{name:'Alinhamento e legendas',model:'forced-alignment-v1',provider:'elevenlabs',feature:'studio_forced_alignment',unit:'minute',audio:true},
 dialogue:{name:'Diálogo com múltiplas vozes',model:'eleven_v3',provider:'elevenlabs',feature:'studio_dialogue',unit:'character',audio:false},
 voice_design:{name:'Desenhar voz por descrição',model:'voice-design-default',provider:'elevenlabs',feature:'studio_voice_design',unit:'character',audio:false},
 voice_design_save:{name:'Salvar voz desenhada',model:'voice-design-save',provider:'elevenlabs',feature:'studio_voice_design_save',unit:'request',audio:false},
 dictionary_create:{name:'Dicionário de pronúncia',model:'pronunciation-dictionary',provider:'elevenlabs',feature:'studio_dictionary',unit:'request',audio:false},
 dubbing:{name:'Dublagem',model:'dubbing-v1',provider:'elevenlabs',feature:'studio_dubbing',unit:'minute',audio:true},
 gemini_tts:{name:'Voz nativa Gemini',model:'gemini-3.1-flash-tts-preview',provider:'gemini',feature:'voice_generation_audio',unit:'token',audio:false},
} as const;
export type StudioOperation=keyof typeof studioDefinitions;
type Rule={type:'alias';string_to_replace:string;alias:string}|{type:'phoneme';string_to_replace:string;phoneme:string;alphabet:'ipa'|'cmu-arpabet'};
export type StudioInput={operation:StudioOperation;model_id:string;asset_id?:string;voice_id?:string;text?:string;language?:string;diarize?:boolean;turns?:Array<{text:string;voice_id:string}>;description?:string;sample_text?:string;preview_id?:string;name?:string;rules?:Rule[];parent_dictionary_id?:string;target_language?:string;dictionary_ids?:string[]};
const fail=(message='Parâmetros da operação inválidos.')=>new VoiceError('invalid_operation',422,message);
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw fail();return v as Record<string,unknown>;}
function text(v:unknown,min:number,max:number){if(typeof v!=='string'||v.trim().length<min||v.length>max)throw fail(`Texto deve ter entre ${min} e ${max} caracteres.`);return v.trim();}
function identifier(v:unknown){const s=text(v,1,100);if(!/^[a-zA-Z0-9_-]+$/.test(s))throw fail();return s;}
function uuid(v:unknown){const s=text(v,36,36);if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s))throw fail();return s;}
function language(v:unknown){const s=text(v,2,3);if(!/^[a-z]{2,3}$/.test(s))throw fail();return s;}
function fields(b:Record<string,unknown>,allowed:string[]){if(Object.keys(b).some(k=>!allowed.includes(k)))throw fail('Campo não suportado nesta operação.');}
export function parseStudioInput(raw:unknown):StudioInput{
 const b=object(raw),op=b.operation;
 if(typeof op!=='string'||!Object.hasOwn(studioDefinitions,op))throw fail('Escolha uma operação disponível.');
 const operation=op as StudioOperation,d=studioDefinitions[operation];
 const result:StudioInput={operation,model_id:b.model_id===undefined?d.model:text(b.model_id,1,100)};
 if(operation!=='gemini_tts'&&result.model_id!==d.model)throw fail('Modelo não suportado para esta operação.');
 if(operation==='gemini_tts'&&!['gemini-3.1-flash-tts-preview','gemini-2.5-flash-preview-tts','gemini-2.5-pro-preview-tts'].includes(result.model_id))throw fail('Modelo de voz não suportado.');
 const allowed=['operation','model_id'];
 if(d.audio){allowed.push('asset_id');result.asset_id=uuid(b.asset_id);}
 switch(operation){
  case 'transcription':allowed.push('language','diarize');if(b.language!==undefined)result.language=language(b.language);if(b.diarize!==undefined&&typeof b.diarize!=='boolean')throw fail();result.diarize=b.diarize===true;break;
  case 'voice_change':allowed.push('voice_id');result.voice_id=identifier(b.voice_id);break;
  case 'forced_alignment':allowed.push('text');result.text=text(b.text,1,4800);break;
  case 'dubbing':allowed.push('target_language');result.target_language=language(b.target_language);break;
  case 'gemini_tts':allowed.push('voice_id','text');result.voice_id=text(b.voice_id,1,100);if(!/^gemini:[a-z]+$/.test(result.voice_id))throw fail('Escolha uma voz nativa do catálogo.');result.text=text(b.text,1,4800);break;
  case 'dialogue':{
   allowed.push('turns','dictionary_ids');const dictionaries=parseDictionaryIds(b.dictionary_ids);if(dictionaries.length)result.dictionary_ids=dictionaries;if(!Array.isArray(b.turns)||!b.turns.length||b.turns.length>50)throw fail('Envie de1 a50 falas.');
   result.turns=b.turns.map(v=>{const t=object(v);fields(t,['text','voice_id']);return {text:text(t.text,1,2000),voice_id:identifier(t.voice_id)};});
   if(result.turns.reduce((n,t)=>n+t.text.length,0)>2000||new Set(result.turns.map(t=>t.voice_id)).size>10)throw fail('Use até2.000 caracteres e10 vozes.');break;
  }
  case 'voice_design':allowed.push('description','sample_text');result.description=text(b.description,20,1000);result.sample_text=text(b.sample_text,100,1000);break;
  case 'voice_design_save':allowed.push('preview_id','name','description');result.preview_id=uuid(b.preview_id);result.name=text(b.name,2,80);result.description=text(b.description,20,1000);break;
  case 'dictionary_create':{
   allowed.push('name','rules','parent_dictionary_id');result.name=text(b.name,1,100);if(b.parent_dictionary_id!==undefined)result.parent_dictionary_id=uuid(b.parent_dictionary_id);
   if(!Array.isArray(b.rules)||!b.rules.length||b.rules.length>100)throw fail('Envie de1 a100 regras.');
   result.rules=b.rules.map(v=>{const r=object(v),string_to_replace=text(r.string_to_replace,1,100);
    if(r.type==='alias'){fields(r,['type','string_to_replace','alias']);return {type:'alias',string_to_replace,alias:text(r.alias,1,200)};}
    if(r.type==='phoneme'&&['ipa','cmu-arpabet'].includes(String(r.alphabet))){fields(r,['type','string_to_replace','phoneme','alphabet']);return {type:'phoneme',string_to_replace,phoneme:text(r.phoneme,1,200),alphabet:r.alphabet as 'ipa'|'cmu-arpabet'};}
    throw fail('Regra de pronúncia inválida.');
   });break;
  }
 }
 fields(b,allowed);return result;
}

export function studioInputUnits(input:StudioInput,duration?:number){
 if(studioDefinitions[input.operation].audio){
  if(typeof duration!=='number'||!Number.isFinite(duration)||duration<=0||duration>1800)throw fail('O áudio precisa de duração aferida.');
  return {minutes:Math.ceil(duration)/60};
 }
 if(input.operation==='dialogue')return {characters:input.turns!.reduce((n,t)=>n+t.text.length,0)};
 if(input.operation==='voice_design')return {characters:input.sample_text!.length};
 if(input.operation==='gemini_tts')return {inputTokens:Buffer.byteLength(input.text!,'utf8')+256,outputTokens:8192};
 return {requests:1};
}
export function studioCreditCeiling(request:Request,quoted:number){
 const raw=request.headers.get('x-max-credits');if(raw===null)return;
 if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(raw))throw fail('X-Max-Credits deve conter um limite numérico de créditos.');
 if(quoted>Number(raw)+1e-9)throw new VoiceError('pricing_changed',409,'A cotação excede o limite autorizado. Consulte os créditos novamente.');
}

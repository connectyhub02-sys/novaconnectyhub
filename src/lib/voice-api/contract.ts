export const voiceLimits = { characters: 4800, audioBytes: 12582912, requestsPerMinute: 10, concurrentPerWallet: 2 } as const;
export class VoiceError extends Error {
  constructor(public code: string, public status: number, message: string, public requestId?: string) { super(message); }
}
export type VoiceInput = ReturnType<typeof parseVoiceInput>;
export function parseVoiceInput(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new VoiceError('invalid_input',422,'Envie um objeto JSON.');
  const b = raw as Record<string,unknown>;
  if (Object.keys(b).some(k=>!['text','voice_id','model_id','voice_settings'].includes(k))) throw new VoiceError('unsupported_parameter',422,'Parâmetro não suportado. Consulte a documentação de Voz.');
  const text = typeof b.text === 'string' ? b.text.replace(/\s+/g,' ').trim() : '';
  if (!text || text.length>voiceLimits.characters) throw new VoiceError('text_limit',422,'Envie entre 1 e 4800 caracteres.');
  if (typeof b.voice_id!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(b.voice_id)) throw new VoiceError('invalid_voice',422,'Escolha uma voz disponível no catálogo.');
  const model = b.model_id ?? 'eleven_multilingual_v2';
  if (typeof model!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(model)) throw new VoiceError('invalid_model',422,'Modelo inválido.');
  const settings = { stability:.48, similarity_boost:.78, style:.22, use_speaker_boost:true };
  if (b.voice_settings!==undefined) {
    if (!b.voice_settings || typeof b.voice_settings!=='object' || Array.isArray(b.voice_settings)) throw new VoiceError('invalid_settings',422,'Configuração de voz inválida.');
    for(const [key,value] of Object.entries(b.voice_settings)) {
      if(key==='use_speaker_boost' && typeof value==='boolean') settings.use_speaker_boost=value;
      else if(['stability','similarity_boost','style'].includes(key) && typeof value==='number' && Number.isFinite(value) && value>=0 && value<=1) settings[key as 'stability'|'similarity_boost'|'style']=value;
      else throw new VoiceError('invalid_settings',422,'Estabilidade, similaridade e estilo: 0 a 1; speaker boost: booleano.');
    }
  }
  return { text, voice_id:b.voice_id, model_id:model, voice_settings:settings, output_format:'mp3_44100_128' as const };
}
export function voiceIdempotency(request: Request) {
  const key=request.headers.get('idempotency-key');
  if(!key || !/^[\x21-\x7e]{1,128}$/.test(key)) throw new VoiceError('idempotency_required',422,'Envie Idempotency-Key com até 128 caracteres ASCII sem espaços.');
  return key;
}
export function voiceFailure(error: unknown) {
  if(error instanceof VoiceError) return Response.json({error:{code:error.code,message:error.message,request_id:error.requestId}},{status:error.status,headers:{'Cache-Control':'no-store'}});
  return Response.json({error:{code:'service_unavailable',message:'Não foi possível concluir. Consulte a solicitação antes de tentar novamente.'}},{status:503,headers:{'Cache-Control':'no-store'}});
}
export function voiceJson(data:unknown,status=200) { return Response.json(data,{status,headers:{'Cache-Control':'no-store'}}); }
export async function voiceBody(request:Request,limit:number) {
  if(Number(request.headers.get('content-length')??0)>limit)throw new VoiceError('body_limit',413,'Corpo acima do limite.');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new VoiceError('body_limit',413,'Corpo acima do limite.');chunks.push(value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}
  const result=new Uint8Array(size);let position=0;for(const chunk of chunks){result.set(chunk,position);position+=chunk.length;}return result;
}

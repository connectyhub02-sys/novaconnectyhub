import {AiInputError} from './advanced-input';
type Json=Record<string,unknown>;
const rec=(value:unknown):Json=>value&&typeof value==='object'&&!Array.isArray(value)?value as Json:{};
/** Convert the versioned SDK request into the existing metered embedding path. */
export function nativeEmbeddingInput(raw:unknown,model:string) {
  const body=rec(raw),config=rec(body.embedContentConfig);
  const fail=(message:string):never=>{throw new AiInputError('invalid_embedding',message);};
  if(body.embedContentConfig!==undefined&&(!body.embedContentConfig||typeof body.embedContentConfig!=='object'||Array.isArray(body.embedContentConfig)))fail('embedContentConfig precisa ser um objeto.');
  if(Object.keys(body).some(k=>!['model','content','embedContentConfig','taskType','title','outputDimensionality'].includes(k)))fail('Campo não suportado em embedContent.');
  if(Object.keys(config).some(k=>!['autoTruncate','taskType','title','outputDimensionality','documentOcr','audioTrackExtraction'].includes(k)))fail('Configuração de vetores não suportada.');
  if(config.autoTruncate!==undefined&&config.autoTruncate!==false)fail('autoTruncate deve ser false para preservar a medição exata do conteúdo.');
  for(const key of ['taskType','title','outputDimensionality'])if(body[key]!==undefined&&config[key]!==undefined)fail(`Informe ${key} somente uma vez.`);
  for(const key of ['documentOcr','audioTrackExtraction'])if(config[key]!==undefined&&typeof config[key]!=='boolean')fail(`${key} deve ser booleano.`);
  const c={...config,...Object.fromEntries(['taskType','title','outputDimensionality'].filter(k=>body[k]!==undefined).map(k=>[k,body[k]]))};
  return {model,content:body.content,...(c.taskType!==undefined?{task_type:c.taskType}:{}),...(c.title!==undefined?{title:c.title}:{}),...(c.outputDimensionality!==undefined?{dimensions:c.outputDimensionality}:{}),...(c.documentOcr!==undefined?{document_ocr:c.documentOcr}:{}),...(c.audioTrackExtraction!==undefined?{audio_track_extraction:c.audioTrackExtraction}:{})};
}

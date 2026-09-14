import 'server-only';
import {createServiceClient} from '@/lib/supabase/service';
import {authenticateAi,AiApiError,record} from './gateway';
import {aiModelDefinition} from './model-catalog';
import {loadPublicAiModels} from './model-service';
import {loadAiPriceCard} from './operation-pricing';
import {prepareExtendedContent} from './extended-content';
import {prepareAiEmbedding} from './extended-embeddings';

/** Counts with the same ownership/model/parser boundary as generation, without
 * creating a billable request, reserving credits or generating model output. */
export async function countAiTokens(request:Request,modelId:string,raw:unknown,client=createServiceClient()) {
  const auth=await authenticateAi(request,client);
  if(auth.key.model_id&&auth.key.model_id!==modelId)throw new AiApiError('model_key_mismatch',422,'Use o modelo vinculado à chave.');
  const models=await loadPublicAiModels(client,auth.billing.planCode),model=aiModelDefinition(modelId);
  if(!model||!models.some(m=>m.id===modelId&&m.available))throw new AiApiError('model_unavailable',422,'Modelo indisponível.');
  const body=record(raw);
  if(Object.keys(body).some(k=>!['contents','generateContentRequest'].includes(k)) || (!!body.contents===!!body.generateContentRequest))
    throw new AiApiError('invalid_count_request',422,'Informe contents ou generateContentRequest, exclusivamente.');
  const generation=body.generateContentRequest?record(body.generateContentRequest):{contents:body.contents};
  if(generation.model&&generation.model!==modelId&&generation.model!==`models/${modelId}`)throw new AiApiError('model_key_mismatch',422,'Modelo divergente na contagem.');
  const prices=await loadAiPriceCard(client,modelId,auth.billing.planCode);
  if(model.family==='embeddings') {
    if(body.generateContentRequest||!Array.isArray(body.contents)||body.contents.length!==1)throw new AiApiError('invalid_count_request',422,'Para embeddings, informe exatamente um conteúdo.');
    const prepared=await prepareAiEmbedding(client,auth,{id:'',auth,model,prices,kind:'count'},{model:modelId,content:body.contents[0]});
    return prepared.count;
  }
  const {countResponse}=await prepareExtendedContent(client,auth,{id:'',auth,model,prices,kind:'count'}, {...generation,model:modelId});
  return Object.fromEntries(['totalTokens','cachedContentTokenCount','promptTokensDetails','cacheTokensDetails'].filter(k=>countResponse[k]!==undefined).map(k=>[k,countResponse[k]]));
}

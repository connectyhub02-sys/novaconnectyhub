import {createServiceClient} from '@/lib/supabase/service';
import {authenticateAi,AiApiError} from '@/lib/ai-api/gateway';
import {loadPublicAiModels} from '@/lib/ai-api/model-service';
import {loadAiPriceCard} from '@/lib/ai-api/operation-pricing';
import {publicAiPriceCard} from '@/lib/ai-api/public-pricing';
import {aiHttpFailure} from '@/lib/ai-api/http';
export const runtime='nodejs';
export async function GET(request:Request) {
  try {
    const client=createServiceClient(),auth=request.headers.has('authorization')?await authenticateAi(request,client):null;
    const modelId=new URL(request.url).searchParams.get('model');
    const models=await loadPublicAiModels(client,auth?.billing.planCode);
    const selected=models.filter(m=>m.available&&(!modelId||m.id===modelId));
    if(modelId&&!selected.length)throw new AiApiError('model_unavailable',404,'Modelo indisponível.');
    const data=await Promise.all(selected.map(async m=>({model:m.id,...publicAiPriceCard(await loadAiPriceCard(client,m.id,auth?.billing.planCode??null))})));
    return Response.json({object:'price.list',as_of:new Date().toISOString(),scope:auth?'billing_plan':'base_rates',data,
      notes:['Tarifas em créditos; não são o custo privado do fornecedor.','O preço em reais por crédito depende do pacote ou contrato.','Sem chave: tarifas gerais. Com chave: tarifas do plano responsável pela carteira.','A tarifa é capturada ao iniciar a operação; guarde a versão para conciliação.']},
      {headers:{'Cache-Control':auth?'private, no-store':'public, max-age=60, s-maxage=60'}});
  }catch(error){return aiHttpFailure(error);}
}

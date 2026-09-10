import {NextResponse} from 'next/server';
import {requirePlatformAdmin} from '@/lib/supabase/admin-auth';
import {createServiceClient} from '@/lib/supabase/service';
import {aiModelDefinition} from '@/lib/ai-api/model-catalog';
import {loadAiPriceCard} from '@/lib/ai-api/operation-pricing';
import {requiredAiMeters,positiveAiMeters} from '@/lib/ai-api/resource-capabilities';
export const runtime='nodejs';
export async function GET() {
  const auth=await requirePlatformAdmin();if(auth instanceof NextResponse)return auth;
  const result=await createServiceClient().from('ai_operation_rates').select('*').order('model_id').order('meter').limit(1000);
  if(result.error)return NextResponse.json({error:'Não foi possível carregar as tarifas de recursos.'},{status:503});
  const models=await createServiceClient().from('ai_public_models').select('id,enabled');
  if(models.error)return NextResponse.json({error:'Não foi possível carregar os modelos.'},{status:503});
  return NextResponse.json({rates:result.data,models:models.data},{headers:{'Cache-Control':'no-store'}});
}
export async function PATCH(request:Request) {
  const auth=await requirePlatformAdmin();if(auth instanceof NextResponse)return auth;
  const body=await request.json().catch(()=>null),model=aiModelDefinition(String(body?.model_id??''));
  if(!model||typeof body?.enabled!=='boolean')return NextResponse.json({error:'Informe o modelo e a disponibilidade.'},{status:400});
  const client=createServiceClient();
  if(body.enabled)try{
    const prices=await loadAiPriceCard(client,model.id,null);
    if(!positiveAiMeters(prices,requiredAiMeters(model)))return NextResponse.json({error:'Configure as tarifas de todas as dimensões deste modelo antes de liberar.'},{status:422});
  }catch{return NextResponse.json({error:'Não foi possível conferir as tarifas.'},{status:503});}
  const result=await client.from('ai_public_models').update({enabled:body.enabled}).eq('id',model.id);
  if(result.error)return NextResponse.json({error:'Não foi possível atualizar o catálogo.'},{status:503});
  await client.from('maintenance_audit_logs').insert({actor_id:auth.userId,event_type:'billing.ai_model.availability',target_table:'ai_public_models',metadata:{model_id:model.id,enabled:body.enabled}});
  return NextResponse.json({model_id:model.id,enabled:body.enabled});
}
export async function POST(request:Request) {
  const auth=await requirePlatformAdmin();if(auth instanceof NextResponse)return auth;
  const body=await request.json().catch(()=>null);
  const meter=String(body?.meter??''),model=String(body?.model_id??'');
  const cost=Number(body?.provider_cost),price=Number(body?.credit_price);
  if(!body||(model!=='*'&&!aiModelDefinition(model))||!/^(batch_)?(input|output|cached_input|cache_hour|audio_input|audio_output|image_input|image_output|video_input|video_output|document_input|search|maps|indexing_input|song|audio_second|video_720p|video_1080p|video_4k)$/.test(meter)
    ||!Number.isFinite(cost)||cost<0||!Number.isFinite(price)||price<=0||typeof body.plan_code!=='string'&&body.plan_code!==null&&body.plan_code!==undefined)
    return NextResponse.json({error:'Informe modelo, dimensão de consumo, custo e preço positivo em créditos.'},{status:400});
  const client=createServiceClient();
  // Append an effective version; in-flight operations retain their original snapshot.
  const result=await client.from('ai_operation_rates').insert({model_id:model,meter,provider_cost:cost,credit_price:price,plan_code:body.plan_code||null,
    effective_from:new Date().toISOString(),metadata:{configured_by:auth.userId,source:'admin'}}).select('*').single();
  if(result.error)return NextResponse.json({error:'Não foi possível salvar a tarifa.'},{status:503});
  await client.from('maintenance_audit_logs').insert({actor_id:auth.userId,event_type:'billing.ai_resource_rate.created',target_table:'ai_operation_rates',target_id:result.data.id,metadata:{model,meter,cost,price}});
  return NextResponse.json({rate:result.data});
}

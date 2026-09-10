import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveActiveBillingRates } from "@/lib/billing/metered-usage";
import { aiModelDefinition, type PublicAiModel } from "./model-catalog";
import { implementedAiCapabilities, releaseAiModelIds } from "./capabilities";
import {loadAiPriceCard,type AiPriceCard} from './operation-pricing';
import {requiredAiMeters,positiveAiMeters,operationalAiCapabilities} from './resource-capabilities';

export async function loadPublicAiModels(client: SupabaseClient, planCode?: string | null): Promise<PublicAiModel[]> {
  const { data, error } = await client.from("ai_public_models").select("*").order("recommended", { ascending: false }).order("name");
  if (error) throw new Error("Não foi possível carregar o catálogo de modelos.");
  const eligible = await client.from("provider_models").select("provider_model_id,metadata,provider_cost_centers!inner(provider,enabled)").eq("enabled",true).eq("provider_cost_centers.enabled",true).eq("provider_cost_centers.provider","gemini");
  if (eligible.error) throw new Error("Não foi possível verificar a disponibilidade dos modelos.");
  const enabled = new Set((eligible.data ?? []).filter(model => (model.metadata as Record<string,unknown> | null)?.external_ai_available !== false).map(model => model.provider_model_id));
  return Promise.all((data ?? []).map(async row => {
    const definition = aiModelDefinition(row.id);
    let extended:AiPriceCard|null=null;
    if(row.enabled&&definition&&enabled.has(row.provider_model_id))try{extended=await loadAiPriceCard(client,row.id,planCode??null);}catch{/* Old deployments keep their existing contract until the migration is applied. */}
    let available = row.enabled === true && !!definition && definition.providerId === row.provider_model_id && releaseAiModelIds.includes(row.id) && enabled.has(row.provider_model_id);
    if (available) {
      const rates = await resolveActiveBillingRates(client, { provider: "gemini", featureCode: "external_ai", modelId: row.provider_model_id, planCode: planCode ?? null });
      available = (definition?.family === "embeddings" ? ["input_token"] : ["input_token", "output_token"]).every(unit => rates.some(rate => rate.unit === unit && rate.connectyPricePerUnit > 0));
      if(available && row.id.startsWith("pro-3.1-preview")) {
        const longRates=await resolveActiveBillingRates(client,{provider:"gemini",featureCode:"external_ai_long_context",modelId:row.provider_model_id,planCode:planCode??null});
        available=["input_token","output_token"].every(unit=>longRates.some(rate=>rate.unit===unit&&rate.connectyPricePerUnit>0));
      }
    }
    if(extended&&definition&&row.enabled&&definition.providerId===row.provider_model_id&&positiveAiMeters(extended,requiredAiMeters(definition)))available=definition.family!=='live'||(!!process.env.AI_RELAY_PUBLIC_URL&&!!process.env.AI_RELAY_SECRET);
    if(available&&row.id.startsWith('pro-3.1')) {
      const longRates=await resolveActiveBillingRates(client,{provider:'gemini',featureCode:'external_ai_long_context',modelId:row.provider_model_id,planCode:planCode??null});
      available=['input_token','output_token'].every(unit=>longRates.some(rate=>rate.unit===unit&&rate.connectyPricePerUnit>0));
    }
    const expanded=extended?operationalAiCapabilities(/^(deep-research|antigravity)/.test(definition?.providerId??'')?[]:row.capabilities as string[],extended):[];
    if(extended&&available&&definition?.family==='text'&&!/^(deep-research|antigravity)/.test(definition.providerId)&&!expanded.includes('file_search')&&positiveAiMeters(extended,['indexing_input']))expanded.push('file_search');
    if(available&&definition?.id.includes('computer-use')&&!expanded.includes('computer_use'))expanded.push('computer_use');
    return { id: row.id, object: "model" as const, name: row.name, family: row.family, profile: row.profile,
      consumption: row.consumption, recommended: row.recommended === true, capabilities: available ? extended?[...new Set([...expanded,...(definition&&!['live','embeddings'].includes(definition.family)&&!definition.providerId.startsWith('veo-')?['interactions']:[])])]:(row.capabilities as string[]).filter(capability => implementedAiCapabilities.includes(capability)) : [],
      available, unavailable_reason: available ? null : "Aguardando liberação operacional e configuração de cobrança." };
  }));
}

export async function assertAiModelAvailable(client: SupabaseClient, id: string, planCode?: string | null) {
  const models = await loadPublicAiModels(client, planCode);
  const model = models.find(model => model.id === id && model.available);
  if (!model) throw new Error("Este modelo ainda não está disponível para criar uma chave.");
  return model;
}

import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGeminiCredentials } from "@/lib/gemini/credentials";
import { geminiLowThinkingConfig } from "@/lib/gemini/models";
import { assertContractAccess } from "@/lib/billing/contract-access";
import { loadAiPriceCard, priceAiUnits } from "@/lib/ai-api/operation-pricing";
import { publicModelId } from "@/lib/ai-api/model-catalog";
import { measureAiContent } from "@/lib/ai-api/content-metering";
import { parseTrendResult, trendPrompt, type TrendBrief } from "./trend-policy";

const fields = "id,status,brief,result,charge_credits,error_message,created_at";
export async function trendHistory(client: SupabaseClient, org: string) {
  await client.from("meta_trend_jobs").update({status:"uncertain",error_message:"A pesquisa foi interrompida. O suporte precisa conferir o consumo antes de repetir."})
    .eq("organization_id",org).in("status",["preparing","processing"]).lt("updated_at",new Date(Date.now()-10*60000).toISOString());
  // Recover stored settlements without repeating provider calls. Unknown dispatch remains blocked.
  const pending = await client.from("meta_trend_jobs").select("id").eq("organization_id",org).in("status",["generated","uncertain"]).not("settlement","is",null).limit(5);
  if (pending.error) throw Error("Histórico de pesquisas indisponível.");
  for (const row of pending.data ?? []) await client.rpc("finish_meta_trend", {p_id:row.id});
  const r = await client.from("meta_trend_jobs").select(fields).eq("organization_id",org).order("created_at",{ascending:false}).limit(20);
  if (r.error) throw Error("Não foi possível carregar as pesquisas.");
  return (r.data ?? []).map(j => ({...j,result:j.status === "completed" ? j.result : null}));
}
export async function runTrendResearch(client: SupabaseClient, org: string, user: string, id: string, brief: TrendBrief) {
  const access = await assertContractAccess(org,client);
  const hash = createHash("sha256").update(JSON.stringify(brief)).digest("hex");
  const existing = await client.from("meta_trend_jobs").select("input_hash").eq("organization_id",org).eq("id",id).maybeSingle();
  if (existing.error) throw Error("Histórico indisponível.");
  if (existing.data) {
    if (existing.data.input_hash !== hash) throw Error("Essa solicitação já pertence a outra pesquisa.");
    return trendHistory(client,org);
  }
  const credentials = await loadGeminiCredentials(client);
  if (!credentials.apiKey || !/^gemini-3/.test(credentials.model)) throw Error("Configure um modelo Gemini 3 compatível com pesquisa na manutenção.");
  const prices = await loadAiPriceCard(client,publicModelId(credentials.model),access.plan_code);
  const quote = priceAiUnits(prices,{input:16000,output:4096,search:10});
  const insert = await client.from("meta_trend_jobs").insert({id,organization_id:org,billing_organization_id:access.billing_organization_id,user_id:user,input_hash:hash,brief,model:credentials.model,prices});
  if (insert.error) throw Error("Já existe uma pesquisa em andamento ou em conferência. Confira o histórico.");
  const update = async (values: Record<string,unknown>) => {
    const r = await client.from("meta_trend_jobs").update({...values,updated_at:new Date().toISOString()}).eq("organization_id",org).eq("id",id);
    if (r.error) throw Error("Não foi possível preservar o resultado da pesquisa.");
  };
  let dispatched = false;
  try {
    const reserve = await client.rpc("reserve_meta_trend",{p_id:id,p_amount:quote.credits});
    if (reserve.error) throw Error("Não foi possível reservar os créditos da pesquisa. Confira saldo e limites de consumo.");
    dispatched = true;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(credentials.model)}:generateContent`,{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(120000),headers:{"Content-Type":"application/json","x-goog-api-key":credentials.apiKey},
      body:JSON.stringify({contents:[{role:"user",parts:[{text:trendPrompt(brief,new Date().toISOString().slice(0,10))}]}],tools:[{google_search:{}}],
        generationConfig:{...geminiLowThinkingConfig(credentials.model),maxOutputTokens:4096,temperature:0.3}})
    });
    if (!response.ok) {
      // Explicit rejection means no generated result. Timeouts/5xx stay uncertain.
      if ([400,401,403,404,429].includes(response.status)) dispatched = false;
      throw Error(`A pesquisa não foi concluída (HTTP ${response.status}).`);
    }
    const data = await response.json();
    await update({status:"generated",provider_response:data});
    const units = measureAiContent(data,prices);
    const queries = data.candidates?.[0]?.groundingMetadata?.webSearchQueries;
    if (Array.isArray(queries)) units.search = new Set(queries.filter((q: unknown) => typeof q === "string" && q.trim()).map((q: string) => q.trim())).size;
    const price = priceAiUnits(prices,units);
    let result = null, error = null;
    try { result = parseTrendResult(data); } catch (e) { error = e instanceof Error ? e.message : "Sem fontes verificáveis."; }
    const settlement = {input:Math.ceil(units.input ?? 0),output:Math.ceil(units.output ?? 0),cost:price.cost,charge:access.plan_code === "internal" ? 0 : price.credits,
      billingMode:access.plan_code === "internal" ? "internal_shadow" : access.plan_code === "trial" ? "trial_billable" : "customer_billable",
      metering:{units,breakdown:price.breakdown}};
    await update({result,error_message:error,settlement});
    const finished = await client.rpc("finish_meta_trend",{p_id:id});
    if (finished.error) throw Error("Resultado recebido. O consumo está em conferência; atualize o histórico antes de repetir.");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Pesquisa em conferência.";
    if (dispatched) await update({status:"uncertain",error_message:message});
    else {
      await update({error_message:message});
      const released = await client.rpc("finish_meta_trend",{p_id:id,p_failed:true});
      if (released.error) throw Error("A liberação da reserva está em conferência.");
    }
    throw Error(message);
  }
  return trendHistory(client,org);
}

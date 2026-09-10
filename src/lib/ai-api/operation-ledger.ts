import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiApiError, authenticateAi, hashAiSecret, record, rpc } from "./gateway";
import { aiModelDefinition } from "./model-catalog";
import { loadAiPriceCard, priceAiUnits, type AiPriceCard, type AiUnits } from "./operation-pricing";
import { AiProviderFailure } from "./provider-http";

export type AiAuth = Awaited<ReturnType<typeof authenticateAi>>;
export type AiOperation = { id: string; auth: AiAuth; model: NonNullable<ReturnType<typeof aiModelDefinition>>; prices: AiPriceCard; kind: string; replay?: Record<string, unknown> };
export async function beginAiOperation(client: SupabaseClient, request: Request, auth: AiAuth, kind: string, body: Record<string, unknown>) {
  const modelId = String((body.model === "connectyhub-auto" ? undefined : body.model) ?? auth.key.model_id ?? "flash-3.5");
  if (auth.key.model_id && auth.key.model_id !== modelId) throw new AiApiError("model_key_mismatch", 422, "Use o modelo vinculado à chave.");
  const model = aiModelDefinition(modelId);
  if (!model) throw new AiApiError("model_unavailable", 422, "Modelo não disponível.");
  const key = request.headers.get("idempotency-key") ?? randomUUID();
  if (!/^[\x21-\x7e]{1,128}$/.test(key)) throw new AiApiError("invalid_idempotency_key", 422, "Identidade da operação inválida.");
  const claimed = await rpc(client, "claim_ai_request", { p_key: auth.key.id, p_idempotency: key, p_hash: hashAiSecret(JSON.stringify({ kind, ...body, model: modelId })) });
  const operation: AiOperation = { id: String(claimed.id), auth, model, prices: {}, kind };
  if (!claimed.claimed) {
    if (claimed.status === "completed") return { ...operation, replay: record(claimed.response) };
    const resource = await client.from("ai_resources").select("id,kind,status,created_at,expires_at").eq("request_id", operation.id).eq("project_id", auth.project.id).maybeSingle();
    if (resource.error) throw new AiApiError("service_unavailable", 503, "Não foi possível recuperar a operação.");
    if (resource.data && !["failed","uncertain"].includes(String(resource.data.status))) return { ...operation, replay: { ...resource.data, object: "ai.resource", request_id: operation.id } };
    const error = new AiApiError("request_in_progress", 409, "Consulte a operação antes de repetir."); error.requestId = operation.id; throw error;
  }
  try {
    const [publicModel, enabled] = await Promise.all([
      client.from("ai_public_models").select("enabled,provider_model_id").eq("id", model.id).maybeSingle(),
      client.from("provider_models").select("enabled,metadata,provider_cost_centers!inner(enabled,provider)").eq("provider_model_id", model.providerId)
        .eq("enabled",true).eq("provider_cost_centers.enabled",true).eq("provider_cost_centers.provider","gemini").maybeSingle(),
    ]);
    if (publicModel.error || enabled.error || !publicModel.data?.enabled || publicModel.data.provider_model_id !== model.providerId || !enabled.data
      || record(enabled.data.metadata).external_ai_available === false) throw new AiApiError("model_unavailable", 422, "Este modelo está temporariamente indisponível.");
    operation.prices = await loadAiPriceCard(client, model.id, auth.billing.planCode);
    const update = await client.from("ai_requests").update({ execution_kind: kind }).eq("id",operation.id).eq("status","preparing");
    if (update.error) throw new Error("Não foi possível registrar a operação.");
    return operation;
  } catch (error) { await failAiOperation(client, operation, error, false); throw error; }
}

export async function reserveAiOperation(client: SupabaseClient, operation: AiOperation, units: AiUnits) {
  const quote = priceAiUnits(operation.prices, units);
  if (!quote.breakdown.length) throw new Error("Operação sem orçamento de consumo.");
  await rpc(client,"reserve_ai_credits",{p_request:operation.id,p_amount:operation.auth.billing.planCode === "internal" ? 0 : quote.credits,
    p_model:operation.model.providerId,p_rates:{kind:operation.kind,prices:operation.prices,units}});
  return quote;
}
export async function settleAiOperation(client: SupabaseClient, operation: AiOperation, units: AiUnits, result: Record<string,unknown>) {
  const price = priceAiUnits(operation.prices,units);
  const response = {...result,connectyhub:{request_id:operation.id,project_id:operation.auth.project.id,credits:price.credits}};
  const settlement = {p_request:operation.id,p_status:"completed",p_response:response,p_usage:{input:Math.ceil(units.input??0),output:Math.ceil(units.output??0),
    cost:price.cost,charge:operation.auth.billing.planCode === "internal" ? 0 : price.credits,creditUnitBrl:.01,
    featureCode:`external_ai_${operation.kind}`,billingMode:operation.auth.billing.planCode === "internal" ? "internal_shadow" : operation.auth.billing.planCode === "trial" ? "trial_billable" : "customer_billable",
    metering:{version:"ai_resources_v1",kind:operation.kind,units,breakdown:price.breakdown}}};
  const persisted=await client.from("ai_requests").update({result_snapshot:settlement}).eq("id",operation.id).in("status",["processing","uncertain"]);
  if(persisted.error) throw new Error("Consumo em conferência.");
  // The SQL extension can enlarge the reservation under the wallet lock if actual
  // consumption exceeds the estimate; it never spends another operation's credits.
  return record((await rpc(client,"settle_ai_operation",settlement)).response);
}
export async function failAiOperation(client: SupabaseClient, operation: AiOperation, error: unknown, dispatched: boolean) {
  const uncertain = dispatched && (!(error instanceof AiProviderFailure) || error.uncertain);
  await rpc(client,"finish_ai_request",{p_request:operation.id,p_status:uncertain?"uncertain":"failed",p_error:uncertain?"result_pending":"operation_failed"}).catch(()=>undefined);
  if (error instanceof AiApiError) error.requestId = operation.id;
}
export async function saveAiResource(client: SupabaseClient, operation: AiOperation, kind: string, metadata: Record<string,unknown>) {
  const saved=await client.from("ai_resources").insert({id:operation.id,request_id:operation.id,organization_id:operation.auth.billingOrganizationId,
    project_id:operation.auth.project.id,key_id:operation.auth.key.id,model_id:operation.model.id,kind,status:"preparing",metadata:{...metadata,prices:operation.prices,plan_code:operation.auth.billing.planCode,execution_kind:operation.kind}}).select("*").single();
  if(saved.error||!saved.data)throw new Error("Não foi possível registrar o recurso.");
  return saved.data;
}

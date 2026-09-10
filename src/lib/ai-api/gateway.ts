import "server-only";
import {CONNECTY_CREDIT_UNIT_BRL} from "@/lib/billing/credit-economics";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { assertOrganizationOperationalAccess, assertOrganizationFeatureAccess } from "@/lib/billing/access-control";
import { assertContractAccess } from "@/lib/billing/contract-access";
import { calculateMeteredUsageCharge, extractGeminiUsageMetadata, resolveActiveBillingRates } from "@/lib/billing/metered-usage";
import { loadGeminiCredentials } from "@/lib/gemini/credentials";
import { resolveAiFileParts } from "./files";
import { parseNativeAiInput } from "./native-input";
import { parseEmbeddingInput } from "./embedding-input";
import { AiInputError, parseAdvancedAiOptions, parseAiMessages } from "./advanced-input";
import { aiModelDefinition, publicModelId } from "./model-catalog";
import { publicAiResult } from "./public-response";
import { implementedAiCapabilities, releaseAiModelIds } from "./capabilities";

type Json = Record<string, unknown>;
export class AiApiError extends Error {
  requestId?:string;
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export const hashAiSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export function createAiSecret() {
  const secret = `chy_ai_${randomBytes(32).toString("hex")}`;
  return { secret, key_hash: hashAiSecret(secret), key_prefix: secret.slice(0, 16) };
}
export type AiProject = { id: string; organization_id: string; name: string; status: string; max_output_tokens: number; monthly_credit_limit: number | null; requests_per_minute: number };
export async function authenticateAi(request: Request, client = createServiceClient()) {
  const secret = request.headers.get("authorization")?.match(/^Bearer (chy_ai_[a-f0-9]{64})$/)?.[1];
  if (!secret) throw new AiApiError("invalid_api_key", 401, "Informe uma chave de API de IA ConnectyHub válida.");
  const { data: key, error } = await client.from("ai_api_keys").select("id,project_id,status,model_id").eq("key_hash", hashAiSecret(secret)).maybeSingle();
  if (error) throw new AiApiError("service_unavailable", 503, "Não foi possível verificar a chave.");
  if (!key || key.status !== "active") throw new AiApiError("invalid_api_key", 401, "Chave inválida ou revogada.");
  const { data: project } = await client.from("ai_projects").select("*").eq("id", key.project_id).single<AiProject>();
  if (!project || project.status !== "active") throw new AiApiError("project_paused", 403, "Este projeto está pausado.");
  const billing = await assertOrganizationOperationalAccess({ organizationId: project.organization_id, client });
  await assertOrganizationFeatureAccess({ organizationId: project.organization_id, featureCode: "llm_api", client });
  const access = await assertContractAccess(project.organization_id, client);
  return { key, project, billing, billingOrganizationId: access.billing_organization_id };
}

// Explicit input contract: unsupported SDK fields cannot silently change price or behavior.
export function parseAiInput(raw: unknown, outputLimit: number) {
  const body = record(raw);
  const accepted = new Set(["model", "messages", "max_tokens", "temperature", "stream", "stream_options", "tools", "tool_choice", "response_format"]);
  if (Object.keys(body).some((key) => !accepted.has(key))) throw new AiApiError("unsupported_parameter", 422, "Parâmetro não suportado. Consulte /docs/ia.");
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100) throw new AiApiError("invalid_messages", 422, "Envie entre 1 e 100 mensagens.");
  const maxTokens = body.max_tokens === undefined ? Math.min(1024, outputLimit) : Number(body.max_tokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > outputLimit) throw new AiApiError("output_limit", 422, "Não foi possível usar essa configuração de resposta. Envie apenas a mensagem para configuração automática.");
  const temperature = body.temperature === undefined ? 0.7 : Number(body.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new AiApiError("invalid_temperature", 422, "temperature deve estar entre 0 e 2.");
  if (body.stream !== undefined && typeof body.stream !== "boolean") throw new AiApiError("invalid_stream", 422, "stream deve ser booleano.");
  if (body.stream_options !== undefined) {
    const options = record(body.stream_options);
    if (!body.stream || Object.keys(options).some(key => key !== "include_usage") || (options.include_usage !== undefined && typeof options.include_usage !== "boolean")) throw new AiApiError("invalid_stream_options", 422, "stream_options aceita apenas include_usage booleano com stream ativado.");
  }
  try {
    const messages = parseAiMessages(body.messages);
    const options = parseAdvancedAiOptions(body);
    return { model: typeof body.model === "string" ? body.model : "connectyhub-auto", stream: body.stream === true, maxTokens,
      capabilities: [...new Set([...messages.capabilities,...options.capabilities])],
      providerBody: { contents: messages.contents,
        ...(messages.systems.length ? { systemInstruction: { parts: [{ text: messages.systems.join("\n\n") }] } } : {}),
        generationConfig: { maxOutputTokens: maxTokens, temperature, candidateCount: 1, ...options.config },
        ...(options.tools.length ? { tools: options.tools } : {}), ...(options.toolConfig ? { toolConfig: options.toolConfig } : {}),
      },
    };
  } catch(error) {
    if(error instanceof AiInputError) throw new AiApiError(error.code,422,error.message);
    throw error;
  }
}

export async function listAiModels(client = createServiceClient()) {
  const credentials = await loadGeminiCredentials(client);
  const { data, error } = await client.from("provider_models").select("provider_model_id,display_name,enabled,metadata,provider_cost_centers!inner(provider,enabled)").eq("enabled", true).eq("provider_cost_centers.enabled",true).eq("provider_cost_centers.provider", "gemini");
  if (error) throw new AiApiError("models_unavailable", 503, "Não foi possível carregar os modelos.");
  // The initial provider adapter only supports content generation, not TTS/video.
  const models = (data ?? []).filter((m) => record(m.metadata).external_ai_available!==false && /^gemini-[\w.-]+$/.test(m.provider_model_id) && !/tts|image|video|live/.test(m.provider_model_id));
  // Only route to models enabled in our price catalog. A newer internal agent
  // default does not automatically become a billable external API model.
  const defaultModel = models.find(m=>m.provider_model_id===credentials.model)?.provider_model_id
    ?? models.find(m=>/flash/.test(m.provider_model_id))?.provider_model_id ?? models[0]?.provider_model_id;
  if (!defaultModel) throw new AiApiError("models_unavailable",503,"Nenhum modelo de geração está habilitado.");
  return { defaultModel, models };
}

export async function completeAi(request: Request, raw: unknown, client: SupabaseClient = createServiceClient(), format: "chat" | "native" | "embedding" = "chat") {
  const auth = await authenticateAi(request, client);
  let input;
  try { input = format === "embedding" ? parseEmbeddingInput(raw) : format === "native" ? parseNativeAiInput(raw,65536) : parseAiInput(raw,8192); }
  catch(error) { if(error instanceof AiInputError) throw new AiApiError(error.code,422,error.message); throw error; }
  if (auth.key.model_id && input.model !== "connectyhub-auto" && input.model !== auth.key.model_id) throw new AiApiError("model_key_mismatch",422,"Esta chave está vinculada a outro modelo. Use o modelo da chave ou omita model.");
  const {capabilities: requestedCapabilities,...identityInput}=input;
  void requestedCapabilities;
  const identity = auth.key.model_id ? {...identityInput,model:auth.key.model_id} : identityInput;
  const idempotency = request.headers.get("idempotency-key") ?? randomUUID();
  if (!/^[\x21-\x7e]{1,128}$/.test(idempotency)) throw new AiApiError("invalid_idempotency_key", 422, "Idempotency-Key deve ter entre 1 e 128 caracteres ASCII sem espaços.");
  const claimed = await rpc(client, "claim_ai_request", { p_key: auth.key.id, p_idempotency: idempotency, p_hash: hashAiSecret(JSON.stringify(format !== "chat" ? {format,...identity} : identity)) });
  const requestId = String(claimed.id);
  if (!claimed.claimed) {
    if (claimed.status === "completed") return { response: publicAiResult(claimed.response), stream: input.stream, requestId, replayed: true, organizationId: auth.billingOrganizationId };
    const error=new AiApiError(claimed.status === "failed" ? "previous_request_failed" : "request_in_progress", 409, claimed.status === "failed" ? "A tentativa anterior falhou. Consulte o histórico e use uma nova Idempotency-Key para outra tentativa." : "Esta solicitação já está sendo processada ou conciliada. Reutilize a mesma Idempotency-Key para consultar o resultado.");
    error.requestId=requestId;throw error;
  }
  let dispatched = false;
  try {
    const { defaultModel, models } = await listAiModels(client);
    const selected = auth.key.model_id ? aiModelDefinition(auth.key.model_id) : input.model !== "connectyhub-auto" ? aiModelDefinition(input.model) : null;
    if (auth.key.model_id && input.model !== "connectyhub-auto" && input.model !== auth.key.model_id) throw new AiApiError("model_key_mismatch",422,"Esta chave está vinculada a outro modelo. Use o modelo da chave ou omita model.");
    if ((auth.key.model_id || input.model !== "connectyhub-auto") && !selected) throw new AiApiError("model_unavailable",422,"Modelo não disponível nesta API.");
    if (selected) {
      const {data:published,error}=await client.from("ai_public_models").select("enabled").eq("id",selected.id).maybeSingle();
      if(error || !published?.enabled || !releaseAiModelIds.includes(selected.id)) throw new AiApiError("model_unavailable",422,"Modelo temporariamente indisponível.");
    }
    const model = selected?.providerId ?? defaultModel;
    const definition = selected ?? aiModelDefinition(publicModelId(model));
    input.capabilities.push(...await resolveAiFileParts(client,auth,input.providerBody.contents));
    const supported = definition?.capabilities ?? ["image_input"];
    if (format !== "embedding" && definition && !supported.includes("chat")) throw new AiApiError("model_capability_unavailable",422,"Use um modelo de conversas nesta operação.");
    if(input.capabilities.some(capability => !supported.includes(capability))) throw new AiApiError("model_capability_unavailable",422,"O modelo desta chave não oferece um dos recursos solicitados.");
    if(input.capabilities.some(capability => !implementedAiCapabilities.includes(capability))) throw new AiApiError("capability_not_released",422,"Este recurso ainda não está liberado. Consulte os recursos disponíveis em /api/v1/ai/models.");
    if(input.maxTokens > (definition?.outputCapacity ?? 8192)) throw new AiApiError("output_limit",422,"Configuração de resposta acima da capacidade deste modelo.");
    if (!models.some((m) => m.provider_model_id === model)) throw new AiApiError("model_unavailable", 422, "Escolha um modelo disponível em /api/v1/ai/models.");
    const credentials = await loadGeminiCredentials(client);
    const rates = await resolveActiveBillingRates(client, { provider: "gemini", featureCode: "external_ai", modelId: model, planCode: auth.billing.planCode });
    const longRates = /^gemini-3\.1-pro-preview/.test(model) ? await resolveActiveBillingRates(client,{provider:"gemini",featureCode:"external_ai_long_context",modelId:model,planCode:auth.billing.planCode}) : rates;
    if (!longRates.length) throw new AiApiError("pricing_unavailable",503,"A tarifa deste modelo ainda não está configurada.");
    if (!(format === "embedding" ? ["input_token"] : ["input_token", "output_token"]).every((unit) => rates.some((rate) => rate.unit === unit && rate.connectyPricePerUnit > 0))) throw new AiApiError("pricing_unavailable", 503, "A tarifa deste modelo ainda não está configurada.");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
    const headers = { "Content-Type": "application/json", "x-goog-api-key": credentials.apiKey };
    const countBody = format === "embedding" ? { contents: input.providerBody.contents } : { generateContentRequest: { model: `models/${model}`, ...input.providerBody } };
    const countResponse = await fetch(`${endpoint}:countTokens`, { method: "POST", headers, body: JSON.stringify(countBody), signal: AbortSignal.timeout(20000) });
    if (!countResponse.ok) throw new AiApiError("token_count_failed", 503, "Não foi possível calcular o orçamento desta solicitação. Nenhum crédito foi debitado.");
    const count = Number(record(await countResponse.json()).totalTokens);
    if (!Number.isFinite(count) || count < 1 || count > (format !== "chat" ? definition?.inputCapacity ?? 32768 : 32768)) throw new AiApiError("input_limit", 422, "Não foi possível processar este conteúdo. Envie uma mensagem menor.");
    const shadow = auth.billing.planCode === "internal";
    const reservedInput = Math.ceil(count * 1.05) + 32;
    const budgetRates = reservedInput > 200000 ? longRates : rates;
    const budget = calculateMeteredUsageCharge({ rates:budgetRates, units: { inputTokens: reservedInput, outputTokens: input.maxTokens, requests: 1 } });
    await rpc(client, "reserve_ai_credits", { p_request: requestId, p_amount: shadow ? 0 : budget.chargeCredits, p_model: model, p_rates: budgetRates });
    if (request.signal.aborted) throw new AiApiError("request_cancelled", 499, "Solicitação cancelada antes da execução.");
    await assertContractAccess(auth.project.organization_id, client);
    await rpc(client, "start_ai_request", { p_request: requestId });
    dispatched = true;
    // Do not bind generation to the caller's abort signal: finish accounting even
    // if their connection disappears. No provider retry after dispatch.
    const generationBody = format === "embedding" ? { model: `models/${model}`, content: input.providerBody.contents[0], embedContentConfig: record(input.providerBody).embedContentConfig } : input.providerBody;
    const generated = await fetch(`${endpoint}:${format === "embedding" ? "embedContent" : "generateContent"}`, { method: "POST", headers, body: JSON.stringify(generationBody), signal: AbortSignal.timeout(90000) });
    if (!generated.ok) {
      if ([400,401,403,404,422,429].includes(generated.status)) dispatched = false;
      const code = generated.status === 403 ? "provider_access_denied" : generated.status === 401 ? "provider_credentials_invalid" : generated.status === 429 ? "provider_rate_limited" : "provider_unavailable";
      throw new AiApiError(code, 502, "Não foi possível concluir a geração. Consulte o estado pelo identificador da solicitação.");
    }
    const data = record(await generated.json());
    const vector = record(data.embedding).values;
    if (format === "embedding" && (!Array.isArray(vector) || !vector.length || vector.some(value => typeof value !== "number" || !Number.isFinite(value)))) throw new AiApiError("invalid_embedding_response",502,"A resposta aguarda conferência. Consulte a solicitação antes de repetir.");
    const embeddingCount = Number(record(data.usageMetadata).promptTokenCount ?? count);
    const usage = format === "embedding" && Number.isFinite(embeddingCount) && embeddingCount > 0 ? { inputTokens: embeddingCount, outputTokens: 0, thoughtsTokens: 0 } : extractGeminiUsageMetadata(data);
    if (!usage) throw new AiApiError("usage_unavailable", 502, "A resposta aguarda conciliação de consumo. Não repita com outra chave de idempotência.");
    const toolInput=Number(record(data.usageMetadata).toolUsePromptTokenCount ?? 0);
    if(!Number.isFinite(toolInput)||toolInput<0) throw new AiApiError("usage_unavailable",502,"O consumo aguarda conferência.");
    const billedInput=usage.inputTokens+toolInput;
    const output = usage.outputTokens + usage.thoughtsTokens;
    const calculation = calculateMeteredUsageCharge({ rates:billedInput > 200000 ? longRates : rates, units: { inputTokens: billedInput, outputTokens: output, requests: 1 } });
    // The reservation is an estimate. Actual processing obtains additional funds
    // under the wallet lock or stays pending until it can be settled.
    const charge = shadow ? 0 : calculation.chargeCredits;
    const candidate = record(Array.isArray(data.candidates) ? data.candidates[0] : null);
    const parts = record(candidate.content).parts;
    const toolCalls = Array.isArray(parts) ? parts.map(record).filter(p=>p.functionCall).map((p,index)=>{
      const call=record(p.functionCall);
      return {id:typeof call.id==="string"?call.id:`call_${requestId}_${index}`,type:"function",function:{name:call.name,arguments:JSON.stringify(call.args??{})},...(typeof p.thoughtSignature==="string"?{context:p.thoughtSignature}:{})};
    }) : [];
    const content = Array.isArray(parts) ? parts.map(record).filter((p) => p.thought !== true).map((p) => typeof p.text === "string" ? p.text : "").join("") : "";
    const chatResponse = { id: `chatcmpl-${requestId}`, object: "chat.completion", created: Math.floor(Date.now()/1000), model: publicModelId(model), choices: [{ index: 0, message: { role: "assistant", content, ...(toolCalls.length?{tool_calls:toolCalls}:{}) }, finish_reason: candidate.finishReason === "MAX_TOKENS" ? "length" : toolCalls.length ? "tool_calls" : content ? "stop" : "content_filter" }], usage: { prompt_tokens: usage.inputTokens, completion_tokens: output, total_tokens: usage.inputTokens + output, completion_tokens_details: { reasoning_tokens: usage.thoughtsTokens } }, connectyhub: { request_id: requestId, credits: charge, project_id: auth.project.id } };
    const response = format === "embedding" ? {id:requestId,object:"embedding.list",model:publicModelId(model),data:[{object:"embedding",index:0,embedding:vector}],connectyhub:chatResponse.connectyhub} : format === "native" ? {
      id:requestId,object:"content.response",created:chatResponse.created,model:publicModelId(model),
      candidates:Array.isArray(data.candidates)?data.candidates:[],connectyhub:chatResponse.connectyhub,
    } : chatResponse;
    const settlement = { p_request: requestId, p_status: "completed", p_response: response, p_usage: { creditUnitBrl: CONNECTY_CREDIT_UNIT_BRL, input: billedInput, output, cost: calculation.providerCost, charge, providerResponseId: data.responseId, billingMode: shadow ? "internal_shadow" : auth.billing.planCode === "trial" ? "trial_billable" : "customer_billable", metering: { matchedRates: calculation.matchedRates, calculatedCredits: calculation.chargeCredits, absorbedCredits: Math.max(0, calculation.chargeCredits-charge), toolInput, version: "external_ai_v3" } } };
    const persisted = await client.from("ai_requests").update({ result_snapshot: settlement }).eq("id", requestId).eq("status", "processing");
    if (persisted.error) throw new AiApiError("settlement_pending", 503, "O consumo está em conferência. Consulte esta solicitação antes de tentar novamente.");
    const settled = await rpc(client, "settle_ai_operation", settlement);
    return { response: publicAiResult(settled.response), stream: input.stream, requestId, replayed: false, organizationId: auth.billingOrganizationId };
  } catch (error) {
    await rpc(client, "finish_ai_request", { p_request: requestId, p_status: dispatched ? "uncertain" : "failed", p_error: error instanceof AiApiError ? error.code : "internal_error" }).catch(() => undefined);
    const outward=error instanceof AiApiError?error:new AiApiError("request_failed",503,"Não foi possível concluir. Consulte esta solicitação no histórico antes de iniciar outra.");
    outward.requestId=requestId;throw outward;
  }
}
export async function rpc(client: SupabaseClient, name: string, args: Json): Promise<Json> {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    const code = error.message.match(/ai_[a-z_]+/)?.[0] ?? "service_unavailable";
    const status = /insufficient|budget|contract/.test(code) ? 402 : /rate_limit/.test(code) ? 429 : /conflict|state/.test(code) ? 409 : /key_inactive/.test(code) ? 401 : 503;
    throw new AiApiError(code, status, status === 402 ? "Confira o saldo disponível e o acesso da sua conta ConnectyHub." : "Não foi possível processar a solicitação. Consulte o histórico no painel.");
  }
  return record(data);
}
export function record(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }

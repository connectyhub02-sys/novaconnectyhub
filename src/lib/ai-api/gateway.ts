import "server-only";
import {CONNECTY_CREDIT_UNIT_BRL} from "@/lib/billing/credit-economics";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { assertOrganizationOperationalAccess, assertOrganizationFeatureAccess } from "@/lib/billing/access-control";
import { assertContractAccess } from "@/lib/billing/contract-access";
import { calculateMeteredUsageCharge, extractGeminiUsageMetadata, resolveActiveBillingRates } from "@/lib/billing/metered-usage";
import { loadGeminiCredentials } from "@/lib/gemini/credentials";

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
  const { data: key, error } = await client.from("ai_api_keys").select("id,project_id,status").eq("key_hash", hashAiSecret(secret)).maybeSingle();
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
  const accepted = new Set(["model", "messages", "max_tokens", "temperature", "stream", "stream_options"]);
  if (Object.keys(body).some((key) => !accepted.has(key))) throw new AiApiError("unsupported_parameter", 422, "Parâmetro não suportado. Consulte /docs/ia.");
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100) throw new AiApiError("invalid_messages", 422, "Envie entre 1 e 100 mensagens.");
  const maxTokens = body.max_tokens === undefined ? Math.min(1024, outputLimit) : Number(body.max_tokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > outputLimit) throw new AiApiError("output_limit", 422, `A resposta deve ter limite entre 1 e ${outputLimit} unidades.`);
  const temperature = body.temperature === undefined ? 0.7 : Number(body.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new AiApiError("invalid_temperature", 422, "temperature deve estar entre 0 e 2.");
  if (body.stream !== undefined && typeof body.stream !== "boolean") throw new AiApiError("invalid_stream", 422, "stream deve ser booleano.");
  if (body.stream_options !== undefined) {
    const options = record(body.stream_options);
    if (!body.stream || Object.keys(options).some(key => key !== "include_usage") || (options.include_usage !== undefined && typeof options.include_usage !== "boolean")) throw new AiApiError("invalid_stream_options", 422, "stream_options aceita apenas include_usage booleano com stream ativado.");
  }
  const systems: string[] = [];
  const contents: Array<{ role: string; parts: Array<Json> }> = [];
  for (const item of body.messages) {
    const message = record(item);
    if (!["system", "user", "assistant"].includes(String(message.role))) throw new AiApiError("invalid_role", 422, "Use system, user ou assistant.");
    const parts: Json[] = [];
    if (typeof message.content === "string" && message.content.trim()) parts.push({ text: message.content });
    else if (Array.isArray(message.content) && message.role === "user") {
      for (const part of message.content) {
        const p = record(part);
        if (p.type === "text" && typeof p.text === "string") parts.push({ text: p.text });
        else if (p.type === "image_url") {
          const url = record(p.image_url).url;
          const match = typeof url === "string" ? url.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/) : null;
          if (!match) throw new AiApiError("invalid_image", 422, "Envie imagem PNG, JPEG ou WebP em data URL. URLs remotas não são aceitas.");
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        } else throw new AiApiError("unsupported_content", 422, "Conteúdo não suportado nesta versão.");
      }
    }
    if (!parts.length) throw new AiApiError("empty_message", 422, "A mensagem não pode estar vazia.");
    if (message.role === "system") systems.push(String(parts[0].text));
    else contents.push({ role: message.role === "assistant" ? "model" : "user", parts });
  }
  if (!contents.some((message) => message.role === "user")) throw new AiApiError("missing_user_message", 422, "Inclua uma mensagem do usuário.");
  return { model: typeof body.model === "string" ? body.model : "connectyhub-auto", stream: body.stream === true, maxTokens, providerBody: { contents, ...(systems.length ? { systemInstruction: { parts: [{ text: systems.join("\n\n") }] } } : {}), generationConfig: { maxOutputTokens: maxTokens, temperature, candidateCount: 1 } } };
}

export async function listAiModels(client = createServiceClient()) {
  const credentials = await loadGeminiCredentials(client);
  const { data, error } = await client.from("provider_models").select("provider_model_id,display_name,enabled,metadata,provider_cost_centers!inner(provider,enabled)").eq("enabled", true).eq("provider_cost_centers.enabled",true).eq("provider_cost_centers.provider", "gemini");
  if (error) throw new AiApiError("models_unavailable", 503, "Não foi possível carregar os modelos.");
  // The initial provider adapter only supports content generation, not TTS/video.
  const models = (data ?? []).filter((m) => record(m.metadata).external_ai_available!==false && /^gemini-[\w.-]+$/.test(m.provider_model_id) && !/tts|image|video|live|embedding/.test(m.provider_model_id));
  // Only route to models enabled in our price catalog. A newer internal agent
  // default does not automatically become a billable external API model.
  const defaultModel = models.find(m=>m.provider_model_id===credentials.model)?.provider_model_id
    ?? models.find(m=>/flash/.test(m.provider_model_id))?.provider_model_id ?? models[0]?.provider_model_id;
  if (!defaultModel) throw new AiApiError("models_unavailable",503,"Nenhum modelo de geração está habilitado.");
  return { defaultModel, models };
}

export async function completeAi(request: Request, raw: unknown, client: SupabaseClient = createServiceClient()) {
  const auth = await authenticateAi(request, client);
  const input = parseAiInput(raw, auth.project.max_output_tokens);
  const idempotency = request.headers.get("idempotency-key") ?? randomUUID();
  if (!/^[\x21-\x7e]{1,128}$/.test(idempotency)) throw new AiApiError("invalid_idempotency_key", 422, "Idempotency-Key deve ter entre 1 e 128 caracteres ASCII sem espaços.");
  const claimed = await rpc(client, "claim_ai_request", { p_key: auth.key.id, p_idempotency: idempotency, p_hash: hashAiSecret(JSON.stringify(input)) });
  const requestId = String(claimed.id);
  if (!claimed.claimed) {
    if (claimed.status === "completed") return { response: record(claimed.response), stream: input.stream, requestId, replayed: true, organizationId: auth.billingOrganizationId };
    const error=new AiApiError(claimed.status === "failed" ? "previous_request_failed" : "request_in_progress", 409, claimed.status === "failed" ? "A tentativa anterior falhou. Consulte o histórico e use uma nova Idempotency-Key para outra tentativa." : "Esta solicitação já está sendo processada ou conciliada. Reutilize a mesma Idempotency-Key para consultar o resultado.");
    error.requestId=requestId;throw error;
  }
  let dispatched = false;
  try {
    const { defaultModel, models } = await listAiModels(client);
    const model = input.model === "connectyhub-auto" ? defaultModel : input.model;
    if (!models.some((m) => m.provider_model_id === model)) throw new AiApiError("model_unavailable", 422, "Escolha um modelo disponível em /api/v1/ai/models.");
    const credentials = await loadGeminiCredentials(client);
    const rates = await resolveActiveBillingRates(client, { provider: "gemini", featureCode: "external_ai", modelId: model, planCode: auth.billing.planCode });
    if (!["input_token", "output_token"].every((unit) => rates.some((rate) => rate.unit === unit && rate.connectyPricePerUnit > 0))) throw new AiApiError("pricing_unavailable", 503, "A tarifa deste modelo ainda não está configurada.");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
    const headers = { "Content-Type": "application/json", "x-goog-api-key": credentials.apiKey };
    const countResponse = await fetch(`${endpoint}:countTokens`, { method: "POST", headers, body: JSON.stringify({ generateContentRequest: { model: `models/${model}`, ...input.providerBody } }), signal: AbortSignal.timeout(20000) });
    if (!countResponse.ok) throw new AiApiError("token_count_failed", 503, "Não foi possível calcular o orçamento desta solicitação. Nenhum crédito foi debitado.");
    const count = Number(record(await countResponse.json()).totalTokens);
    if (!Number.isFinite(count) || count < 1 || count > 32768) throw new AiApiError("input_limit", 422, "Entrada acima do limite de 32.768 unidades ou impossível de medir.");
    const shadow = auth.billing.planCode === "internal";
    const budget = calculateMeteredUsageCharge({ rates, units: { inputTokens: Math.ceil(count * 1.05) + 32, outputTokens: input.maxTokens, requests: 1 } });
    await rpc(client, "reserve_ai_credits", { p_request: requestId, p_amount: shadow ? 0 : budget.chargeCredits, p_model: model, p_rates: rates });
    if (request.signal.aborted) throw new AiApiError("request_cancelled", 499, "Solicitação cancelada antes da execução.");
    await assertContractAccess(auth.project.organization_id, client);
    await rpc(client, "start_ai_request", { p_request: requestId });
    dispatched = true;
    // Do not bind generation to the caller's abort signal: finish accounting even
    // if their connection disappears. No provider retry after dispatch.
    const generated = await fetch(`${endpoint}:generateContent`, { method: "POST", headers, body: JSON.stringify(input.providerBody), signal: AbortSignal.timeout(90000) });
    if (!generated.ok) {
      if ([400,401,403,404,422,429].includes(generated.status)) dispatched = false;
      const code = generated.status === 403 ? "provider_access_denied" : generated.status === 401 ? "provider_credentials_invalid" : generated.status === 429 ? "provider_rate_limited" : "provider_unavailable";
      throw new AiApiError(code, 502, "Não foi possível concluir a geração. Consulte o estado pelo identificador da solicitação.");
    }
    const data = record(await generated.json());
    const usage = extractGeminiUsageMetadata(data);
    if (!usage) throw new AiApiError("usage_unavailable", 502, "A resposta aguarda conciliação de consumo. Não repita com outra chave de idempotência.");
    const output = usage.outputTokens + usage.thoughtsTokens;
    const calculation = calculateMeteredUsageCharge({ rates, units: { inputTokens: usage.inputTokens, outputTokens: output, requests: 1 } });
    // Never charge above the budget reserved for this call. Provider overruns
    // remain recorded as cost for the operator, not a surprise customer debit.
    const charge = shadow ? 0 : Math.min(calculation.chargeCredits, budget.chargeCredits);
    const candidate = record(Array.isArray(data.candidates) ? data.candidates[0] : null);
    const parts = record(candidate.content).parts;
    const content = Array.isArray(parts) ? parts.map(record).filter((p) => p.thought !== true).map((p) => typeof p.text === "string" ? p.text : "").join("") : "";
    const response = { id: `chatcmpl-${requestId}`, object: "chat.completion", created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: candidate.finishReason === "MAX_TOKENS" ? "length" : content ? "stop" : "content_filter" }], usage: { prompt_tokens: usage.inputTokens, completion_tokens: output, total_tokens: usage.inputTokens + output, completion_tokens_details: { reasoning_tokens: usage.thoughtsTokens } }, connectyhub: { request_id: requestId, credits: charge, project_id: auth.project.id } };
    const settlement = { p_request: requestId, p_status: "completed", p_response: response, p_usage: { creditUnitBrl: CONNECTY_CREDIT_UNIT_BRL, input: usage.inputTokens, output, cost: calculation.providerCost, charge, providerResponseId: data.responseId, billingMode: shadow ? "internal_shadow" : auth.billing.planCode === "trial" ? "trial_billable" : "customer_billable", metering: { matchedRates: calculation.matchedRates, calculatedCredits: calculation.chargeCredits, absorbedCredits: Math.max(0, calculation.chargeCredits-charge), version: "external_ai_v1" } } };
    const persisted = await client.from("ai_requests").update({ result_snapshot: settlement }).eq("id", requestId).eq("status", "processing");
    if (persisted.error) throw new AiApiError("settlement_pending", 503, "O consumo está em conferência. Consulte esta solicitação antes de tentar novamente.");
    const settled = await rpc(client, "finish_ai_request", settlement);
    return { response: record(settled.response), stream: input.stream, requestId, replayed: false, organizationId: auth.billingOrganizationId };
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
    throw new AiApiError(code, status, status === 402 ? "Saldo, limite ou contrato insuficiente. Confira sua conta ConnectyHub." : "Não foi possível processar a solicitação. Consulte o código e o histórico no painel.");
  }
  return record(data);
}
export function record(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }

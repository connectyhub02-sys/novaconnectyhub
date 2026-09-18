import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptCredentialValue } from "@/lib/security/credentials-crypto";
import { loadAsaasPlatformBillingConfig } from "@/lib/sales-catalog/asaas";
import { AsaasDirectError, tokenizeAsaasReplacementCard } from "@/lib/sales-catalog/asaas-direct";
import { record } from "@/lib/sales-catalog/card-input";
import { replacementConsentVersion } from "./managed-renewal-policy";
import { parseReplacementCardDetails } from "./replacement-card-input";
import { pixAutomaticAvailability } from "./pix-automatic-availability";
import { detectCheckoutCardBrand } from "@/lib/sales-catalog/card-brand";

export const isReplacementId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const messages: Record<string, string> = {
  forbidden: "Somente o titular ou administrador desta organização pode trocar o cartão.",
  not_found: "Assinatura não encontrada nesta organização.",
  inactive_plan: "É necessário um plano ativo ou vencido para gerenciar seu cartão.",
  automatic_renewal_required: "Esta assinatura não tem renovação automática por cartão ativa. Solicite a configuração da renovação à equipe.",
  unsupported_provider: "Esta assinatura usa uma integração anterior. A troca precisa ser tratada pela equipe no gateway, preservando o contrato.",
  billing_busy: "Há um pagamento ou recarga em conferência. Aguarde a conclusão antes de trocar o cartão.",
  card_changed: "O cartão já foi alterado em outra solicitação. Atualize a página antes de continuar.",
  rate_limited: "Muitas tentativas. Aguarde um minuto antes de tentar novamente.",
  invalid_input: "Confira os dados do cartão, do titular e a autorização de substituição.",
  tokenization_rejected: "O novo cartão não foi autorizado para uso futuro. Confira os dados ou use outro cartão. O cartão anterior foi mantido.",
  gateway_unavailable: "O provedor está indisponível. O cartão anterior foi mantido. Tente novamente mais tarde.",
  gateway_configuration: "A tokenização não está disponível na integração. A equipe precisa conferir a credencial e a habilitação no gateway. O cartão anterior foi mantido.",
  request_conflict: "Esta solicitação já foi utilizada. Atualize a página.",
  processing: "A troca ainda não foi confirmada. Confira o resultado antes de enviar outra solicitação.",
  pix_automatic_unavailable: pixAutomaticAvailability("replacement").reason,
};

export class CardReplacementError extends Error {
  constructor(readonly code: string, readonly status = code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "invalid_input" || code === "tokenization_rejected" ? 422 : code === "rate_limited" ? 429 : code.startsWith("gateway_") || code === "internal_error" ? 503 : 409) {
    super(messages[code] ?? "Não foi possível confirmar a troca. Atualize a página para conferir o resultado.");
  }
}

type Scope = { organizationId: string; actorId: string; subscriptionId: string };
type Result = { state: "processing" | "failed" | "succeeded"; result_code: string | null; claimed?: boolean; customer_id?: string };
const params = (scope: Scope) => ({ p_org: scope.organizationId, p_actor: scope.actorId, p_subscription: scope.subscriptionId });

export async function readCardReplacement(client: SupabaseClient, scope: Scope, requestId?: string) {
  const check = await client.rpc("billing_card_replacement_block", params(scope));
  if (check.error) throw new CardReplacementError("internal_error");
  // Never expose a foreign subscription or operation, even for platform admins.
  if (["forbidden", "not_found"].includes(check.data)) throw new CardReplacementError(check.data);
  const card = await client.from("billing_asaas_card_vault").select("last_digits,consent_at")
    .eq("organization_id", scope.organizationId).eq("subscription_id", scope.subscriptionId).eq("status", "active").maybeSingle();
  if (card.error) throw new CardReplacementError("internal_error");
  let operation: { state: string; result_code: string | null } | null = null;
  if (requestId) {
    const found = await client.from("billing_card_replacements").select("state,result_code")
      .eq("id", requestId).eq("organization_id", scope.organizationId).eq("actor_id", scope.actorId).eq("subscription_id", scope.subscriptionId).maybeSingle();
    if (found.error) throw new CardReplacementError("internal_error");
    operation = found.data;
  }
  return {
    eligible: check.data === null,
    reason: check.data ? new CardReplacementError(check.data).message : null,
    lastFour: card.data?.last_digits ?? null,
    changedAt: card.data?.consent_at ?? null,
    operation,
  };
}

function resultOrThrow(result: Result) {
  if (result.state !== "succeeded") throw new CardReplacementError(result.state === "processing" ? "processing" : result.result_code ?? "internal_error");
  return { ok: true, state: "succeeded", message: "Cartão alterado para futuras cobranças. Plano, valor e vencimento preservados. Nenhuma cobrança foi criada." };
}

export async function replaceSubscriptionCard(client: SupabaseClient, scope: Scope, value: unknown, remoteIp: string) {
  const body = record(value);
  if (!isReplacementId(body.requestId)) throw new CardReplacementError("invalid_input");
  const args = { ...params(scope), p_request: body.requestId };
  // The durable record precedes card handling and provider dispatch. Replays cannot
  // tokenize twice or replace a newer card after a lost response.
  const begun = await client.rpc("begin_billing_card_replacement", args);
  if (begun.error || !begun.data) throw new CardReplacementError("internal_error");
  const claim = begun.data as Result;
  if (!claim.claimed) return resultOrThrow(claim);

  let tokenEncrypted: string | null = null;
  let lastFour: string | null = null;
  let failure: string | null = null;
  let cardMetadata: Record<string, string | null> | null = null;
  let billingHolder: Record<string, string> | null = null;
  try {
    if (body.method === "pix_automatic") throw new CardReplacementError("pix_automatic_unavailable");
    let card, holder;
    try {
      if (body.acceptReplacement !== true || body.consentVersion !== replacementConsentVersion) throw new Error();
      if (body.method && body.method !== "card") throw new Error();
      ({ card, holder } = parseReplacementCardDetails(body.card, body.holder));
    } catch { throw new CardReplacementError("invalid_input"); }
    let config;
    try { config = await loadAsaasPlatformBillingConfig({ client }); }
    catch { throw new CardReplacementError("gateway_configuration"); }
    if (!claim.customer_id) throw new CardReplacementError("internal_error");
    const token = await tokenizeAsaasReplacementCard({ ...config, customerId: claim.customer_id, card, holder, remoteIp });
    tokenEncrypted = encryptCredentialValue(token);
    lastFour = card.number.slice(-4);
    cardMetadata = { brand: detectCheckoutCardBrand(card.number), exp_month: card.expiryMonth, exp_year: card.expiryYear };
    billingHolder = { ...holder };
  } catch (error) {
    failure = error instanceof CardReplacementError ? error.code
      : error instanceof AsaasDirectError ? error.diagnostic?.category === "validation" || error.declined ? "tokenization_rejected"
        : error.diagnostic?.category === "integration" ? "gateway_configuration" : "gateway_unavailable"
      : "internal_error";
  }
  // Card persistence receives ciphertext and display metadata only. Holder data
  // is a private, reviewable billing suggestion in the same transaction.
  const finished = await client.rpc("finish_billing_card_replacement_profile", {
    ...args, p_token_encrypted: tokenEncrypted, p_last_four: lastFour, p_failure: failure,
    p_card_metadata: cardMetadata, p_holder: billingHolder,
  });
  // A database transport failure may follow a commit. Keep the durable result for
  // GET/replay reconciliation; never overwrite a possible success with failure.
  if (finished.error || !finished.data) throw new CardReplacementError("internal_error");
  return resultOrThrow(finished.data as Result);
}

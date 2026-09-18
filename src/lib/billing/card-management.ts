import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptCredentialValue } from "@/lib/security/credentials-crypto";
import { loadAsaasPlatformBillingConfig } from "@/lib/sales-catalog/asaas";
import { AsaasDirectError, tokenizeAsaasBillingCard } from "@/lib/sales-catalog/asaas-direct";
import { parseCheckoutCard, parseCheckoutCardHolder, record } from "@/lib/sales-catalog/card-input";
import { cardManagementConsentVersion } from "./card-management-policy";

export class CardManagementError extends Error { constructor(message: string, public status = 409) { super(message); } }
export type ManagedSubscription = { id: string; status: string; billing_provider: string; provider_subscription_id: string | null; current_period_end: string | null; next_billing_at: string | null; plan_code: string; metadata: Record<string, unknown> | null };
const safeCardColumns = "id,status,brand,last_digits,exp_month,exp_year,created_at";
export function cardBlocker(s: ManagedSubscription) {
  if (!["active", "past_due"].includes(s.status) || !s.current_period_end) return "É preciso uma assinatura ativa ou vencida. Confira a assinatura em Minha Conta antes de cadastrar o cartão.";
  if (s.billing_provider !== "asaas" || s.provider_subscription_id) return "Esta assinatura usa um acordo externo. Solicite ao suporte a atualização no provedor atual, preservando o vencimento; não refaça o checkout do ciclo já pago.";
  if (record(s.metadata?.commercial_terms).billing_cycle === "one_time") return "Esta compra é avulsa e não possui renovação automática.";
  return null;
}
export async function managedSubscription(client: SupabaseClient, org: string, id: string) {
  const {data,error} = await client.from("organization_subscriptions").select("id,status,billing_provider,provider_subscription_id,current_period_end,next_billing_at,plan_code,metadata").eq("organization_id",org).eq("id",id).maybeSingle();
  if(error) throw new CardManagementError("Não foi possível consultar sua assinatura.",503);
  if(!data) throw new CardManagementError("Assinatura não encontrada nesta organização.",404);
  return data as ManagedSubscription;
}
export async function listBillingCards(client: SupabaseClient, org: string, id: string) {
  const subscription = await managedSubscription(client,org,id);
  const cards = await client.from("billing_asaas_card_vault").select(safeCardColumns).eq("organization_id",org).eq("subscription_id",id).eq("selectable",true).in("status",["active","inactive"]).order("created_at",{ascending:false}).limit(50);
  if(cards.error) throw new CardManagementError("Não foi possível carregar os cartões. Solicite ao suporte a verificação do cofre de pagamentos.",503);
  return { subscriptionId:id, periodEnd:subscription.current_period_end, nextBillingAt:subscription.next_billing_at, blocker:cardBlocker(subscription), cards:cards.data ?? [] };
}
export async function changeBillingCard(client: SupabaseClient, org: string, actor: string, body: Record<string,unknown>, remoteIp: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(typeof body.subscriptionId!=="string" || !uuid.test(body.subscriptionId) || typeof body.requestId!=="string" || !uuid.test(body.requestId) || (body.expectedDefault!==null && (typeof body.expectedDefault!=="string" || !uuid.test(body.expectedDefault))) || typeof body.expectedEnd!=="string" || !Number.isFinite(Date.parse(body.expectedEnd))) throw new CardManagementError("Atualize a página e confira a assinatura.",400);
  if(body.acceptRecurring!==true || body.consentVersion!==cardManagementConsentVersion) throw new CardManagementError("Confirme a autorização para usar o cartão nas próximas renovações.",422);
  const subscription = await managedSubscription(client,org,body.subscriptionId);
  const blocker=cardBlocker(subscription); if(blocker) throw new CardManagementError(blocker);
  const receipt=await client.from("billing_payment_method_changes").select("method_id,topup_updated").eq("id",body.requestId).eq("organization_id",org).eq("subscription_id",body.subscriptionId).eq("actor_id",actor).maybeSingle();
  if(receipt.error) throw new CardManagementError("Não foi possível conferir a troca. Atualize a página antes de tentar novamente.",503);
  if(receipt.data) return {methodId:receipt.data.method_id,topupUpdated:receipt.data.topup_updated,replayed:true};
  const current=await client.from("billing_asaas_card_vault").select("id,customer_id").eq("organization_id",org).eq("subscription_id",body.subscriptionId).eq("status","active").maybeSingle();
  if(current.error) throw new CardManagementError("Não foi possível conferir o cartão atual.",503);
  if((current.data?.id??null)!==body.expectedDefault || Date.parse(body.expectedEnd)!==Date.parse(subscription.current_period_end!)) throw new CardManagementError("A assinatura ou o cartão padrão mudou. Atualize a página e confirme novamente.");
  let cardData: Record<string,unknown> | null=null; let method: string | null=null;
  let billingHolder: Record<string,string> | null=null;
  if(body.action==="default") {
    if(typeof body.methodId!=="string" || !uuid.test(body.methodId)) throw new CardManagementError("Selecione um cartão cadastrado.",400);
    method=body.methodId;
  } else if(body.action==="add") {
    let card,holder;
    try {card=parseCheckoutCard(body.card);holder=parseCheckoutCardHolder(body.holder);} catch {throw new CardManagementError("Confira os dados do cartão e do titular.",422);}
    try {
      // Only tokenization: no /payments, /subscriptions or checkout call is allowed here.
      const config=await loadAsaasPlatformBillingConfig({client});
      const token=await tokenizeAsaasBillingCard({...config,card,holder,remoteIp,customerId:current.data?.customer_id});
      cardData={customer_id:token.customerId,token_encrypted:encryptCredentialValue(token.token),brand:token.brand,last_digits:card.number.slice(-4),exp_month:card.expiryMonth,exp_year:card.expiryYear};
      billingHolder={...holder};
    } catch(error) {
      if(error instanceof AsaasDirectError && [401,403].includes(error.diagnostic?.httpStatus ?? 0)) throw new CardManagementError("O Asaas não autorizou a tokenização sem cobrança. Solicite ao suporte ConnectyHub a habilitação de tokenização na conta Asaas. Seu cartão atual foi mantido; não refaça o pagamento do ciclo.",422);
      throw new CardManagementError("Não foi possível tokenizar e salvar o novo cartão. O cartão atual foi mantido e nenhuma cobrança foi solicitada. Confira os dados ou contate o suporte.",422);
    }
  } else throw new CardManagementError("Ação inválida.",400);
  const result=await client.rpc("set_billing_default_card_profile",{p_org:org,p_actor:actor,p_subscription:body.subscriptionId,p_request:body.requestId,p_expected_default:body.expectedDefault,p_expected_end:body.expectedEnd,p_consent:body.consentVersion,p_method:method,p_card:cardData,p_holder:billingHolder});
  if(result.error){
    const code=result.error.message;
    if(code.includes("CARD_PAYMENT_BUSY")) throw new CardManagementError("Há um pagamento em processamento ou conferência. Aguarde a conclusão antes de trocar o cartão; nenhuma nova cobrança foi solicitada.");
    if(code.includes("CARD_STALE")) throw new CardManagementError("A assinatura ou o cartão padrão mudou. Atualize a página e confirme novamente.");
    if(code.includes("CARD_EXPIRED")) throw new CardManagementError("O cartão selecionado venceu. Adicione outro cartão.",422);
    throw new CardManagementError("Não foi possível confirmar a troca. Atualize a lista para conferir o cartão padrão antes de tentar novamente.",503);
  }
  return result.data as {methodId:string;topupUpdated:boolean;replayed:boolean};
}

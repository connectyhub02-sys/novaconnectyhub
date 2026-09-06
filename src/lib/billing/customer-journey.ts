import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppBaseUrl } from "@/lib/sales-catalog/mercado-pago";
import { getContractAccess } from "./contract-access";

export async function recordPlatformCustomerEvent(client: SupabaseClient, input: { userId: string; eventType: string; sourceId?: string; payload?: Record<string, unknown>; eventKey?: string }) {
  const { error } = await client.from("platform_customer_journey").upsert({ user_id: input.userId, event_key: input.eventKey ?? randomUUID(),
    event_type: input.eventType, source_id: input.sourceId ?? null, payload: input.payload ?? {},
  }, { onConflict: "event_key", ignoreDuplicates: true });
  if (error) throw new Error("Não foi possível registrar a jornada da compra.");
}

export async function loadPlatformCustomerContext(client: SupabaseClient, leadId: string) {
  const linked = await client.rpc("link_verified_platform_customer", { p_lead: leadId });
  if (linked.error) throw new Error("Não foi possível verificar a identidade financeira.");
  const identity = await client.from("platform_customer_identities").select("user_id,verified_phone").eq("lead_id", leadId).maybeSingle();
  if (identity.error) throw new Error("Contexto financeiro temporariamente indisponível.");
  if (!identity.data) return "A identidade desta conversa ainda não está vinculada a uma conta verificada. Oriente a entrar no painel para consultar o financeiro; não adivinhe a conta pelo nome.";
  const userId = identity.data.user_id;
  const verified = await client.from("profiles").select("phone_normalized,phone_verified_at").eq("id", userId).maybeSingle();
  if (!verified.data?.phone_verified_at || verified.data.phone_normalized !== identity.data.verified_phone) return "Vínculo financeiro precisa ser verificado novamente no painel.";
  const [organizations, purchases] = await Promise.all([
    client.from("organizations").select("id,name").eq("owner_id", userId).is("billing_organization_id", null).not("plan_code", "eq", "internal"),
    client.from("platform_product_entitlements").select("title,billing_cycle,state,ends_at").eq("buyer_user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);
  if (organizations.error || purchases.error) throw new Error("Contexto financeiro temporariamente indisponível.");
  const offers = await client.from("platform_products").select("id,name,price,offer,billing_cycle,billing_interval").eq("owner_type","connectyhub").eq("sales_channel_type","direct").eq("status","active").limit(30);
  if (offers.error) throw new Error("Não foi possível consultar as ofertas.");
  const accounts = [];
  for (const org of organizations.data ?? []) {
    const access = await getContractAccess(org.id, client);
    const payments = await client.from("billing_payments").select("id,status,amount_brl,provider_status,paid_at,created_at").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(3);
    if (payments.error) throw new Error("Não foi possível conferir o pagamento atual.");
    accounts.push({ company: org.name, plan: access.plan_code, active: access.allowed, reason: access.reason, due: access.period_end, blockedAt: access.blocked_at, payments: payments.data });
  }
  return JSON.stringify({ offers: (offers.data ?? []).map(p => ({...p, checkout: getAppBaseUrl()+"/dashboard/meus-produtos/comprar/"+p.id})), planCheckout:getAppBaseUrl()+"/dashboard/planos", checkedAt: new Date().toISOString(), accounts, purchases: purchases.data,
    guidance: "Estado interno atualizado pelos retornos financeiros; não representa consulta ao banco do comprador. Para ofertas ConnectyHub use o link de compra autenticado informado e explique a recorrência antes do pagamento. Não deduza falta de saldo, não garanta ausência de lançamento bancário. Pagamento pendente/recusado não foi confirmado para a ConnectyHub. Oriente a consultar o banco ou tentar outro método quando não houver tentativa em conferência. Comprovante não confirma pagamento; insistência/divergência exige equipe humana. Avulsos pagos permanecem acessíveis sem o plano; pagar avulso não reativa API/agentes. Não exponha identificadores internos desnecessários.",
  });
}

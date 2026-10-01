import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

const errors: Record<string, string> = {
  CONTRACT_NOT_FOUND: "Contrato não encontrado nesta conta.",
  CONTRACT_NOT_EFFECTIVE: "A vigência desta versão ainda não começou.",
  CONTRACT_VERSION_CHANGED: "Existe uma versão mais recente. Atualize a página e revise as condições.",
  CONTRACT_DEADLINE_EXPIRED: "O primeiro vencimento já passou. Crie uma versão com a nova data antes de ativar.",
  ACCOUNT_SUSPENDED: "A conta está suspensa administrativamente. Revise a suspensão antes de ativar.",
  BILLING_ACCOUNT_REQUIRED: "Selecione a conta responsável pela cobrança.",
  PLAN_UNAVAILABLE: "O plano-base está indisponível.",
  PAYMENT_IN_PROGRESS: "Há um pagamento em processamento. Aguarde a conciliação antes de ativar.",
  PENDING_INVOICE_REVIEW_REQUIRED: "A cobrança deste ciclo já foi enviada ao provedor. Concilie ou encerre essa cobrança antes de ativar novas condições.",
  PROVIDER_SUBSCRIPTION_REVIEW_REQUIRED: "Existe uma assinatura recorrente no provedor. Revise-a antes de substituir suas condições.",
};
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(); if (auth instanceof NextResponse) return auth;
  const origin = request.headers.get("origin");
  const expected = process.env.NEXT_PUBLIC_APP_URL;
  if (!expected || origin !== new URL(expected).origin) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || ![body.organizationId, body.contractId].every(value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))) {
    return NextResponse.json({ error: "Informe a conta e a versão do contrato." }, { status: 422 });
  }
  const { data, error } = await createServiceClient().rpc("activate_custom_contract", { p_organization: body.organizationId, p_contract: body.contractId, p_actor: auth.userId });
  if (error) return NextResponse.json({ error: errors[error.message] ?? "Não foi possível ativar o contrato. Nenhuma alteração parcial foi aplicada." }, { status: 409 });
  return NextResponse.json({ activation: data });
}

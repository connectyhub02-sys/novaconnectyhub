import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { planFeatureDefinitions } from "@/lib/billing/plan-entitlements";
import { parseContractDevelopmentScope } from "@/lib/billing/contract-development";
import { loadCustomContractAccount } from "@/lib/billing/custom-contract-admin";
export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(); if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get("organizationId");
  const client = createServiceClient();
  try {
    if (!id) {
      const result = await client.from("organization_custom_contracts").select("id,organization_id,version,name,monthly_price_brl,included_credits").order("version", { ascending: false });
      if (result.error) throw new Error("Não foi possível listar os contratos.");
      const latest = Array.from(new Map((result.data ?? []).toReversed().map(row => [row.organization_id, row])).values());
      const accounts = await Promise.all(latest.map(async contract => ({ contract, account: await loadCustomContractAccount(client, contract.organization_id) })));
      return NextResponse.json({ accounts });
    }
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Conta inválida." }, { status: 422 });
    const account = await loadCustomContractAccount(client, id);
    const { data, error } = await client.from("organization_custom_contracts").select("*").eq("organization_id", account.organizationId).order("version", { ascending: false }).limit(30);
    if (error) throw new Error("Não foi possível carregar os contratos.");
    return NextResponse.json({ contracts: data, account });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os contratos." }, { status: 503 });
  }
}
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(); if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const development_scope = parseContractDevelopmentScope(body.development_scope);
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length>120 || !["starter","pro","scale"].includes(body.base_plan_code)) throw new Error("Informe o nome e o plano de recursos.");
    const price = Number(body.monthly_price_brl), credits = Number(body.included_credits);
    if (!Number.isFinite(price) || price<=0 || price>1000000 || !Number.isFinite(credits) || credits<0 || credits>1e9) throw new Error("Valor e créditos inválidos.");
    const start = new Date(body.effective_at), end = new Date(body.first_period_end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end<=start || start.getTime()<Date.now()-86400000) throw new Error("Informe vigência atual ou futura e próximo vencimento posterior ao início.");
    const features: Record<string, boolean> = {};
    for (const [key,value] of Object.entries(body.features ?? {})) { if (!(key in planFeatureDefinitions) || typeof value!=="boolean") throw new Error("Recurso inválido."); features[key]=value; }
    const limits: Record<string, number> = {};
    for (const [key,value] of Object.entries(body.resource_limits ?? {})) { const n=Number(value); if (!["agent_limit","whatsapp_instance_limit","user_limit","organization_limit","storage_limit_bytes","storage_file_limit"].includes(key) || !Number.isSafeInteger(n) || n<0) throw new Error("Limite inválido."); limits[key]=n; }
    const { data, error } = await createServiceClient().rpc("save_custom_contract", { p_organization: body.organizationId, p_actor: auth.userId, p_terms: { name: body.name.trim(), base_plan_code: body.base_plan_code, monthly_price_brl: Math.round(price*100)/100, included_credits: credits, effective_at: start.toISOString(), first_period_end: end.toISOString(), features, resource_limits: limits, development_scope } });
    if (error) throw new Error("Não foi possível salvar as condições do contrato.");
    return NextResponse.json({ contract: data });
  } catch(error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Dados inválidos." }, { status:422 }); }
}

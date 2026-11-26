import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { loadMetaMessageWalletSummary } from "@/lib/meta/message-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Official WhatsApp BRL balance of the current company (separate from AI credits).
export async function GET() {
  try {
    const workspace = await getCurrentWorkspace();
    if (!workspace?.organization) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
    const client = createServiceClient();
    const [summary, credits] = await Promise.all([
      loadMetaMessageWalletSummary(client, workspace.organization.id),
      client.rpc("resolve_organization_contract_access", { p_organization: workspace.organization.id }),
    ]);
    const billingOrganization = credits.data?.billing_organization_id ?? workspace.organization.id;
    const aiWallet = await client.from("credit_wallets").select("balance_credits,reserved_credits").eq("organization_id", billingOrganization).maybeSingle();
    if (aiWallet.error) throw new Error("Não foi possível consultar os créditos de IA.");
    return NextResponse.json({ ...summary, aiCredits: aiWallet.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar o saldo." }, { status: 422 });
  }
}

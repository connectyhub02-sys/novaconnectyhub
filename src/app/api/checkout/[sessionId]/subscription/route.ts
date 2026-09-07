import { cancelStoreAgreement } from "@/lib/commerce/store-cancellation";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
type Context = { params: Promise<{ sessionId: string }> };
async function contract(context: Context) {
  const { sessionId } = await context.params,
    client = createServiceClient();
  const session = await client
    .from("sales_catalog_payment_sessions")
    .select("organization_id,order_id")
    .eq("id", sessionId)
    .single();
  if (session.error) throw new Error("Checkout não encontrado.");
  const period = await client
    .from("commercial_agreement_periods")
    .select("agreement_id")
    .eq("order_id", session.data.order_id)
    .maybeSingle();
  if (period.error || !period.data) return { client, agreement: null };
  const row = await client
    .from("commercial_agreements")
    .select(
      "id,organization_id,state,period_end,cancel_at_period_end,paid_cycles,metadata",
    )
    .eq("id", period.data.agreement_id)
    .eq("organization_id", session.data.organization_id)
    .eq("owner_type", "store")
    .single();
  if (row.error) throw new Error("Assinatura não encontrada.");
  return { client, agreement: row.data };
}
// Even a suspended seller cannot prevent a buyer cancelling future debits.
export async function GET(_request: NextRequest, context: Context) {
  try {
    const { agreement } = await contract(context);
    return NextResponse.json({
      subscription: agreement?.metadata?.recurring
        ? {
            id: agreement.id,
            state: agreement.state,
            periodEnd: agreement.period_end,
            cancelled: agreement.cancel_at_period_end,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao consultar." },
      { status: 404 },
    );
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const { client, agreement } = await contract(context),
      body = await request.json();
    if (!agreement || body.action !== "cancel")
      throw new Error("Assinatura não encontrada.");
    return NextResponse.json(
      await cancelStoreAgreement(
        client,
        agreement.organization_id,
        agreement.id,
      ),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao cancelar." },
      { status: 422 },
    );
  }
}

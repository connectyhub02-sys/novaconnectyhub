import { publicCommerceBlockResponse } from "@/lib/sales-catalog/public-commerce-access";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SessionRow = {
  id: string;
  organization_id: string;
  order_id: string;
  method: string | null;
  provider: string | null;
  status: string | null;
  provider_status: string | null;
  provider_status_detail: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  updated_at: string | null;
};

type OrderRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
  latest_payment_session_id: string | null;
  updated_at: string | null;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const client = createServiceClient();
  const { data: session } = await client
    .from("sales_catalog_payment_sessions")
    .select("id, organization_id, order_id, method, provider, status, provider_status, provider_status_detail, paid_at, failure_reason, updated_at")
    .eq("id", sessionId)
    .maybeSingle<SessionRow>();

  if (!session) {
    return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 404 });
  }

  const unavailable = await publicCommerceBlockResponse(session.organization_id, client);
  if (unavailable) return unavailable;

  const { data: order } = await client
    .from("sales_catalog_orders")
    .select("id, status, payment_status, fulfillment_status, latest_payment_session_id, updated_at")
    .eq("id", session.order_id)
    .eq("organization_id", session.organization_id)
    .maybeSingle<OrderRow>();

  const { data: latest } = order?.latest_payment_session_id && order.latest_payment_session_id !== session.id
    ? await client.from("sales_catalog_payment_sessions").select("id, organization_id, order_id, method, provider, status, provider_status, provider_status_detail, paid_at, failure_reason, updated_at")
      .eq("id", order.latest_payment_session_id).eq("organization_id", session.organization_id).eq("order_id", session.order_id).maybeSingle<SessionRow>()
    : { data: null };
  const effective = latest ?? session;

  return NextResponse.json({
    session: {
      id: effective.id,
      method: effective.method,
      provider: effective.provider,
      status: order?.payment_status === "confirmed" ? "approved" : order?.payment_status === "refunded" ? "refunded" : effective.status,
      providerStatus: effective.provider_status,
      providerStatusDetail: effective.provider_status_detail,
      paidAt: effective.paid_at,
      failureReason: effective.failure_reason,
      updatedAt: effective.updated_at,
    },
    order: order ? {
      id: order.id,
      status: order.status,
      paymentStatus: order.payment_status,
      fulfillmentStatus: order.fulfillment_status,
      latestPaymentSessionId: order.latest_payment_session_id,
      updatedAt: order.updated_at,
    } : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SessionRow = {
  id: string;
  organization_id: string;
  order_id: string;
  method: string | null;
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
    .select("id, organization_id, order_id, method, status, provider_status, provider_status_detail, paid_at, failure_reason, updated_at")
    .eq("id", sessionId)
    .maybeSingle<SessionRow>();

  if (!session) {
    return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 404 });
  }

  const { data: order } = await client
    .from("sales_catalog_orders")
    .select("id, status, payment_status, fulfillment_status, latest_payment_session_id, updated_at")
    .eq("id", session.order_id)
    .eq("organization_id", session.organization_id)
    .maybeSingle<OrderRow>();

  return NextResponse.json({
    session: {
      id: session.id,
      method: session.method,
      status: session.status,
      providerStatus: session.provider_status,
      providerStatusDetail: session.provider_status_detail,
      paidAt: session.paid_at,
      failureReason: session.failure_reason,
      updatedAt: session.updated_at,
    },
    order: order ? {
      id: order.id,
      status: order.status,
      paymentStatus: order.payment_status,
      fulfillmentStatus: order.fulfillment_status,
      latestPaymentSessionId: order.latest_payment_session_id,
      updatedAt: order.updated_at,
    } : null,
  });
}

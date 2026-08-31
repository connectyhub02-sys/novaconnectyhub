import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { applySalesCatalogCheckoutOrderBumps } from "@/lib/sales-catalog/checkout-order-bumps";
import { requiresSalesCatalogShippingBeforePayment } from "@/lib/sales-catalog/checkout-guards";
import { createSalesCatalogPixPaymentSession } from "@/lib/sales-catalog/payment-sessions";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type PaymentSessionRow = {
  id: string;
  organization_id: string;
  order_id: string;
  status: string | null;
  payer_email: string | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const body = readRecord(await request.json().catch(() => null));
  const selectedOrderBumpIds = readStringList(body.selectedOrderBumpIds);

  if (selectedOrderBumpIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos uma oferta para atualizar o Pix." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data: sourceSession, error: sessionError } = await client
    .from("sales_catalog_payment_sessions")
    .select("id, organization_id, order_id, status, payer_email")
    .eq("id", sessionId)
    .maybeSingle<PaymentSessionRow>();

  if (sessionError || !sourceSession) {
    return NextResponse.json({ error: "Sessao de pagamento nao encontrada." }, { status: 404 });
  }

  if (sourceSession.status === "approved" || sourceSession.status === "refunded") {
    return NextResponse.json({ error: "Este pagamento ja foi finalizado." }, { status: 400 });
  }

  try {
    const orderBumpApplication = await applySalesCatalogCheckoutOrderBumps({
      client,
      organizationId: sourceSession.organization_id,
      orderId: sourceSession.order_id,
      selectedProductIds: selectedOrderBumpIds,
    });

    if (requiresSalesCatalogShippingBeforePayment(orderBumpApplication.order, orderBumpApplication.items)) {
      return NextResponse.json({
        error: "Confirme frete, retirada ou entrega antes de atualizar o Pix deste pedido.",
      }, { status: 400 });
    }

    if (!orderBumpApplication.totalAmount) {
      return NextResponse.json({ error: "Nao foi possivel calcular o novo total do pedido." }, { status: 400 });
    }

    const result = await createSalesCatalogPixPaymentSession({
      client,
      organizationId: sourceSession.organization_id,
      orderId: sourceSession.order_id,
      amount: orderBumpApplication.totalAmount,
      payerEmail: sourceSession.payer_email,
      source: "checkout",
      actorId: null,
    });

    await client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: sourceSession.organization_id,
      source_type: "sales_catalog_payment_session",
      source_id: result.session.id,
      event_type: "sales_catalog.checkout_order_bump_pix_created",
      title: "Pix atualizado com Order Bump",
      summary: `Checkout ${sourceSession.id.slice(0, 8)} atualizado com ${orderBumpApplication.appliedBumps.length} oferta(s).`,
      confidence: 1,
      visibility: "organization",
      tags: ["sales_catalog", "payment", result.session.provider === "pagbank" ? "pagbank" : "mercado_pago", "pix", "order_bump"],
      payload: {
        source_payment_session_id: sourceSession.id,
        new_payment_session_id: result.session.id,
        payment_gateway: result.session.provider,
        order_id: sourceSession.order_id,
        selected_order_bump_product_ids: selectedOrderBumpIds,
        applied_order_bump_product_ids: orderBumpApplication.appliedBumps.map((item) => item.productId),
        added_order_bump_product_ids: orderBumpApplication.addedBumps.map((item) => item.productId),
        amount: orderBumpApplication.totalAmount,
      },
    });

    revalidatePath(`/checkout/${sourceSession.id}`);
    revalidatePath(`/checkout/${result.session.id}`);

    return NextResponse.json({
      ok: true,
      sessionId: result.session.id,
      checkoutUrl: result.checkoutUrl,
      trackingUrl: result.trackingUrl,
      amount: orderBumpApplication.totalAmount,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel atualizar o Pix.",
    }, { status: 400 });
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

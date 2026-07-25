import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type BillingPlanIntentRow = {
  id: string;
  plan_code: string;
  name: string;
  monthly_price_brl: number | string | null;
  included_credits: number | string | null;
  mercado_pago_preapproval_plan_id: string | null;
};

const allowedPlanCodes = new Set(["starter", "pro", "scale"]);

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  if (!workspace.organization) {
    return NextResponse.json({ error: "Empresa obrigatoria." }, { status: 422 });
  }

  const body = readRecord(await request.json().catch(() => null));
  const planCode = readPlanCode(body.planCode);

  if (!planCode) {
    return NextResponse.json({ error: "Escolha um plano pago valido." }, { status: 422 });
  }

  const client = createServiceClient();

  try {
    const { data: plan, error: planError } = await client
      .from("billing_plans")
      .select("id, plan_code, name, monthly_price_brl, included_credits, mercado_pago_preapproval_plan_id")
      .eq("plan_code", planCode)
      .in("status", ["active", "draft"])
      .maybeSingle<BillingPlanIntentRow>();

    if (planError) {
      throw new Error(`Nao foi possivel carregar o plano: ${planError.message}`);
    }

    if (!plan) {
      return NextResponse.json({ error: "Plano nao encontrado ou indisponivel." }, { status: 404 });
    }

    const amountBrl = toNumber(plan.monthly_price_brl);
    const now = new Date();
    const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const intentMetadata = {
      source: "dashboard_plan_intent",
      requested_plan_code: plan.plan_code,
      current_plan_code: workspace.organization.planCode,
      organization_status: workspace.organization.status,
      actor_id: workspace.user.id,
      checkout_status: "pending_provider_checkout",
    };

    const { data: invoice, error: invoiceError } = await client
      .from("billing_invoices")
      .insert({
        organization_id: workspace.organization.id,
        status: "open",
        currency: "BRL",
        subtotal_brl: amountBrl,
        discount_brl: 0,
        total_brl: amountBrl,
        due_at: dueAt,
        provider: "mercado_pago",
        metadata: intentMetadata,
      })
      .select("id")
      .single<{ id: string }>();

    if (invoiceError || !invoice) {
      throw new Error(invoiceError?.message ?? "Nao foi possivel registrar a fatura do plano.");
    }

    const { error: itemError } = await client.from("billing_invoice_items").insert({
      invoice_id: invoice.id,
      organization_id: workspace.organization.id,
      item_type: "plan",
      description: `Plano ${plan.name}`,
      quantity: 1,
      unit_price_brl: amountBrl,
      total_brl: amountBrl,
      credit_amount: toNumber(plan.included_credits),
      metadata: intentMetadata,
    });

    if (itemError) {
      throw new Error(`Fatura criada, mas o item do plano falhou: ${itemError.message}`);
    }

    const { data: payment, error: paymentError } = await client
      .from("billing_payments")
      .insert({
        organization_id: workspace.organization.id,
        invoice_id: invoice.id,
        provider: "mercado_pago",
        status: "pending",
        amount_brl: amountBrl,
        payload: intentMetadata,
      })
      .select("id")
      .single<{ id: string }>();

    if (paymentError || !payment) {
      throw new Error(paymentError?.message ?? "Nao foi possivel registrar o pagamento pendente.");
    }

    await client.from("maintenance_audit_logs").insert({
      event_type: "billing.plan_intent.created",
      target_table: "billing_payments",
      target_id: payment.id,
      metadata: {
        ...intentMetadata,
        invoice_id: invoice.id,
        payment_id: payment.id,
        amount_brl: amountBrl,
      },
    });

    return NextResponse.json({
      ok: true,
      invoiceId: invoice.id,
      paymentId: payment.id,
      planCode: plan.plan_code,
      checkoutUrl: null,
      message: "Solicitacao recebida. Vamos finalizar a ativacao deste plano pelo painel.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel solicitar o plano." },
      { status: 500 },
    );
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readPlanCode(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return allowedPlanCodes.has(normalized) ? normalized : null;
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

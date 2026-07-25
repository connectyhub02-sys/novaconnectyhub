import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import {
  buildDashboardBillingCheckoutPath,
  buildDashboardBillingCheckoutUrl,
  buildPlatformBillingExternalReference,
} from "@/lib/billing/plan-checkout";
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

type ExistingSubscriptionRow = {
  id: string;
  plan_code: string;
  status: string;
  provider_subscription_id: string | null;
  metadata: JsonRecord | null;
  created_at: string;
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
    const payerEmail = workspace.profile.email ?? workspace.user.email ?? null;

    if (!payerEmail) {
      return NextResponse.json({ error: "Informe um e-mail no cadastro para criar a assinatura." }, { status: 422 });
    }

    if (amountBrl <= 0) {
      return NextResponse.json({ error: "Este plano ainda nao tem valor mensal configurado." }, { status: 422 });
    }

    const existingSubscription = await loadBlockingSubscription(client, workspace.organization.id);

    if (existingSubscription) {
      if (isPendingSubscription(existingSubscription.status)) {
        if (existingSubscription.plan_code === plan.plan_code) {
          return NextResponse.json({
            ok: true,
            subscriptionId: existingSubscription.id,
            planCode: existingSubscription.plan_code,
            checkoutUrl: buildDashboardBillingCheckoutPath(existingSubscription.id),
            message: "Ja existe um checkout deste plano em aberto. Vamos te levar para concluir pelo painel.",
          });
        }

        return NextResponse.json(
          {
            error: "Ja existe uma solicitacao de plano em andamento. Conclua ou aguarde a confirmacao antes de trocar de plano.",
          },
          { status: 409 },
        );
      }

      if (existingSubscription.status === "active" && existingSubscription.plan_code === plan.plan_code) {
        return NextResponse.json({
          ok: true,
          subscriptionId: existingSubscription.id,
          planCode: existingSubscription.plan_code,
          checkoutUrl: null,
          message: "Este plano ja esta ativo nesta empresa.",
        });
      }

      return NextResponse.json(
        {
          error: "Mudanca de plano com assinatura ativa sera liberada na proxima etapa, sem sair do painel.",
        },
        { status: 409 },
      );
    }

    const now = new Date();
    const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const subscriptionId = randomUUID();
    const invoiceId = randomUUID();
    const paymentId = randomUUID();
    const externalReference = buildPlatformBillingExternalReference({
      organizationId: workspace.organization.id,
      subscriptionId,
      invoiceId,
      paymentId,
    });
    const checkoutPath = buildDashboardBillingCheckoutPath(subscriptionId);
    const checkoutUrl = buildDashboardBillingCheckoutUrl(subscriptionId);
    const intentMetadata = {
      source: "dashboard_plan_intent",
      checkout_model: "connectyhub_plan_checkout",
      requested_plan_code: plan.plan_code,
      current_plan_code: workspace.organization.planCode,
      organization_status: workspace.organization.status,
      actor_id: workspace.user.id,
      subscription_id: subscriptionId,
      invoice_id: invoiceId,
      payment_id: paymentId,
      external_reference: externalReference,
      checkout_status: "internal_checkout_created",
      checkout_url: checkoutPath,
      checkout_public_url: checkoutUrl,
    };

    const { error: subscriptionError } = await client
      .from("organization_subscriptions")
      .insert({
        id: subscriptionId,
        organization_id: workspace.organization.id,
        plan_id: plan.id,
        plan_code: plan.plan_code,
        status: "pending",
        billing_provider: "mercado_pago",
        provider_plan_id: null,
        payer_email: payerEmail,
        included_credits_granted: 0,
        metadata: intentMetadata,
      });

    if (subscriptionError) {
      throw new Error(`Nao foi possivel registrar a assinatura pendente: ${subscriptionError.message}`);
    }

    const { error: invoiceError } = await client
      .from("billing_invoices")
      .insert({
        id: invoiceId,
        organization_id: workspace.organization.id,
        subscription_id: subscriptionId,
        status: "open",
        currency: "BRL",
        subtotal_brl: amountBrl,
        discount_brl: 0,
        total_brl: amountBrl,
        due_at: dueAt,
        provider: "mercado_pago",
        metadata: intentMetadata,
      });

    if (invoiceError) {
      throw new Error(invoiceError?.message ?? "Nao foi possivel registrar a fatura do plano.");
    }

    const { error: itemError } = await client.from("billing_invoice_items").insert({
      invoice_id: invoiceId,
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

    const { error: paymentError } = await client
      .from("billing_payments")
      .insert({
        id: paymentId,
        organization_id: workspace.organization.id,
        invoice_id: invoiceId,
        subscription_id: subscriptionId,
        provider: "mercado_pago",
        status: "pending",
        amount_brl: amountBrl,
        payload: intentMetadata,
      });

    if (paymentError) {
      throw new Error(paymentError?.message ?? "Nao foi possivel registrar o pagamento pendente.");
    }

    await client.from("maintenance_audit_logs").insert({
      event_type: "billing.plan_checkout.created",
      target_table: "billing_payments",
      target_id: paymentId,
      metadata: {
        ...intentMetadata,
        amount_brl: amountBrl,
      },
    });

    return NextResponse.json({
      ok: true,
      subscriptionId,
      invoiceId,
      paymentId,
      planCode: plan.plan_code,
      checkoutUrl: checkoutPath,
      message: "Checkout criado. Conclua o pagamento sem sair do painel.",
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

async function loadBlockingSubscription(client: ReturnType<typeof createServiceClient>, organizationId: string) {
  const { data, error } = await client
    .from("organization_subscriptions")
    .select("id, plan_code, status, provider_subscription_id, metadata, created_at")
    .eq("organization_id", organizationId)
    .in("status", ["pending", "active", "past_due", "incomplete"])
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<ExistingSubscriptionRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel validar assinaturas existentes: ${error.message}`);
  }

  return data?.[0] ?? null;
}

function isPendingSubscription(status: string) {
  return status === "pending" || status === "incomplete";
}

import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import {
  assertAccountComplete,
  formatAccountCompletionError,
  statusForAccountCompletionError,
} from "@/lib/account/signup-completion";
import {
  isBillingCheckoutPayable,
  loadBillingCheckoutBumps,
  loadBillingCheckoutIntent,
  normalizeBillingCheckoutBumpCodesForCatalog,
  syncBillingCheckoutCart,
} from "@/lib/billing/plan-checkout";
import { sendPlatformPlanInteractionNotification } from "@/lib/billing/platform-billing-webhook";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  const { subscriptionId } = await context.params;
  const workspace = await getCurrentWorkspace();

  if (!workspace?.organization) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const client = createServiceClient();

  try {
    await assertAccountComplete({ userId: workspace.user.id, client });
  } catch (error) {
    return NextResponse.json(formatAccountCompletionError(error), {
      status: statusForAccountCompletionError(error, 422),
    });
  }

  const body = readRecord(await request.json().catch(() => null));
  const availableBumps = await loadBillingCheckoutBumps(client);
  const selectedBumpCodes = normalizeBillingCheckoutBumpCodesForCatalog(body.selectedBumpCodes, availableBumps);
  const intent = await loadBillingCheckoutIntent(client, {
    organizationId: workspace.organization.id,
    subscriptionId,
  });

  if (!intent) {
    return NextResponse.json({ error: "Checkout de plano nao encontrado." }, { status: 404 });
  }

  if (!isBillingCheckoutPayable(intent)) {
    return NextResponse.json({ error: "Este checkout nao esta aberto para atualizar carrinho." }, { status: 409 });
  }

  try {
    const cart = await syncBillingCheckoutCart(client, intent, selectedBumpCodes, availableBumps);
    const notification = await notifyCartUpdatedSafely(client, {
      organizationId: workspace.organization.id,
      actorId: workspace.user.id,
      subscriptionId: intent.subscription.id,
      invoiceId: intent.invoice.id,
      paymentId: intent.payment.id,
      planCode: intent.plan.plan_code,
      planName: intent.plan.name,
      amountBrl: cart.totalAmount,
      includedCredits: toNumber(intent.plan.included_credits),
      checkoutPath: cart.checkoutPath,
      checkoutUrl: cart.checkoutUrl,
      selectedBumpCodes: cart.selectedBumps.map((bump) => bump.code),
      selectedBumpTitles: cart.selectedBumps.map((bump) => bump.title),
    });

    return NextResponse.json({
      ok: true,
      totalAmount: cart.totalAmount,
      bumpsAmount: cart.bumpsAmount,
      selectedBumpCodes: cart.selectedBumps.map((bump) => bump.code),
      notificationStatus: notification.status,
      notificationError: notification.errorMessage,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel atualizar o carrinho.",
    }, { status: 400 });
  }
}

async function notifyCartUpdatedSafely(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    actorId: string;
    subscriptionId: string;
    invoiceId: string;
    paymentId: string;
    planCode: string;
    planName: string;
    amountBrl: number;
    includedCredits: number;
    checkoutPath: string;
    checkoutUrl: string;
    selectedBumpCodes: string[];
    selectedBumpTitles: string[];
  },
) {
  try {
    const cartHash = createHash("sha1")
      .update(input.selectedBumpCodes.join("|") || "empty")
      .digest("hex")
      .slice(0, 16);

    return await sendPlatformPlanInteractionNotification(client, {
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      planCode: input.planCode,
      planName: input.planName,
      amountBrl: input.amountBrl,
      includedCredits: input.includedCredits,
      eventType: "checkout_cart_updated",
      dedupeKey: `billing:${input.subscriptionId}:cart:${cartHash}`,
      providerStatus: "cart_updated",
      metadata: {
        source: "dashboard_plan_checkout_cart_updated",
        actor_id: input.actorId,
        checkout_url: input.checkoutPath,
        checkout_public_url: input.checkoutUrl,
        selected_bump_codes: input.selectedBumpCodes,
        selected_bump_titles: input.selectedBumpTitles,
        selected_bump_count: input.selectedBumpCodes.length,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha ao disparar automacao de carrinho.";

    await client.from("maintenance_audit_logs").insert({
      event_type: "billing.plan_checkout.cart_notification_failed",
      target_table: "organization_subscriptions",
      target_id: input.subscriptionId,
      metadata: {
        source: "dashboard_plan_checkout_cart_updated",
        actor_id: input.actorId,
        organization_id: input.organizationId,
        plan_code: input.planCode,
        selected_bump_codes: input.selectedBumpCodes,
        error: errorMessage,
      },
    });

    return {
      notificationId: null,
      status: "failed",
      selectedAgentId: null,
      recipientPhone: null,
      messagePreview: null,
      errorMessage,
    };
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

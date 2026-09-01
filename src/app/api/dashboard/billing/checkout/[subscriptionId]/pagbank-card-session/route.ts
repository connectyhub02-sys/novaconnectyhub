import { NextResponse, type NextRequest } from "next/server";
import {
  assertAccountComplete,
  formatAccountCompletionError,
  statusForAccountCompletionError,
} from "@/lib/account/signup-completion";
import {
  createPagBankThreeDSSession,
  ensurePagBankCardPublicKey,
  loadPagBankPlatformBillingConfig,
} from "@/lib/sales-catalog/pagbank";
import {
  isBillingCheckoutPayable,
  loadBillingCheckoutIntent,
  resolveBillingCheckoutProvider,
} from "@/lib/billing/plan-checkout";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
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

  const intent = await loadBillingCheckoutIntent(client, {
    organizationId: workspace.organization.id,
    subscriptionId,
  });

  if (!intent) {
    return NextResponse.json({ error: "Checkout de plano nao encontrado." }, { status: 404 });
  }

  if (!isBillingCheckoutPayable(intent)) {
    return NextResponse.json({ error: "Este checkout nao esta aberto para pagamento." }, { status: 409 });
  }

  if (resolveBillingCheckoutProvider(intent) !== "pagbank") {
    return NextResponse.json({ error: "Este checkout nao usa PagBank." }, { status: 409 });
  }

  try {
    const config = await loadPagBankPlatformBillingConfig({ client });
    const [{ publicKey, source }, threeDSSession] = await Promise.all([
      ensurePagBankCardPublicKey({
        accessToken: config.accessToken,
        mode: config.mode,
        apiBaseUrl: config.apiBaseUrl,
        configuredPublicKey: config.publicKey,
      }),
      createPagBankThreeDSSession({
        accessToken: config.accessToken,
        sessionUrl: config.threeDSSessionUrl,
      }),
    ]);

    await client.from("maintenance_audit_logs").insert({
      actor_id: workspace.user.id,
      event_type: "pagbank.billing.card_session.created",
      target_table: "organization_subscriptions",
      target_id: intent.subscription.id,
      metadata: {
        organization_id: workspace.organization.id,
        subscription_id: intent.subscription.id,
        payment_id: intent.payment.id,
        public_key_source: source,
        sdk_environment: config.sdkEnvironment,
      },
    });

    return NextResponse.json({
      ok: true,
      provider: "pagbank",
      publicKey,
      threeDSSession,
      sdkEnvironment: config.sdkEnvironment,
      mode: config.mode,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel preparar o cartao PagBank.",
    }, { status: 400 });
  }
}

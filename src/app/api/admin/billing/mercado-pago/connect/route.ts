import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildMercadoPagoPlatformBillingAuthorizationUrl,
  buildMercadoPagoPlatformBillingRedirectUrl,
  buildMercadoPagoPlatformBillingWebhookUrl,
  getAppBaseUrl,
} from "@/lib/sales-catalog/mercado-pago";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function GET() {
  const baseUrl = getAppBaseUrl();
  const returnUrl = new URL("/admin/financeiro", baseUrl);
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", "/admin/financeiro");
    return NextResponse.redirect(loginUrl);
  }

  const client = createServiceClient();
  const state = `mpb_${randomUUID()}`;
  const now = new Date().toISOString();

  try {
    const authorizationUrl = await buildMercadoPagoPlatformBillingAuthorizationUrl({ state, client });
    const metadata = await loadPlatformBillingMetadata(client);

    await client
      .from("platform_billing_settings")
      .upsert(
        {
          setting_key: "default",
          updated_by: auth.userId,
          metadata: {
            ...metadata,
            mercado_pago_billing_oauth_state: state,
            mercado_pago_billing_oauth_requested_by: auth.userId,
            mercado_pago_billing_oauth_requested_at: now,
            mercado_pago_billing_redirect_url: buildMercadoPagoPlatformBillingRedirectUrl(),
            mercado_pago_billing_webhook_url: buildMercadoPagoPlatformBillingWebhookUrl(),
          },
        },
        { onConflict: "setting_key" },
      );

    await client.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: "billing.mercado_pago.oauth.started",
      target_table: "platform_billing_settings",
      target_id: null,
      metadata: {
        redirectUrl: buildMercadoPagoPlatformBillingRedirectUrl(),
        webhookUrl: buildMercadoPagoPlatformBillingWebhookUrl(),
      },
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    await client.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: "billing.mercado_pago.oauth.start_failed",
      target_table: "platform_billing_settings",
      target_id: null,
      metadata: {
        error: error instanceof Error ? error.message : "Falha ao iniciar OAuth Mercado Pago billing.",
      },
    });

    returnUrl.searchParams.set("billing_oauth", "error");
    returnUrl.searchParams.set("reason", "start_failed");
    return NextResponse.redirect(returnUrl);
  }
}

async function loadPlatformBillingMetadata(client: ReturnType<typeof createServiceClient>) {
  const { data } = await client
    .from("platform_billing_settings")
    .select("metadata")
    .eq("setting_key", "default")
    .maybeSingle<{ metadata: JsonRecord | null }>();

  return data?.metadata ?? {};
}

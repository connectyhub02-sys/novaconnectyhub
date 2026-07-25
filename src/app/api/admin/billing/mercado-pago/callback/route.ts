import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildMercadoPagoPlatformBillingWebhookUrl,
  exchangeMercadoPagoPlatformBillingAuthorizationCode,
  formatMercadoPagoOAuthError,
  getAppBaseUrl,
  isMercadoPagoInvalidClientError,
  saveMercadoPagoPlatformBillingOAuthTokens,
  serializeMercadoPagoOAuthTokens,
} from "@/lib/sales-catalog/mercado-pago";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function GET(request: NextRequest) {
  const baseUrl = getAppBaseUrl();
  const returnUrl = new URL("/admin/financeiro", baseUrl);
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", "/admin/financeiro");
    return NextResponse.redirect(loginUrl);
  }

  const code = request.nextUrl.searchParams.get("code")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();

  if (!code || !state) {
    return redirectWithError(returnUrl, "missing_code");
  }

  const client = createServiceClient();
  const settings = await loadPlatformBillingSettings(client);
  const expectedState = readString(settings.metadata?.mercado_pago_billing_oauth_state);

  if (!expectedState || expectedState !== state) {
    await client.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: "billing.mercado_pago.oauth.invalid_state",
      target_table: "platform_billing_settings",
      target_id: settings.id,
      metadata: {
        hasExpectedState: Boolean(expectedState),
      },
    });

    return redirectWithError(returnUrl, "invalid_state");
  }

  try {
    const tokens = await exchangeMercadoPagoPlatformBillingAuthorizationCode({ code, client });
    const connection = await saveMercadoPagoPlatformBillingOAuthTokens({
      client,
      tokens,
      configuredBy: auth.userId,
      source: "billing_oauth_callback",
    });
    const now = new Date().toISOString();

    await client
      .from("platform_billing_settings")
      .update({
        updated_by: auth.userId,
        metadata: {
          ...readRecord(settings.metadata),
          ...serializeMercadoPagoOAuthTokens(tokens),
          mercado_pago_billing_oauth_state: null,
          mercado_pago_billing_connected_by: auth.userId,
          mercado_pago_billing_connected_at: now,
          mercado_pago_billing_account_id: connection.accountId,
          mercado_pago_billing_mode: connection.mode,
          mercado_pago_billing_token_expires_at: connection.tokenExpiresAt,
          mercado_pago_billing_webhook_url: buildMercadoPagoPlatformBillingWebhookUrl(),
          mercado_pago_billing_last_error: null,
        },
      })
      .eq("setting_key", "default");

    await client.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: "billing.mercado_pago.oauth.connected",
      target_table: "platform_billing_settings",
      target_id: settings.id,
      metadata: {
        accountId: connection.accountId,
        mode: connection.mode,
        tokenExpiresAt: connection.tokenExpiresAt,
        savedCredentialCount: connection.savedIds.length,
        webhookUrl: buildMercadoPagoPlatformBillingWebhookUrl(),
      },
    });

    revalidatePath("/admin/financeiro");
    revalidatePath("/admin/maintenance");

    returnUrl.searchParams.set("billing_oauth", "connected");
    return NextResponse.redirect(returnUrl);
  } catch (error) {
    await client
      .from("platform_billing_settings")
      .update({
        updated_by: auth.userId,
        metadata: {
          ...readRecord(settings.metadata),
          mercado_pago_billing_oauth_state: null,
          mercado_pago_billing_last_error: formatMercadoPagoOAuthError(error),
          mercado_pago_billing_error_at: new Date().toISOString(),
        },
      })
      .eq("setting_key", "default");

    await client.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: "billing.mercado_pago.oauth.failed",
      target_table: "platform_billing_settings",
      target_id: settings.id,
      metadata: {
        error: formatMercadoPagoOAuthError(error),
      },
    });

    return redirectWithError(returnUrl, isMercadoPagoInvalidClientError(error) ? "invalid_oauth_credentials" : "token_exchange");
  }
}

async function loadPlatformBillingSettings(client: ReturnType<typeof createServiceClient>) {
  const { data, error } = await client
    .from("platform_billing_settings")
    .select("id, metadata")
    .eq("setting_key", "default")
    .maybeSingle<{ id: string | null; metadata: JsonRecord | null }>();

  if (error) {
    throw new Error(`Nao foi possivel carregar configuracao de billing: ${error.message}`);
  }

  return {
    id: data?.id ?? null,
    metadata: data?.metadata ?? {},
  };
}

function redirectWithError(returnUrl: URL, reason: string) {
  returnUrl.searchParams.set("billing_oauth", "error");
  returnUrl.searchParams.set("reason", reason);
  return NextResponse.redirect(returnUrl);
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

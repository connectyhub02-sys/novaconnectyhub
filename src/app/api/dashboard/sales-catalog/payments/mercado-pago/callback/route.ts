import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { encryptCredentialValue } from "@/lib/security/credentials-crypto";
import {
  buildMercadoPagoWebhookUrl,
  calculateMercadoPagoTokenExpiration,
  exchangeMercadoPagoAuthorizationCode,
  getAppBaseUrl,
  serializeMercadoPagoOAuthTokens,
} from "@/lib/sales-catalog/mercado-pago";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type IntegrationRow = {
  id: string;
  organization_id: string;
  metadata: JsonRecord | null;
};

export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();
  const baseUrl = getAppBaseUrl();
  let returnUrl = new URL("/dashboard/links", baseUrl);

  if (!workspace) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", "/dashboard/links");
    return NextResponse.redirect(loginUrl);
  }

  const code = request.nextUrl.searchParams.get("code")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();

  if (!code || !state) {
    returnUrl.searchParams.set("payment", "mercado_pago_error");
    returnUrl.searchParams.set("reason", "missing_code");
    return NextResponse.redirect(returnUrl);
  }

  const client = createServiceClient();
  const { data: integration, error: integrationError } = await client
    .from("sales_catalog_payment_integrations")
    .select("id, organization_id, metadata")
    .eq("provider", "mercado_pago")
    .contains("metadata", { oauth_state: state })
    .maybeSingle<IntegrationRow>();

  if (integrationError || !integration) {
    returnUrl.searchParams.set("payment", "mercado_pago_error");
    returnUrl.searchParams.set("reason", "invalid_state");
    return NextResponse.redirect(returnUrl);
  }

  returnUrl = buildMercadoPagoReturnUrl(baseUrl, integration.metadata);

  try {
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId: integration.organization_id,
      client,
    });
    const tokens = await exchangeMercadoPagoAuthorizationCode({ code, client });
    const now = new Date().toISOString();

    await client
      .from("sales_catalog_payment_integrations")
      .update({
        status: "connected",
        mode: tokens.live_mode === false ? "sandbox" : "production",
        provider_account_id: tokens.user_id ? String(tokens.user_id) : null,
        account_label: company.name,
        public_key: tokens.public_key ?? null,
        access_token_encrypted: encryptCredentialValue(tokens.access_token!),
        refresh_token_encrypted: tokens.refresh_token ? encryptCredentialValue(tokens.refresh_token) : null,
        token_scope: tokens.scope ?? null,
        token_expires_at: calculateMercadoPagoTokenExpiration(tokens.expires_in),
        connected_at: now,
        last_error: null,
        webhook_url: buildMercadoPagoWebhookUrl(),
        metadata: {
          ...readRecord(integration.metadata),
          ...serializeMercadoPagoOAuthTokens(tokens),
          oauth_state: null,
          connected_by: workspace.user.id,
          connected_at: now,
        },
        updated_at: now,
      })
      .eq("id", integration.id)
      .eq("organization_id", company.id);

    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/integracoes");
    revalidatePath("/dashboard/whatsapp");

    returnUrl.searchParams.set("payment", "mercado_pago_connected");
    return NextResponse.redirect(returnUrl);
  } catch (error) {
    await client
      .from("sales_catalog_payment_integrations")
      .update({
        status: "error",
        last_error: error instanceof Error ? error.message : "Falha ao conectar Mercado Pago.",
      })
      .eq("id", integration.id)
      .eq("organization_id", integration.organization_id);

    returnUrl.searchParams.set("payment", "mercado_pago_error");
    returnUrl.searchParams.set("reason", "token_exchange");
    return NextResponse.redirect(returnUrl);
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function buildMercadoPagoReturnUrl(baseUrl: string, metadata: JsonRecord | null) {
  const record = readRecord(metadata);
  const path = record.oauth_return_to === "integrations" ? "/dashboard/integracoes" : "/dashboard/links";

  return new URL(path, baseUrl);
}

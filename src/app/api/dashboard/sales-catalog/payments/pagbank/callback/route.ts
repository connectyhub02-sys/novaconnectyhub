import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { resolveDashboardCompanyId } from "@/lib/client-os/dashboard-route-scope";
import { encryptCredentialValue } from "@/lib/security/credentials-crypto";
import {
  buildPagBankScopeReconnectMessage,
  buildPagBankWebhookUrl,
  calculatePagBankTokenExpiration,
  exchangePagBankAuthorizationCode,
  formatPagBankOAuthError,
  getPagBankRequestedSellerScopes,
  isPagBankInvalidClientError,
  listMissingPagBankRequestedScopes,
  listMissingPagBankRuntimeScopes,
  readPagBankProviderAccountId,
  serializePagBankOAuthTokens,
} from "@/lib/sales-catalog/pagbank";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type IntegrationRow = {
  id: string;
  organization_id: string;
  mode: string | null;
  metadata: JsonRecord | null;
};

export async function GET(request: NextRequest) {
  const baseUrl = getAppBaseUrl();
  let returnUrl = new URL("/dashboard/links", baseUrl);
  const code = request.nextUrl.searchParams.get("code")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", "/dashboard/links");
    return NextResponse.redirect(loginUrl);
  }

  if (!code || !state) {
    returnUrl.searchParams.set("payment", "pagbank_error");
    returnUrl.searchParams.set("reason", "missing_code");
    return NextResponse.redirect(returnUrl);
  }

  const client = createServiceClient();
  const { data: integration, error: integrationError } = await client
    .from("sales_catalog_payment_integrations")
    .select("id, organization_id, mode, metadata")
    .eq("provider", "pagbank")
    .contains("metadata", { oauth_state: state })
    .maybeSingle<IntegrationRow>();

  if (integrationError || !integration) {
    returnUrl.searchParams.set("payment", "pagbank_error");
    returnUrl.searchParams.set("reason", "invalid_state");
    return NextResponse.redirect(returnUrl);
  }

  returnUrl = buildPagBankReturnUrl(baseUrl, integration.metadata);

  try {
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId: integration.organization_id,
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    await assertBillableAccess({ organizationId: company.id, client });

    const tokens = await exchangePagBankAuthorizationCode({ code, client });
    const now = new Date().toISOString();
    const providerAccountId = readPagBankProviderAccountId(tokens);
    const requestedScopes = getPagBankRequestedSellerScopes();
    const missingRequestedScopes = listMissingPagBankRequestedScopes(tokens.scope);
    const missingRuntimeScopes = listMissingPagBankRuntimeScopes(tokens.scope);
    const scopeWarning = missingRequestedScopes.length > 0
      ? buildPagBankScopeReconnectMessage(missingRequestedScopes)
      : null;
    const scopeError = missingRuntimeScopes.length > 0
      ? buildPagBankScopeReconnectMessage(missingRuntimeScopes)
      : null;

    await client
      .from("sales_catalog_payment_integrations")
      .update({
        status: "connected",
        mode: integration.mode === "sandbox" ? "sandbox" : "production",
        provider_account_id: providerAccountId,
        account_label: providerAccountId ? `PagBank ${providerAccountId}` : company.name,
        public_key: null,
        access_token_encrypted: encryptCredentialValue(tokens.access_token!),
        refresh_token_encrypted: tokens.refresh_token ? encryptCredentialValue(tokens.refresh_token) : null,
        token_scope: tokens.scope ?? null,
        token_expires_at: calculatePagBankTokenExpiration(tokens.expires_in),
        connected_at: now,
        last_error: scopeError,
        webhook_url: buildPagBankWebhookUrl(),
        metadata: {
          ...readRecord(integration.metadata),
          ...serializePagBankOAuthTokens(tokens),
          requested_scopes: requestedScopes,
          missing_requested_scopes: missingRequestedScopes,
          missing_runtime_scopes: missingRuntimeScopes,
          scope_warning: scopeWarning,
          scope_error: scopeError,
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

    returnUrl.searchParams.set("payment", "pagbank_connected");
    return NextResponse.redirect(returnUrl);
  } catch (error) {
    await client
      .from("sales_catalog_payment_integrations")
      .update({
        status: "error",
        last_error: formatPagBankOAuthError(error),
      })
      .eq("id", integration.id)
      .eq("organization_id", integration.organization_id);

    returnUrl.searchParams.set("payment", "pagbank_error");
    returnUrl.searchParams.set("reason", isPagBankInvalidClientError(error) ? "invalid_oauth_credentials" : "token_exchange");
    return NextResponse.redirect(returnUrl);
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function buildPagBankReturnUrl(baseUrl: string, metadata: JsonRecord | null) {
  const record = readRecord(metadata);
  const path = record.oauth_return_to === "integrations" ? "/dashboard/integracoes" : "/dashboard/links";

  return new URL(path, baseUrl);
}

function getAppBaseUrl() {
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null;
  const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || productionUrl
    || deploymentUrl
    || "http://localhost:3000";

  return baseUrl.replace(/\/+$/, "");
}

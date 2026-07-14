import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  exchangeGoogleAuthorizationCode,
  getAppBaseUrl,
  listGoogleAdsAccessibleCustomers,
  loadGoogleGuidedOAuthConfig,
  logIntegrationAction,
  readOAuthReturnReason,
  saveOAuthCredentials,
  upsertGuidedOAuthConnection,
} from "@/lib/client-os/guided-oauth";
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
  const baseUrl = getAppBaseUrl();
  const returnUrl = new URL("/dashboard/integracoes", baseUrl);
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", "/dashboard/integracoes");
    return NextResponse.redirect(loginUrl);
  }

  const code = request.nextUrl.searchParams.get("code")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();

  if (!code || !state) {
    returnUrl.searchParams.set("integration", "google_error");
    returnUrl.searchParams.set("reason", "missing_code");
    return NextResponse.redirect(returnUrl);
  }

  const client = createServiceClient();
  const { data: integration, error: integrationError } = await client
    .from("organization_integrations")
    .select("id, organization_id, metadata")
    .eq("provider_id", "google-growth")
    .contains("metadata", { oauth_state: state })
    .maybeSingle<IntegrationRow>();

  if (integrationError || !integration) {
    returnUrl.searchParams.set("integration", "google_error");
    returnUrl.searchParams.set("reason", "invalid_state");
    return NextResponse.redirect(returnUrl);
  }

  try {
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId: integration.organization_id,
      client,
    });

    if (!["owner", "admin"].includes(company.role)) {
      returnUrl.searchParams.set("integration", "google_error");
      returnUrl.searchParams.set("reason", "permission");
      return NextResponse.redirect(returnUrl);
    }

    const config = await loadGoogleGuidedOAuthConfig({ client });
    const tokens = await exchangeGoogleAuthorizationCode({ code, config });
    const accessibleCustomers = await listGoogleAdsAccessibleCustomers({
      accessToken: tokens.access_token!,
      config,
    });
    const selectedCustomerId = accessibleCustomers[0] ?? "";
    const savedCredentials = await saveOAuthCredentials({
      client,
      organizationId: company.id,
      actorId: workspace.user.id,
      credentials: [
        {
          integrationId: "google-ads",
          envName: "GOOGLE_ADS_REFRESH_TOKEN",
          label: "Google refresh token",
          kind: "secret",
          requirement: "recommended",
          value: tokens.refresh_token!,
        },
        {
          integrationId: "google-ads",
          envName: "GOOGLE_ADS_CUSTOMER_ID",
          label: "Google Ads Customer ID",
          kind: "identifier",
          requirement: "recommended",
          value: selectedCustomerId,
        },
      ],
    });
    const now = new Date().toISOString();
    const integrationId = await upsertGuidedOAuthConnection({
      client,
      organizationId: company.id,
      providerId: "google-growth",
      status: "connected",
      label: selectedCustomerId ? "Google conectado" : "Google autorizado",
      externalAccountId: selectedCustomerId || null,
      externalAccountLabel: selectedCustomerId ? `Google Ads ${selectedCustomerId}` : "Google autorizado",
      scopes: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : config.scopes,
      actorId: workspace.user.id,
      metadata: {
        ...readRecord(integration.metadata),
        oauth_state: null,
        oauth_connected_at: now,
        token_type: tokens.token_type ?? null,
        token_expires_in: tokens.expires_in ?? null,
        accessible_customers: accessibleCustomers,
        selected_customer_id: selectedCustomerId || null,
        credential_envs: savedCredentials,
      },
    });

    await logIntegrationAction({
      client,
      organizationId: company.id,
      organizationIntegrationId: integrationId,
      providerId: "google-growth",
      actorId: workspace.user.id,
      action: "oauth.connected",
      metadata: {
        credential_envs: savedCredentials,
        accessible_customers: accessibleCustomers,
      },
    });

    revalidatePath("/dashboard/integracoes");
    revalidatePath("/dashboard/trafego/google-ads");

    returnUrl.searchParams.set("integration", "google_connected");
    return NextResponse.redirect(returnUrl);
  } catch (error) {
    await client
      .from("organization_integrations")
      .update({
        status: "error",
        last_error: error instanceof Error ? error.message : "Falha ao conectar Google.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    returnUrl.searchParams.set("integration", "google_error");
    returnUrl.searchParams.set("reason", readOAuthReturnReason(error));
    return NextResponse.redirect(returnUrl);
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

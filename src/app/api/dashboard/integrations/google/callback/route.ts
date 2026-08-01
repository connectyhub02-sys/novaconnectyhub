import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { resolveDashboardCompanyId } from "@/lib/client-os/dashboard-route-scope";
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
import { queueGrowthIntegrationSyncJob, syncGoogleOAuthAssets } from "@/lib/client-os/growth-integrations";
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

    await syncGoogleGrowthAssetsBestEffort({
      accessibleCustomers,
      actorId: workspace.user.id,
      client,
      companyId: company.id,
      integrationId,
      scopes: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : config.scopes,
      selectedCustomerId,
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

async function syncGoogleGrowthAssetsBestEffort(input: {
  accessibleCustomers: string[];
  actorId: string;
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  integrationId: string;
  scopes: string[];
  selectedCustomerId: string;
}) {
  try {
    const sync = await syncGoogleOAuthAssets({
      accessibleCustomers: input.accessibleCustomers,
      client: input.client,
      organizationId: input.companyId,
      organizationIntegrationId: input.integrationId,
      scopes: input.scopes,
      selectedCustomerId: input.selectedCustomerId,
    });
    const job = await queueGrowthIntegrationSyncJob({
      actorId: input.actorId,
      client: input.client,
      jobType: "traffic_snapshot",
      metadata: { source: "oauth_callback", provider: "google" },
      organizationId: input.companyId,
      organizationIntegrationId: input.integrationId,
      providerId: "google-growth",
    }).catch(() => null);

    await logIntegrationAction({
      client: input.client,
      organizationId: input.companyId,
      organizationIntegrationId: input.integrationId,
      providerId: "google-growth",
      actorId: input.actorId,
      action: "growth.assets.synced",
      metadata: {
        ...sync,
        sync_job_id: job?.id ?? null,
      },
    });
  } catch (error) {
    await logIntegrationAction({
      client: input.client,
      organizationId: input.companyId,
      organizationIntegrationId: input.integrationId,
      providerId: "google-growth",
      actorId: input.actorId,
      action: "growth.assets.sync_skipped",
      status: "warning",
      metadata: {
        reason: error instanceof Error ? error.message : "Falha ao sincronizar assets Google.",
      },
    });
  }
}

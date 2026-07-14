import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  exchangeMetaAuthorizationCode,
  getAppBaseUrl,
  listMetaConnectionAssets,
  loadMetaGuidedOAuthConfig,
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
    returnUrl.searchParams.set("integration", "meta_error");
    returnUrl.searchParams.set("reason", "missing_code");
    return NextResponse.redirect(returnUrl);
  }

  const client = createServiceClient();
  const { data: integration, error: integrationError } = await client
    .from("organization_integrations")
    .select("id, organization_id, metadata")
    .eq("provider_id", "meta-ads")
    .contains("metadata", { oauth_state: state })
    .maybeSingle<IntegrationRow>();

  if (integrationError || !integration) {
    returnUrl.searchParams.set("integration", "meta_error");
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
      returnUrl.searchParams.set("integration", "meta_error");
      returnUrl.searchParams.set("reason", "permission");
      return NextResponse.redirect(returnUrl);
    }

    const config = await loadMetaGuidedOAuthConfig({ client });
    const token = await exchangeMetaAuthorizationCode({ code, config });
    const assets = await listMetaConnectionAssets({
      accessToken: token.access_token!,
      config,
    });
    const credentials = [
      {
        integrationId: "meta" as const,
        envName: "META_ACCESS_TOKEN",
        label: "Meta access token",
        kind: "secret" as const,
        requirement: "recommended" as const,
        value: token.access_token!,
      },
      {
        integrationId: "meta" as const,
        envName: "META_AD_ACCOUNT_ID",
        label: "Meta Ad Account ID",
        kind: "identifier" as const,
        requirement: "recommended" as const,
        value: assets.adAccountId,
      },
      {
        integrationId: "meta" as const,
        envName: "FACEBOOK_PAGE_ID",
        label: "Facebook Page ID",
        kind: "identifier" as const,
        requirement: "optional" as const,
        value: assets.pageId ?? "",
      },
      {
        integrationId: "meta" as const,
        envName: "INSTAGRAM_BUSINESS_ACCOUNT_ID",
        label: "Instagram Business ID",
        kind: "identifier" as const,
        requirement: "optional" as const,
        value: assets.instagramBusinessId ?? "",
      },
    ];
    const savedCredentials = await saveOAuthCredentials({
      client,
      organizationId: company.id,
      actorId: workspace.user.id,
      credentials,
    });
    const now = new Date().toISOString();
    const accountLabel = assets.adAccountLabel || assets.pageLabel || assets.instagramLabel || "Meta autorizado";
    const integrationId = await upsertGuidedOAuthConnection({
      client,
      organizationId: company.id,
      providerId: "meta-ads",
      status: "connected",
      label: assets.adAccountId ? "Meta conectado" : "Meta autorizado",
      externalAccountId: assets.adAccountId || assets.pageId || assets.instagramBusinessId || null,
      externalAccountLabel: accountLabel,
      scopes: config.permissions,
      actorId: workspace.user.id,
      metadata: {
        ...readRecord(integration.metadata),
        oauth_state: null,
        oauth_connected_at: now,
        token_type: token.token_type ?? null,
        token_expires_in: token.expires_in ?? null,
        ad_account_id: assets.adAccountId || null,
        facebook_page_id: assets.pageId || null,
        instagram_business_id: assets.instagramBusinessId || null,
        selected_ad_account_id: assets.adAccountId || null,
        selected_facebook_page_id: assets.pageId || null,
        selected_instagram_business_id: assets.instagramBusinessId || null,
        ad_accounts: assets.adAccounts,
        facebook_pages: assets.pages,
        instagram_accounts: assets.instagramAccounts,
        credential_envs: savedCredentials,
      },
    });

    await logIntegrationAction({
      client,
      organizationId: company.id,
      organizationIntegrationId: integrationId,
      providerId: "meta-ads",
      actorId: workspace.user.id,
      action: "oauth.connected",
      metadata: {
        credential_envs: savedCredentials,
        ad_account_id: assets.adAccountId || null,
        facebook_page_id: assets.pageId || null,
        instagram_business_id: assets.instagramBusinessId || null,
        ad_accounts: assets.adAccounts,
        facebook_pages: assets.pages,
        instagram_accounts: assets.instagramAccounts,
      },
    });

    revalidatePath("/dashboard/integracoes");
    revalidatePath("/dashboard/trafego/meta-ads");

    returnUrl.searchParams.set("integration", "meta_connected");
    return NextResponse.redirect(returnUrl);
  } catch (error) {
    await client
      .from("organization_integrations")
      .update({
        status: "error",
        last_error: error instanceof Error ? error.message : "Falha ao conectar Meta.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    returnUrl.searchParams.set("integration", "meta_error");
    returnUrl.searchParams.set("reason", readOAuthReturnReason(error));
    return NextResponse.redirect(returnUrl);
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

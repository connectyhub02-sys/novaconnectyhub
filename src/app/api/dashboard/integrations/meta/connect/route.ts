import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess } from "@/lib/billing/trial";
import { requireMetaCompanyAccess as requireClientCompanyAccess } from "@/lib/meta/company-access";
import { resolveDashboardCompanyId } from "@/lib/client-os/dashboard-route-scope";
import {
  buildMetaAuthorizationUrl,
  getAppBaseUrl,
  loadMetaGuidedOAuthConfig,
  readOAuthReturnReason,
  upsertGuidedOAuthConnection,
} from "@/lib/client-os/guided-oauth";
import { getMetaWorkspace as getCurrentWorkspace } from "@/lib/meta/company-access";
import { createServiceClient } from "@/lib/supabase/service";
import { createMetaOAuthState, hashMetaOAuthState, metaOAuthCookie } from "@/lib/meta/oauth-state";
import { resolveInternalMetaLoginConfig } from "@/lib/meta/internal-login-config";
import { readMetaReviewAccess } from "@/lib/auth/meta-review-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Speculative navigation must never reset a working OAuth connection.
  if (request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch"
    || request.headers.get("sec-purpose")?.includes("prefetch") || request.headers.get("rsc") === "1") {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  }
  const baseUrl = getAppBaseUrl();
  const returnUrl = new URL("/dashboard/integracoes", baseUrl);
  const workspace = await getCurrentWorkspace();
  if (workspace?.profile.isPlatformAdmin) returnUrl.pathname = "/admin/meta";

  if (!workspace) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", "/dashboard/integracoes");
    return NextResponse.redirect(loginUrl);
  }

  const requestedCompanyId = request.nextUrl.searchParams.get("companyId");

  try {
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId,
    });
    const company = await requireClientCompanyAccess({ userId: workspace.user.id, companyId, client });
    await assertBillableAccess({ organizationId: company.id, client });

    if (!["owner", "admin"].includes(company.role)) {
      returnUrl.searchParams.set("integration", "meta_error");
      returnUrl.searchParams.set("reason", "permission");
      return NextResponse.redirect(returnUrl);
    }

    const config = await loadMetaGuidedOAuthConfig({ client });
    const previous = await client.from("organization_integrations").select("metadata")
      .eq("organization_id", company.id).eq("provider_id", "meta-ads").maybeSingle();
    if (previous.error) throw previous.error;
    const previousMetadata = (previous.data?.metadata ?? {}) as Record<string, unknown>;
    config.loginConfigId = resolveInternalMetaLoginConfig({
      isPlatformAdmin: workspace.profile.isPlatformAdmin, slug: company.slug, planCode: company.planCode,
      metadata: previousMetadata, defaultConfigId: config.loginConfigId,
      organizationId: company.id, reviewAccess: readMetaReviewAccess(workspace.user),
    });
    const state = createMetaOAuthState();
    const now = new Date().toISOString();

    await upsertGuidedOAuthConnection({
      client,
      organizationId: company.id,
      providerId: "meta-ads",
      status: "pending",
      label: "Aguardando autorizacao Meta",
      scopes: [],
      actorId: workspace.user.id,
      metadata: {
        ...previousMetadata,
        oauth_state_hash: hashMetaOAuthState(state),
        oauth_requested_permissions: config.permissions,
        oauth_requested_by: workspace.user.id,
        oauth_requested_at: now,
        oauth_redirect_uri: config.redirectUri,
        oauth_started_from: "integrations_hub",
      },
    });

    const response = NextResponse.redirect(buildMetaAuthorizationUrl({ config, state }));
    response.cookies.set({ ...metaOAuthCookie(baseUrl), value: state });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    returnUrl.searchParams.set("integration", "meta_error");
    returnUrl.searchParams.set("reason", readOAuthReturnReason(error));
    return NextResponse.redirect(returnUrl);
  }
}

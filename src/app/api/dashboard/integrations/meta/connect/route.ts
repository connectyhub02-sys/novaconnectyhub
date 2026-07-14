import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  buildMetaAuthorizationUrl,
  getAppBaseUrl,
  loadMetaGuidedOAuthConfig,
  readOAuthReturnReason,
  upsertGuidedOAuthConnection,
} from "@/lib/client-os/guided-oauth";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const baseUrl = getAppBaseUrl();
  const returnUrl = new URL("/dashboard/integracoes", baseUrl);
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", "/dashboard/integracoes");
    return NextResponse.redirect(loginUrl);
  }

  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();

  if (!companyId) {
    returnUrl.searchParams.set("integration", "meta_error");
    returnUrl.searchParams.set("reason", "missing_company");
    return NextResponse.redirect(returnUrl);
  }

  try {
    const client = createServiceClient();
    const company = await requireClientCompanyAccess({ userId: workspace.user.id, companyId, client });

    if (!["owner", "admin"].includes(company.role)) {
      returnUrl.searchParams.set("integration", "meta_error");
      returnUrl.searchParams.set("reason", "permission");
      return NextResponse.redirect(returnUrl);
    }

    const config = await loadMetaGuidedOAuthConfig({ client });
    const state = `meta_${randomUUID()}`;
    const now = new Date().toISOString();

    await upsertGuidedOAuthConnection({
      client,
      organizationId: company.id,
      providerId: "meta-ads",
      status: "pending",
      label: "Aguardando autorizacao Meta",
      scopes: config.permissions,
      actorId: workspace.user.id,
      metadata: {
        oauth_state: state,
        oauth_requested_by: workspace.user.id,
        oauth_requested_at: now,
        oauth_redirect_uri: config.redirectUri,
        oauth_started_from: "integrations_hub",
      },
    });

    return NextResponse.redirect(buildMetaAuthorizationUrl({ config, state }));
  } catch (error) {
    returnUrl.searchParams.set("integration", "meta_error");
    returnUrl.searchParams.set("reason", readOAuthReturnReason(error));
    return NextResponse.redirect(returnUrl);
  }
}

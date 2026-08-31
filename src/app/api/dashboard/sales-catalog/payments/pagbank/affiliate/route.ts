import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { resolveDashboardCompanyId } from "@/lib/client-os/dashboard-route-scope";
import { buildPagBankAffiliateLandingUrl } from "@/lib/sales-catalog/pagbank";
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

  const requestedCompanyId = request.nextUrl.searchParams.get("companyId");

  try {
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId,
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    await assertBillableAccess({ organizationId: company.id, client });

    const affiliateUrl = await buildPagBankAffiliateLandingUrl({
      companyId: company.id,
      state: `pb_aff_${randomUUID()}`,
      client,
    });

    if (!affiliateUrl) {
      returnUrl.searchParams.set("payment", "pagbank_error");
      returnUrl.searchParams.set("reason", "affiliate_missing");
      return NextResponse.redirect(returnUrl);
    }

    return NextResponse.redirect(affiliateUrl);
  } catch (error) {
    console.error("[sales-catalog] pagbank affiliate redirect failed", error);
    returnUrl.searchParams.set("payment", "pagbank_error");
    returnUrl.searchParams.set("reason", "affiliate_failed");
    return NextResponse.redirect(returnUrl);
  }
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

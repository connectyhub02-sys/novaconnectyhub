import { NextResponse, type NextRequest } from "next/server";
import { buildAsaasAffiliateLandingUrl } from "@/lib/sales-catalog/asaas";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();
  const companyId = request.nextUrl.searchParams.get("companyId");
  const baseUrl = getAppBaseUrl();

  if (!workspace) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", "/dashboard/integracoes");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(buildAsaasAffiliateLandingUrl({ companyId }));
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

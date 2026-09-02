import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { resolveDashboardCompanyId } from "@/lib/client-os/dashboard-route-scope";
import {
  buildPagBankSellerConnectUrl,
  buildPagBankWebhookUrl,
  getPagBankRequestedSellerScopes,
  isPagBankSandboxMode,
} from "@/lib/sales-catalog/pagbank";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const baseUrl = getAppBaseUrl();
  const returnTo = normalizePagBankReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const returnPath = returnTo === "integrations" ? "/dashboard/integracoes" : "/dashboard/links";
  const returnUrl = new URL(returnPath, baseUrl);
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", returnPath);
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

    const state = `pb_${randomUUID()}`;
    const webhookUrl = buildPagBankWebhookUrl();
    const mode = await isPagBankSandboxMode({ client });
    const connect = await buildPagBankSellerConnectUrl({ companyId: company.id, state, client });
    const now = new Date().toISOString();
    const { error } = await client
      .from("sales_catalog_payment_integrations")
      .upsert({
        organization_id: company.id,
        provider: "pagbank",
        status: "pending",
        mode: mode ? "sandbox" : "production",
        webhook_url: webhookUrl,
        last_error: null,
        metadata: {
          oauth_state: state,
          oauth_return_to: returnTo,
          oauth_requested_by: workspace.user.id,
          oauth_requested_at: now,
          oauth_started_from: returnTo === "integrations" ? "integrations_hub" : "guided_connect_route",
          requested_scopes: getPagBankRequestedSellerScopes(),
          affiliate_url_used: connect.affiliateUrlUsed,
          affiliate_url_available: connect.affiliateUrlAvailable,
          authorization_url: connect.authorizationUrl,
        },
        updated_at: now,
      }, { onConflict: "organization_id,provider" });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.redirect(connect.redirectUrl);
  } catch (error) {
    console.error("[sales-catalog] pagbank connect failed", error);
    returnUrl.searchParams.set("payment", "pagbank_error");
    returnUrl.searchParams.set("reason", getPagBankConnectErrorReason(error));
    return NextResponse.redirect(returnUrl);
  }
}

function normalizePagBankReturnTo(value: string | null) {
  return value === "integrations" ? "integrations" : "links";
}

function getPagBankConnectErrorReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("PAGBANK_CLIENT_ID")
    || message.includes("PAGBANK_CLIENT_SECRET")
    || message.includes("PAGBANK_CONNECT_TOKEN")
    || message.includes("PAGBANK_AUTHORIZATION_TOKEN")
    || message.includes("painel admin")
  ) {
    return "config";
  }

  return "start_failed";
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

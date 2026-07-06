import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  buildMercadoPagoAuthorizationUrl,
  buildMercadoPagoWebhookUrl,
  getAppBaseUrl,
} from "@/lib/sales-catalog/mercado-pago";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const baseUrl = getAppBaseUrl();
  const linksUrl = new URL("/dashboard/links", baseUrl);
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", "/dashboard/links");
    return NextResponse.redirect(loginUrl);
  }

  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();

  if (!companyId) {
    linksUrl.searchParams.set("payment", "mercado_pago_error");
    linksUrl.searchParams.set("reason", "missing_company");
    return NextResponse.redirect(linksUrl);
  }

  try {
    const client = createServiceClient();
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    const state = `mp_${randomUUID()}`;
    const webhookUrl = buildMercadoPagoWebhookUrl();
    const authorizationUrl = buildMercadoPagoAuthorizationUrl({ companyId: company.id, state });
    const now = new Date().toISOString();
    const { error } = await client
      .from("sales_catalog_payment_integrations")
      .upsert({
        organization_id: company.id,
        provider: "mercado_pago",
        status: "pending",
        mode: process.env.MERCADO_PAGO_TEST_TOKEN === "true" ? "sandbox" : "production",
        webhook_url: webhookUrl,
        last_error: null,
        metadata: {
          oauth_state: state,
          oauth_requested_by: workspace.user.id,
          oauth_requested_at: now,
          oauth_started_from: "guided_connect_route",
        },
        updated_at: now,
      }, { onConflict: "organization_id,provider" });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    console.error("[sales-catalog] mercado pago connect failed", error);
    linksUrl.searchParams.set("payment", "mercado_pago_error");
    linksUrl.searchParams.set("reason", getMercadoPagoConnectErrorReason(error));
    return NextResponse.redirect(linksUrl);
  }
}

function getMercadoPagoConnectErrorReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("MERCADO_PAGO_CLIENT_ID") || message.includes("MERCADO_PAGO_CLIENT_SECRET")) {
    return "config";
  }

  return "start_failed";
}

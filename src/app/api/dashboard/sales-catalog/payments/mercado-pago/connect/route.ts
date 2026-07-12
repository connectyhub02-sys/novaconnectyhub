import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  buildMercadoPagoAuthorizationUrl,
  buildMercadoPagoWebhookUrl,
  getAppBaseUrl,
  isMercadoPagoTestTokenEnabled,
} from "@/lib/sales-catalog/mercado-pago";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const baseUrl = getAppBaseUrl();
  const returnTo = normalizeMercadoPagoReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const returnPath = returnTo === "integrations" ? "/dashboard/integracoes" : "/dashboard/links";
  const returnUrl = new URL(returnPath, baseUrl);
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("next", returnPath);
    return NextResponse.redirect(loginUrl);
  }

  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();

  if (!companyId) {
    returnUrl.searchParams.set("payment", "mercado_pago_error");
    returnUrl.searchParams.set("reason", "missing_company");
    return NextResponse.redirect(returnUrl);
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
    const authorizationUrl = await buildMercadoPagoAuthorizationUrl({ companyId: company.id, state, client });
    const testTokenEnabled = await isMercadoPagoTestTokenEnabled({ client });
    const now = new Date().toISOString();
    const { error } = await client
      .from("sales_catalog_payment_integrations")
      .upsert({
        organization_id: company.id,
        provider: "mercado_pago",
        status: "pending",
        mode: testTokenEnabled ? "sandbox" : "production",
        webhook_url: webhookUrl,
        last_error: null,
        metadata: {
          oauth_state: state,
          oauth_return_to: returnTo,
          oauth_requested_by: workspace.user.id,
          oauth_requested_at: now,
          oauth_started_from: returnTo === "integrations" ? "integrations_hub" : "guided_connect_route",
        },
        updated_at: now,
      }, { onConflict: "organization_id,provider" });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    console.error("[sales-catalog] mercado pago connect failed", error);
    returnUrl.searchParams.set("payment", "mercado_pago_error");
    returnUrl.searchParams.set("reason", getMercadoPagoConnectErrorReason(error));
    return NextResponse.redirect(returnUrl);
  }
}

function normalizeMercadoPagoReturnTo(value: string | null) {
  return value === "integrations" ? "integrations" : "links";
}

function getMercadoPagoConnectErrorReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("MERCADO_PAGO_CLIENT_ID")
    || message.includes("MERCADO_PAGO_CLIENT_SECRET")
    || message.includes("painel admin")
  ) {
    return "config";
  }

  return "start_failed";
}

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

const oauthManagedBillingCredentials = [
  "MERCADO_PAGO_BILLING_ACCESS_TOKEN",
  "MERCADO_PAGO_BILLING_PUBLIC_KEY",
  "MERCADO_PAGO_BILLING_REFRESH_TOKEN",
  "MERCADO_PAGO_BILLING_ACCOUNT_ID",
  "MERCADO_PAGO_BILLING_TOKEN_EXPIRES_AT",
  "MERCADO_PAGO_BILLING_WEBHOOK_URL",
  "MERCADO_PAGO_BILLING_MODE",
];

export async function POST() {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const client = createServiceClient();
  const [{ data: settings }, deleteResult] = await Promise.all([
    client
      .from("platform_billing_settings")
      .select("id, metadata")
      .eq("setting_key", "default")
      .maybeSingle<{ id: string | null; metadata: JsonRecord | null }>(),
    client
      .from("integration_credentials")
      .delete()
      .eq("scope", "platform")
      .eq("integration_id", "mercado-pago-billing")
      .is("organization_id", null)
      .in("env_name", oauthManagedBillingCredentials),
  ]);

  if (deleteResult.error) {
    return NextResponse.json({ error: deleteResult.error.message }, { status: 500 });
  }

  await client
    .from("platform_billing_settings")
    .upsert(
      {
        setting_key: "default",
        updated_by: auth.userId,
        metadata: {
          ...(settings?.metadata ?? {}),
          mercado_pago_billing_connected_at: null,
          mercado_pago_billing_disconnected_by: auth.userId,
          mercado_pago_billing_disconnected_at: new Date().toISOString(),
          mercado_pago_billing_oauth_state: null,
        },
      },
      { onConflict: "setting_key" },
    );

  await client.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "billing.mercado_pago.oauth.disconnected",
    target_table: "platform_billing_settings",
    target_id: settings?.id ?? null,
    metadata: {
      removedCredentialFields: oauthManagedBillingCredentials,
      keptWebhookSecret: true,
    },
  });

  revalidatePath("/admin/financeiro");
  revalidatePath("/admin/maintenance");

  return NextResponse.json({ ok: true });
}

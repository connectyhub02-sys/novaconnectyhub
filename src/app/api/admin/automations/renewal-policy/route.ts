import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  normalizePlatformBillingRenewalPolicy,
  platformBillingRenewalPolicyMetadataKey,
  serializePlatformBillingRenewalPolicy,
} from "@/lib/billing/renewal-policy";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const policy = normalizePlatformBillingRenewalPolicy(readRecord(body)?.policy ?? body);
  const client = createServiceClient();
  const { data: current, error: currentError } = await client
    .from("platform_billing_settings")
    .select("metadata")
    .eq("setting_key", "default")
    .maybeSingle<{ metadata: JsonRecord | null }>();

  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }

  const metadata = {
    ...(current?.metadata ?? {}),
    [platformBillingRenewalPolicyMetadataKey]: {
      ...serializePlatformBillingRenewalPolicy(policy),
      updated_at: new Date().toISOString(),
      updated_by: auth.userId,
    },
  };
  const { error } = await client
    .from("platform_billing_settings")
    .upsert({
      setting_key: "default",
      metadata,
      updated_by: auth.userId,
    }, { onConflict: "setting_key" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await client.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "automation.billing_renewal_policy.updated",
    target_table: "platform_billing_settings",
    target_id: "default",
    metadata: {
      renewal_policy: serializePlatformBillingRenewalPolicy(policy),
    },
  });

  revalidatePath("/admin/automacoes");
  revalidatePath("/admin/financeiro");

  return NextResponse.json({ policy });
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

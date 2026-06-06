import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = parseFeatureUpdate(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("provider_features")
    .update({
      included_in_plans: parsed.includedInPlans,
      enabled: parsed.enabled,
      billable: parsed.billable,
    })
    .eq("id", parsed.featureId)
    .select("id, included_in_plans, enabled, billable")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "billing.feature.updated",
    target_table: "provider_features",
    target_id: parsed.featureId,
    metadata: {
      includedInPlans: parsed.includedInPlans,
      enabled: parsed.enabled,
      billable: parsed.billable,
    },
  });

  return NextResponse.json({ feature: data });
}

function parseFeatureUpdate(body: unknown):
  | {
      ok: true;
      featureId: string;
      includedInPlans: string[];
      enabled: boolean;
      billable: boolean;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Payload invalido." };
  }

  const record = body as Record<string, unknown>;
  const featureId = typeof record.featureId === "string" ? record.featureId.trim() : "";

  if (!featureId) {
    return { ok: false, error: "Informe a ferramenta." };
  }

  if (!Array.isArray(record.includedInPlans)) {
    return { ok: false, error: "Informe os planos liberados." };
  }

  const includedInPlans = Array.from(
    new Set(
      record.includedInPlans
        .filter((plan): plan is string => typeof plan === "string")
        .map((plan) => plan.trim().toLowerCase())
        .filter((plan) => /^[a-z0-9_-]{1,40}$/.test(plan)),
    ),
  );

  return {
    ok: true,
    featureId,
    includedInPlans,
    enabled: record.enabled !== false,
    billable: record.billable !== false,
  };
}

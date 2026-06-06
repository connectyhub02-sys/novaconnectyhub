import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = parseRateUpdate(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("billing_rates")
    .update({
      provider_cost_per_unit: parsed.providerCostPerUnit,
      connecty_price_per_unit: parsed.connectyPricePerUnit,
      margin_multiplier: parsed.marginMultiplier,
      minimum_charge_credits: parsed.minimumChargeCredits,
      active: parsed.active,
    })
    .eq("id", parsed.rateId)
    .select("id, provider_cost_per_unit, connecty_price_per_unit, margin_multiplier, minimum_charge_credits, active")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "billing.rate.updated",
    target_table: "billing_rates",
    target_id: parsed.rateId,
    metadata: {
      providerCostPerUnit: parsed.providerCostPerUnit,
      connectyPricePerUnit: parsed.connectyPricePerUnit,
      marginMultiplier: parsed.marginMultiplier,
      minimumChargeCredits: parsed.minimumChargeCredits,
      active: parsed.active,
    },
  });

  return NextResponse.json({ rate: data });
}

function parseRateUpdate(body: unknown):
  | {
      ok: true;
      rateId: string;
      providerCostPerUnit: number;
      connectyPricePerUnit: number;
      marginMultiplier: number | null;
      minimumChargeCredits: number;
      active: boolean;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Payload invalido." };
  }

  const record = body as Record<string, unknown>;
  const rateId = typeof record.rateId === "string" ? record.rateId.trim() : "";

  if (!rateId) {
    return { ok: false, error: "Informe a tarifa." };
  }

  const providerCostPerUnit = toFiniteNumber(record.providerCostPerUnit, 0);
  const connectyPricePerUnit = toFiniteNumber(record.connectyPricePerUnit, 0);
  const minimumChargeCredits = toFiniteNumber(record.minimumChargeCredits, 0);
  const rawMargin = record.marginMultiplier === "" || record.marginMultiplier === null
    ? null
    : toFiniteNumber(record.marginMultiplier, 0);
  const marginMultiplier = rawMargin === null ? null : Math.max(rawMargin, 0);

  if (providerCostPerUnit < 0 || connectyPricePerUnit < 0 || minimumChargeCredits < 0) {
    return { ok: false, error: "Valores financeiros nao podem ser negativos." };
  }

  return {
    ok: true,
    rateId,
    providerCostPerUnit,
    connectyPricePerUnit,
    marginMultiplier,
    minimumChargeCredits,
    active: record.active !== false,
  };
}

function toFiniteNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

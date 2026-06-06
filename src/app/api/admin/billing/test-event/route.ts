import { NextResponse, type NextRequest } from "next/server";
import {
  billingProviders,
  calculateGrossMargin,
  ensureCreditWallet,
  recordUsageAndDebitCredits,
  recordUsageEvent,
  type BillingProvider,
} from "@/lib/billing/cost-center";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = parseUsageTest(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data: organization, error: organizationError } = await auth.supabase
    .from("organizations")
    .select("id, name")
    .eq("id", parsed.organizationId)
    .maybeSingle<{ id: string; name: string }>();

  if (organizationError) {
    return NextResponse.json({ error: organizationError.message }, { status: 500 });
  }

  if (!organization) {
    return NextResponse.json({ error: "Empresa nao encontrada." }, { status: 404 });
  }

  try {
    const wallet = await ensureCreditWallet(auth.supabase, parsed.organizationId);

    if (parsed.debitCredits && parsed.connectyChargeCredits > Number(wallet.balance_credits ?? 0)) {
      return NextResponse.json(
        {
          error: "Saldo insuficiente para debitar este consumo teste. Conceda creditos antes ou desative o debito.",
          balanceCredits: Number(wallet.balance_credits ?? 0),
          requiredCredits: parsed.connectyChargeCredits,
        },
        { status: 409 },
      );
    }

    const usagePayload = {
      organizationId: parsed.organizationId,
      userId: auth.userId,
      provider: parsed.provider,
      featureCode: parsed.featureCode,
      modelId: parsed.modelId,
      agentId: "admin-test-agent",
      conversationId: `test-${Date.now()}`,
      leadId: null,
      status: "completed" as const,
      inputUnits: parsed.inputUnits,
      outputUnits: parsed.outputUnits,
      providerCost: parsed.providerCost,
      connectyChargeCredits: parsed.connectyChargeCredits,
      connectyRevenueEstimate: parsed.connectyRevenueEstimate,
      grossMarginEstimate: calculateGrossMargin(parsed.providerCost, parsed.connectyRevenueEstimate),
      requestId: `admin-test-${Date.now()}`,
      metadata: {
        source: "admin_financeiro_test_event",
        organizationName: organization.name,
        debitCredits: parsed.debitCredits,
      },
    };

    const event = parsed.debitCredits
      ? await recordUsageAndDebitCredits(auth.supabase, usagePayload, "Consumo teste ConnectyHub")
      : await recordUsageEvent(auth.supabase, usagePayload);

    await auth.supabase.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: "billing.usage.test_created",
      target_table: "usage_events",
      target_id: event.id,
      metadata: {
        organizationId: parsed.organizationId,
        organizationName: organization.name,
        provider: parsed.provider,
        featureCode: parsed.featureCode,
        modelId: parsed.modelId,
        chargeCredits: parsed.connectyChargeCredits,
        debitCredits: parsed.debitCredits,
      },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel registrar consumo teste." },
      { status: 500 },
    );
  }
}

function parseUsageTest(body: unknown):
  | {
      ok: true;
      organizationId: string;
      provider: BillingProvider;
      featureCode: string;
      modelId: string | null;
      inputUnits: number;
      outputUnits: number;
      providerCost: number;
      connectyChargeCredits: number;
      connectyRevenueEstimate: number;
      debitCredits: boolean;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Payload invalido." };
  }

  const record = body as Record<string, unknown>;
  const organizationId = typeof record.organizationId === "string" ? record.organizationId.trim() : "";
  const provider = typeof record.provider === "string" ? record.provider : "";
  const featureCode = typeof record.featureCode === "string" ? record.featureCode.trim() : "";
  const modelId = typeof record.modelId === "string" && record.modelId.trim() ? record.modelId.trim() : null;
  const inputUnits = toFiniteNumber(record.inputUnits, 0);
  const outputUnits = toFiniteNumber(record.outputUnits, 0);
  const providerCost = toFiniteNumber(record.providerCost, 0);
  const connectyChargeCredits = toFiniteNumber(record.connectyChargeCredits, 0);
  const connectyRevenueEstimate = toFiniteNumber(record.connectyRevenueEstimate, connectyChargeCredits);

  if (!organizationId) {
    return { ok: false, error: "Escolha a empresa." };
  }

  if (!billingProviders.includes(provider as BillingProvider)) {
    return { ok: false, error: "Provedor invalido." };
  }

  if (!featureCode) {
    return { ok: false, error: "Informe o recurso faturavel." };
  }

  if (inputUnits < 0 || outputUnits < 0 || providerCost < 0 || connectyChargeCredits < 0 || connectyRevenueEstimate < 0) {
    return { ok: false, error: "Valores de consumo nao podem ser negativos." };
  }

  return {
    ok: true,
    organizationId,
    provider: provider as BillingProvider,
    featureCode,
    modelId,
    inputUnits,
    outputUnits,
    providerCost,
    connectyChargeCredits,
    connectyRevenueEstimate,
    debitCredits: record.debitCredits !== false,
  };
}

function toFiniteNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

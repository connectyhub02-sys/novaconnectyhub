import { NextResponse, type NextRequest } from "next/server";
import { grantCredits } from "@/lib/billing/cost-center";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = parseCreditGrant(body);

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
    const transactionId = await grantCredits(auth.supabase, {
      organizationId: parsed.organizationId,
      amountCredits: parsed.amountCredits,
      description: parsed.description || "Credito manual ConnectyHub",
      externalReference: parsed.externalReference ?? undefined,
      metadata: {
        source: "admin_financeiro",
        organizationName: organization.name,
      },
      transactionType: "grant",
    });

    await auth.supabase.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: "billing.credits.granted",
      target_table: "credit_transactions",
      target_id: transactionId,
      metadata: {
        organizationId: parsed.organizationId,
        organizationName: organization.name,
        amountCredits: parsed.amountCredits,
      },
    });

    return NextResponse.json({ transactionId, organization, amountCredits: parsed.amountCredits }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel conceder creditos." },
      { status: 500 },
    );
  }
}

function parseCreditGrant(body: unknown):
  | {
      ok: true;
      organizationId: string;
      amountCredits: number;
      description: string;
      externalReference: string | null;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Payload invalido." };
  }

  const record = body as Record<string, unknown>;
  const organizationId = typeof record.organizationId === "string" ? record.organizationId.trim() : "";
  const amountCredits = typeof record.amountCredits === "number" ? record.amountCredits : Number(record.amountCredits ?? 0);

  if (!organizationId) {
    return { ok: false, error: "Escolha a empresa." };
  }

  if (!Number.isFinite(amountCredits) || amountCredits <= 0) {
    return { ok: false, error: "Informe uma quantidade de creditos maior que zero." };
  }

  return {
    ok: true,
    organizationId,
    amountCredits,
    description: typeof record.description === "string" ? record.description.trim() : "",
    externalReference: typeof record.externalReference === "string" && record.externalReference.trim()
      ? record.externalReference.trim()
      : null,
  };
}

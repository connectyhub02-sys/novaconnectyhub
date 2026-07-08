import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  mapPlatformProductCommissionRow,
  PLATFORM_PRODUCT_COMMISSION_SELECT,
  type PlatformProductCommissionRow,
  type PlatformProductCommissionStatus,
} from "@/lib/platform-products";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = readRecord(await request.json().catch(() => null));
  const commissionId = readString(body.commissionId);
  const status = normalizeCommissionStatus(body.status);

  if (!commissionId || !status) {
    return NextResponse.json({ error: "Informe a comissao e o novo status." }, { status: 422 });
  }

  const client = createServiceClient();
  const now = new Date().toISOString();
  const patch: JsonRecord = {
    status,
    updated_at: now,
  };

  if (status === "available") {
    patch.release_at = now;
  }

  if (status === "paid") {
    patch.paid_at = now;
  }

  const { data, error } = await client
    .from("platform_product_commissions")
    .update(patch)
    .eq("id", commissionId)
    .select(PLATFORM_PRODUCT_COMMISSION_SELECT)
    .single<PlatformProductCommissionRow>();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Nao foi possivel atualizar a comissao." }, { status: 500 });
  }

  await client.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "platform_product_commission.status_updated",
    target_table: "platform_product_commissions",
    target_id: data.id,
    metadata: {
      status,
      organizationId: data.organization_id,
      platformProductId: data.platform_product_id,
      commissionAmount: data.commission_amount,
    },
  });

  revalidatePath("/admin/produtos-connectyhub");
  revalidatePath("/dashboard/produtos");

  return NextResponse.json({ commission: mapPlatformProductCommissionRow(data) });
}

function normalizeCommissionStatus(value: unknown): PlatformProductCommissionStatus | null {
  if (
    value === "pending"
    || value === "available"
    || value === "paid"
    || value === "cancelled"
    || value === "blocked"
    || value === "refunded"
  ) {
    return value;
  }

  return null;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

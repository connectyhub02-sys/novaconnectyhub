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
  const commissionIds = readStringList(body.commissionIds, commissionId ? [commissionId] : []);
  const status = normalizeCommissionStatus(body.status);
  const payoutReference = readString(body.payoutReference);
  const payoutNote = readString(body.payoutNote);

  if (commissionIds.length === 0 || !status) {
    return NextResponse.json({ error: "Informe a comissao e o novo status." }, { status: 422 });
  }

  if (commissionIds.length > 100) {
    return NextResponse.json({ error: "Atualize no maximo 100 comissoes por lote." }, { status: 422 });
  }

  const client = createServiceClient();
  const now = new Date().toISOString();
  const { data: rows, error: rowsError } = await client
    .from("platform_product_commissions")
    .select(PLATFORM_PRODUCT_COMMISSION_SELECT)
    .in("id", commissionIds);

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  const existingRows = (rows ?? []) as unknown as PlatformProductCommissionRow[];

  if (existingRows.length !== commissionIds.length) {
    return NextResponse.json({ error: "Uma ou mais comissoes nao foram encontradas." }, { status: 404 });
  }

  const updatedRows: PlatformProductCommissionRow[] = [];

  for (const row of existingRows) {
    const patch = buildCommissionPatch({
      row,
      status,
      now,
      actorId: auth.userId,
      payoutReference,
      payoutNote,
    });
    const { data, error } = await client
      .from("platform_product_commissions")
      .update(patch)
      .eq("id", row.id)
      .select(PLATFORM_PRODUCT_COMMISSION_SELECT)
      .single<PlatformProductCommissionRow>();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Nao foi possivel atualizar a comissao." }, { status: 500 });
    }

    updatedRows.push(data);
  }

  await client.from("maintenance_audit_logs").insert(updatedRows.map((row) => ({
    actor_id: auth.userId,
    event_type: updatedRows.length > 1 ? "platform_product_commission.batch_status_updated" : "platform_product_commission.status_updated",
    target_table: "platform_product_commissions",
    target_id: row.id,
    metadata: {
      status,
      organizationId: row.organization_id,
      platformProductId: row.platform_product_id,
      commissionAmount: row.commission_amount,
      batchSize: updatedRows.length,
      payoutReference,
      payoutNote,
    },
  })));

  revalidatePath("/admin/produtos-connectyhub");
  revalidatePath("/dashboard/produtos");

  const commissions = updatedRows.map(mapPlatformProductCommissionRow);

  return NextResponse.json({
    commission: commissions[0] ?? null,
    commissions,
  });
}

function buildCommissionPatch(input: {
  row: PlatformProductCommissionRow;
  status: PlatformProductCommissionStatus;
  now: string;
  actorId: string;
  payoutReference: string | null;
  payoutNote: string | null;
}) {
  const metadata = readRecord(input.row.metadata);
  const statusHistory = Array.isArray(metadata.status_history) ? metadata.status_history : [];
  const statusEntry = {
    at: input.now,
    actor_id: input.actorId,
    from: input.row.status,
    to: input.status,
    payout_reference: input.payoutReference,
    payout_note: input.payoutNote,
  };
  const patch: JsonRecord = {
    status: input.status,
    updated_at: input.now,
    metadata: {
      ...metadata,
      payout_reference: input.status === "paid" ? input.payoutReference : metadata.payout_reference,
      payout_note: input.status === "paid" ? input.payoutNote : metadata.payout_note,
      last_status_update: statusEntry,
      status_history: [...statusHistory.slice(-19), statusEntry],
    },
  };

  if (input.status === "available") {
    patch.release_at = input.now;
  }

  if (input.status === "paid") {
    patch.paid_at = input.now;
    if (!input.row.release_at) {
      patch.release_at = input.now;
    }
  }

  return patch;
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

function readStringList(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;

  const values = value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));

  return Array.from(new Set(values));
}

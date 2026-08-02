import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { refundPlatformBillingPayment } from "@/lib/billing/platform-billing-refunds";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = readRecord(await request.json().catch(() => null));
  const paymentId = readUuid(body?.paymentId);
  const reason = readString(body?.reason);

  if (!paymentId) {
    return NextResponse.json({ error: "Informe o pagamento que sera estornado." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const result = await refundPlatformBillingPayment(client, {
      paymentId,
      actorId: auth.userId,
      reason,
    });

    revalidatePath("/admin/financeiro");
    revalidatePath("/dashboard/planos");

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel realizar o estorno." },
      { status: 502 },
    );
  }
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readUuid(value: unknown) {
  const text = readString(value);

  return text && isUuid(text)
    ? text
    : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

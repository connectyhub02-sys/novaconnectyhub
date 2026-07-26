import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { syncAdminUserWhatsappAvatar } from "@/lib/admin/user-whatsapp-avatar";
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
  const userId = readUuid(body?.userId);

  if (!userId) {
    return NextResponse.json({ error: "Informe um usuario valido." }, { status: 400 });
  }

  try {
    const result = await syncAdminUserWhatsappAvatar({
      client: createServiceClient(),
      userId,
      actorId: auth.userId,
    });

    revalidatePath("/admin/clientes");

    return NextResponse.json({
      user: result,
      message: result.message,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel buscar a foto do WhatsApp." },
      { status: 422 },
    );
  }
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readUuid(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const input = value.trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(input)
    ? input
    : null;
}

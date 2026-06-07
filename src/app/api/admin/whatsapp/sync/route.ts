import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { syncUazapiInstances } from "@/lib/whatsapp/uazapi-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null) as { configureWebhooks?: unknown } | null;
  const summary = await syncUazapiInstances({
    actorId: auth.userId,
    configureWebhooks: body?.configureWebhooks !== false,
  });

  return NextResponse.json({ ok: true, summary });
}

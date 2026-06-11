import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const rateLimitWindow = 60_000;
const rateLimitMax = 5;
const rateLimitStore = new Map<string, number[]>();

function isRateLimited(key: string) {
  const now = Date.now();
  const timestamps = (rateLimitStore.get(key) ?? []).filter((t) => now - t < rateLimitWindow);
  if (timestamps.length >= rateLimitMax) {
    return true;
  }
  timestamps.push(now);
  rateLimitStore.set(key, timestamps);
  return false;
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  if (isRateLimited(auth.userId)) {
    return NextResponse.json({ error: "Muitas requisicoes. Tente novamente em 1 minuto." }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { userId?: string } | null;

  if (!body?.userId) {
    return NextResponse.json({ error: "userId obrigatorio." }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: targetData, error: targetError } = await service.auth.admin.getUserById(body.userId);

  if (targetError || !targetData?.user?.email) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: targetData.user.email,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actionLink = (data as { properties?: { action_link?: string } } | null)?.properties?.action_link;

  if (!actionLink) {
    return NextResponse.json({ error: "Nao foi possivel gerar o link de acesso." }, { status: 500 });
  }

  return NextResponse.json({ actionLink });
}

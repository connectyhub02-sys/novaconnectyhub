import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest, revokeAdminAssistedAccess } from "@/lib/admin-assisted-access";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  try {
    await revokeAdminAssistedAccess();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível encerrar o acesso assistido. Tente novamente." }, { status: 503 });
  }
}

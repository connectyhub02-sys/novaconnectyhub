import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { getAttendanceHistory } from "@/lib/client-os/leads-crm";
import { historyUuidPattern, parseAttendanceHistoryCursor } from "@/lib/client-os/attendance-history-cursor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const workspace = await getCurrentWorkspace();
    if (!workspace) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401, headers });
    const params = request.nextUrl.searchParams;
    const leadId = params.get("leadId") ?? "";
    const conversationId = params.get("conversationId");
    const kind = params.get("kind") ?? "messages";
    if (!historyUuidPattern.test(leadId) || !["events", "messages"].includes(kind)
      || (kind === "messages" && !historyUuidPattern.test(conversationId ?? ""))) {
      return NextResponse.json({ error: "Historico invalido." }, { status: 400, headers });
    }
    let cursor;
    try { cursor = parseAttendanceHistoryCursor(params.get("cursor")); } catch {
      return NextResponse.json({ error: "Pagina invalida." }, { status: 400, headers });
    }
    const page = await getAttendanceHistory({
      organizationId: workspace.organization?.id ?? null, isPlatformAdmin: workspace.profile.isPlatformAdmin,
      leadId, conversationId, kind: kind as "messages" | "events", cursor,
    });
    if (!page) return NextResponse.json({ error: "Historico nao encontrado." }, { status: 404, headers });
    return NextResponse.json(page, { headers });
  } catch (error) {
    console.error("[AttendanceHistory] Falha ao carregar historico", error);
    return NextResponse.json({ error: "Nao foi possivel carregar o historico. Tente novamente." }, { status: 503, headers });
  }
}

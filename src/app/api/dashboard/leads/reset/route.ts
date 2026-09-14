import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { resetLead } from "@/lib/leads/reset";
import { getAdminAssistedAccess, isSameOriginRequest } from "@/lib/admin-assisted-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace = await getCurrentWorkspace();
    const access = workspace ? await getAdminAssistedAccess(workspace) : null;
    return NextResponse.json({ canResetLead: Boolean(access), expiresAt: access?.expiresAt ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ canResetLead: false, expiresAt: null }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  let access;
  try { access = await getAdminAssistedAccess(workspace); }
  catch { return NextResponse.json({ error: "Não foi possível conferir o acesso assistido." }, { status: 503 }); }
  if (!access || !workspace.organization) return NextResponse.json({ error: "Reset disponível somente à equipe ConnectyHub durante acesso assistido ativo ao cliente." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.panelScope != null) return NextResponse.json({ error: "Reset exige o painel do cliente em acesso assistido." }, { status: 403 });
  if (body?.confirmation !== "RESETAR" || typeof body?.leadId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.leadId)) {
    return NextResponse.json({ error: "Confirme a exclusão definitiva do lead." }, { status: 400 });
  }
  const client = createServiceClient();
  const organizationId = workspace.organization.id;
  try {
    const result = await resetLead(client, organizationId, body.leadId, access);
    return NextResponse.json({ ok: result.complete, deleted: result.deleted, complete: result.complete, leadIds: result.leadIds ?? [body.leadId],
      message: result.complete ? "Lead excluído. Um novo contato começará do zero." : "Cadastro e conversas excluídos. A remoção dos arquivos continua; tente novamente para conferir." },
    { status: result.complete ? 200 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("RESET_ASSISTED_ACCESS_REQUIRED")) return NextResponse.json({ error: "O acesso assistido terminou. Acesse novamente pelo painel administrativo." }, { status: 403 });
    if (message.includes("RESET_LEAD_NOT_FOUND")) return NextResponse.json({ error: "Lead não encontrado nesta empresa." }, { status: 404 });
    if (/RESET_.*BUSY/.test(message)) return NextResponse.json({ error: "Há um atendimento ou arquivo sendo processado. Aguarde sua conclusão e tente resetar novamente." }, { status: 409 });
    return NextResponse.json({ error: "Não foi possível concluir o reset. Tente novamente; o processo pode ser retomado com segurança." }, { status: 503 });
  }
}

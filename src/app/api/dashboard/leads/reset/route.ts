import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { ensureConversationPanelScope, parseConversationPanelScope } from "@/lib/whatsapp/conversation-panel-scope";
import { resetLead } from "@/lib/leads/reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== "RESETAR" || typeof body?.leadId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.leadId)) {
    return NextResponse.json({ error: "Confirme a exclusão definitiva do lead." }, { status: 400 });
  }
  const client = createServiceClient();
  const panelScope = parseConversationPanelScope(body.panelScope);
  let organizationId = workspace.organization?.id;
  // Internal attendance has its own organization and is platform-admin only.
  if (panelScope === "platform_internal" && workspace.profile.isPlatformAdmin) {
    const { data, error } = await client.from("organizations").select("id").eq("slug", "connectyhub-platform-whatsapp").maybeSingle();
    if (error) return NextResponse.json({ error: "Não foi possível conferir a empresa." }, { status: 503 });
    organizationId = data?.id;
  }
  if (!organizationId || (panelScope && !workspace.profile.isPlatformAdmin)) {
    return NextResponse.json({ error: "Empresa obrigatória para este acesso." }, { status: 403 });
  }
  const scoped = await ensureConversationPanelScope({ client, organizationId, panelScope });
  if (!scoped.ok) return NextResponse.json({ error: "Lead fora deste atendimento." }, { status: 403 });
  try {
    const result = await resetLead(client, organizationId, body.leadId, workspace.profile.id);
    return NextResponse.json({ ok: result.complete, deleted: result.deleted, complete: result.complete, leadIds: result.leadIds ?? [body.leadId],
      message: result.complete ? "Lead excluído. Um novo contato começará do zero." : "Cadastro e conversas excluídos. A remoção dos arquivos continua; tente novamente para conferir." },
    { status: result.complete ? 200 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("RESET_LEAD_NOT_FOUND")) return NextResponse.json({ error: "Lead não encontrado nesta empresa." }, { status: 404 });
    if (/RESET_.*BUSY/.test(message)) return NextResponse.json({ error: "Há um atendimento ou arquivo sendo processado. Aguarde sua conclusão e tente resetar novamente." }, { status: 409 });
    return NextResponse.json({ error: "Não foi possível concluir o reset. Tente novamente; o processo pode ser retomado com segurança." }, { status: 503 });
  }
}

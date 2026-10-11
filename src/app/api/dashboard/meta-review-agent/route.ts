import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { readMetaReviewAccess } from "@/lib/auth/meta-review-access";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { createServiceClient } from "@/lib/supabase/service";
import { validateAgentChannelSelection } from "@/lib/agents/channel-availability-server";
import { assertBillableAccess } from "@/lib/billing/trial";

const code = "connectyhub-review-meta-service";
async function context() {
  const workspace = await getCurrentWorkspace();
  const review = workspace && readMetaReviewAccess(workspace.user);
  if (!workspace || workspace.profile.isPlatformAdmin || !review?.active || workspace.organization?.id !== review.organizationId) throw new Error("Acesso exclusivo da conta de avaliação.");
  await requireClientCompanyAccess({ userId: workspace.user.id, companyId: review.organizationId });
  const client = createServiceClient();
  const result = await client.from("agent_registry").select("id,name,prompt,status,metadata,updated_at")
    .eq("organization_id", review.organizationId).eq("scope", "organization").eq("agent_code", code).maybeSingle();
  if (result.error) throw new Error("Não foi possível consultar o agente.");
  return { workspace, client, agent: result.data, organizationId: review.organizationId };
}
export async function GET() {
  try { const { agent, organizationId } = await context(); return NextResponse.json({ agent, companyId: organizationId }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error, 403); }
}
export async function POST(request: Request) {
  try {
    const { workspace, client, agent, organizationId } = await context();
    const body = await request.json();
    if (body.action) throw new Error("Ação indisponível neste ambiente.");
    await assertBillableAccess({ organizationId, client });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!name || name.length > 96 || !prompt || prompt.length > 8000) throw new Error("Preencha nome e instruções do agente (até 8.000 caracteres).");
    const channelConfig = await validateAgentChannelSelection(client, organizationId, body.channelConfig, agent?.metadata?.multichannel_config);
    const values = {
      name, persona_name: name, prompt, status: body.paused === true ? "paused" : "online",
      requires_human_approval: true,
      metadata: { ...agent?.metadata, client_created: true, agent_kind: "whatsapp", multichannel_config: channelConfig },
    };
    const result = agent
      ? await client.from("agent_registry").update(values).eq("id", agent.id).eq("organization_id", organizationId).eq("scope", "organization").eq("updated_at", agent.updated_at).select("id").maybeSingle()
      : await client.from("agent_registry").insert({ ...values, scope: "organization", organization_id: organizationId, agent_code: code, sector_code: "meta", sector_name: "Atendimento Meta", role_title: "Avaliação Meta", llm_provider: "gemini", autonomy_level: 50, tools: [], triggers: ["connectyhub/meta.message.received", "connectyhub/meta.comment.received"], memory_access_level: "organization", created_by: workspace.user.id }).select("id").single();
    if (result.error || !result.data) throw new Error("Não foi possível salvar. Atualize a página antes de tentar novamente.");
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error, 400); }
}
function failure(error: unknown, status: number) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na operação." }, { status }); }

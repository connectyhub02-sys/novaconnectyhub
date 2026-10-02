import { voiceWorkspace } from "@/lib/voice-api/auth";
import { voiceFailure, voiceJson, VoiceError } from "@/lib/voice-api/contract";
import { deleteVoiceAgent, startVoiceAgentCall, syncVoiceAgent, VoiceAgentError } from "@/lib/voice-agents/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail = (error: unknown) => voiceFailure(error instanceof VoiceAgentError ? new VoiceError(error.code, error.status, error.message) : error);

// Company voice agents: the WhatsApp agents that can be turned into voice agents,
// their configuration and the recent conversations with their charges.
export async function GET() {
  try {
    const { client, org } = await voiceWorkspace();
    const [agents, voiceAgents, conversations] = await Promise.all([
      client.from("agent_registry").select("id,name,persona_name,status").eq("organization_id", org).neq("status", "archived").order("name"),
      client.from("voice_agents").select("id,agent_registry_id,name,voice_id,first_message,language,max_duration_seconds,status,last_synced_at").eq("organization_id", org).neq("status", "deleted"),
      client.from("voice_agent_conversations").select("id,voice_agent_id,status,duration_seconds,charged_credits,started_at,created_at").eq("organization_id", org).order("created_at", { ascending: false }).limit(30),
    ]);
    if (agents.error || voiceAgents.error || conversations.error) throw new VoiceError("service_unavailable", 503, "Não foi possível carregar os agentes de voz.");
    return voiceJson({ agents: agents.data, voice_agents: voiceAgents.data, conversations: conversations.data });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    const { w, client, org } = await voiceWorkspace();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "start_call") return voiceJson(await startVoiceAgentCall(client, org, String(body.voice_agent_id ?? "")));
    const membership = await client.from("organization_members").select("role").eq("organization_id", org).eq("user_id", w.user.id).maybeSingle();
    if (!w.profile.isPlatformAdmin && (membership.error || !["owner", "admin"].includes(membership.data?.role))) throw new VoiceError("forbidden", 403, "Somente administradores da conta podem configurar agentes de voz.");
    if (body.action === "sync") {
      const saved = await syncVoiceAgent(client, {
        organizationId: org, agentRegistryId: String(body.agent_id ?? ""), voiceId: String(body.voice_id ?? ""),
        firstMessage: typeof body.first_message === "string" ? body.first_message : undefined,
        maxDurationSeconds: typeof body.max_duration_seconds === "number" ? body.max_duration_seconds : undefined,
        language: typeof body.language === "string" ? body.language : undefined, userId: w.user.id,
      });
      return voiceJson({ voice_agent: saved });
    }
    if (body.action === "delete") return voiceJson(await deleteVoiceAgent(client, org, String(body.voice_agent_id ?? "")));
    throw new VoiceError("invalid_action", 422, "Ação inválida.");
  } catch (error) { return fail(error); }
}

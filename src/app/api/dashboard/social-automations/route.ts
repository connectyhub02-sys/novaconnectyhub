import { NextResponse } from "next/server";
import { getMetaWorkspace as getCurrentWorkspace } from "@/lib/meta/company-access";
import { requireMetaCompanyAccess as requireClientCompanyAccess } from "@/lib/meta/company-access";
import { createServiceClient } from "@/lib/supabase/service";
import { loadAgentChannelAvailability } from "@/lib/agents/channel-availability-server";
import { normalizeAgentChannelConfig } from "@/lib/agents/multichannel";
import {
  commentAutomationChannel,
  normalizeSocialAutomations,
} from "@/lib/meta/comment-automations";

async function context(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) throw new Error("Sessão obrigatória.");
  const url = new URL(request.url);
  const company = await requireClientCompanyAccess({
    userId: workspace.user.id,
    companyId:
      url.searchParams.get("companyId") || workspace.organization?.id || "",
  });
  const client = createServiceClient();
  const agent = await client
    .from("agent_registry")
    .select("id,metadata,updated_at")
    .eq("organization_id", company.id)
    .eq("scope", "organization")
    .eq("id", url.searchParams.get("agentId") || "")
    .neq("status", "archived")
    .maybeSingle();
  if (agent.error || !agent.data)
    throw new Error("Agente não encontrado nesta empresa.");
  return { client, company, agent: agent.data };
}
export async function GET(request: Request) {
  try {
    const { client, company, agent } = await context(request);
    return NextResponse.json(
      {
        config: normalizeSocialAutomations(agent.metadata?.social_automations),
        availability: await loadAgentChannelAvailability(client, company.id),
        channelConfig: normalizeAgentChannelConfig(
          agent.metadata?.multichannel_config,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar." },
      { status: 403 },
    );
  }
}
export async function PUT(request: Request) {
  try {
    const { client, company, agent } = await context(request);
    const body = await request.json();
    const config = normalizeSocialAutomations(body.config);
    const active = config.rules.filter((rule) => rule.enabled);
    if (active.length || config.followUp?.enabled) {
      const availability = await loadAgentChannelAvailability(
        client,
        company.id,
      );
      const channels = normalizeAgentChannelConfig(
        agent.metadata?.multichannel_config,
      );
      if (config.followUp?.enabled) {
        for (const channel of [
          "instagram_direct",
          "facebook_messenger",
        ] as const) {
          if (
            config.followUp.platform !== "both" &&
            !channel.startsWith(config.followUp.platform)
          )
            continue;
          if (
            !availability[channel].available ||
            !channels.channels[channel].enabled
          )
            throw new Error(
              "Conecte e selecione os canais privados do follow-up em Agentes.",
            );
        }
      }
      for (const rule of active) {
        const channel = commentAutomationChannel(rule);
        if (!availability[channel].available)
          throw new Error(availability[channel].reason);
        if (!channels.channels[channel].enabled)
          throw new Error(
            "Selecione o canal de comentários em Agentes antes de ativar.",
          );
        if (rule.action === "private_message") {
          const direct =
            rule.platform === "instagram"
              ? "instagram_direct"
              : "facebook_messenger";
          if (!availability[direct].available)
            throw new Error(availability[direct].reason);
          if (rule.continueWithAgent && !channels.channels[direct].enabled)
            throw new Error(
              "Selecione Direct/Messenger em Agentes para continuar a conversa.",
            );
        }
      }
    }
    const result = await client
      .from("agent_registry")
      .update({ metadata: { ...agent.metadata, social_automations: config } })
      .eq("id", agent.id)
      .eq("organization_id", company.id)
      .eq("scope", "organization")
      .eq("updated_at", agent.updated_at)
      .select("id")
      .maybeSingle();
    if (result.error || !result.data)
      throw new Error(
        "O agente foi alterado em outra tela. Atualize antes de salvar novamente.",
      );
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar." },
      { status: 400 },
    );
  }
}

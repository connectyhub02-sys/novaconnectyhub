import {
  metaAgentChannelIds,
  normalizeAgentChannelConfig,
  type AgentChannelConfig,
} from "./multichannel";
import {
  readMetaSocialGrantedPermissions,
  resolveMetaSocialDispatchPermissions,
} from "../meta/social-dispatch-policy";

export type AgentChannelAvailability = Record<
  (typeof metaAgentChannelIds)[number],
  { available: boolean; reason: string }
>;

export function evaluateAgentChannelAvailability(input: {
  allowed: boolean;
  connected: boolean;
  hasToken: boolean;
  metadata?: Record<string, unknown> | null;
  scopes?: string[] | null;
}): AgentChannelAvailability {
  const metadata = input.metadata ?? {};
  const permissions = new Set(
    readMetaSocialGrantedPermissions({ metadata, scopes: input.scopes }),
  );
  return Object.fromEntries(
    metaAgentChannelIds.map((channel) => {
      const required = resolveMetaSocialDispatchPermissions(
        channel,
        channel.endsWith("comments")
          ? "public_comment_reply"
          : "direct_message",
      );
      const page =
        metadata.selected_facebook_page_id || metadata.facebook_page_id;
      const instagram =
        metadata.selected_instagram_business_id ||
        metadata.instagram_business_id;
      const reason = !input.allowed
        ? "Seu plano não libera atendimento Meta."
        : !input.connected || !input.hasToken
          ? "Conclua a conexão da Meta em Integrações."
          : !page || (channel.startsWith("instagram") && !instagram)
            ? "Selecione a Página e a conta profissional em Integrações."
            : required.some((permission) => !permissions.has(permission))
              ? "A conexão ainda não possui as permissões de atendimento deste canal."
              : metadata.webhook_activation &&
                  (metadata.webhook_activation as Record<string, unknown>)
                    .ok === true
                ? "Conectado · disponível para selecionar"
                : "Conclua a ativação dos eventos de atendimento em Integrações.";
      return [
        channel,
        {
          available: reason === "Conectado · disponível para selecionar",
          reason,
        },
      ];
    }),
  ) as AgentChannelAvailability;
}

export function assertAgentChannelsAvailable(
  next: AgentChannelConfig,
  previous: unknown,
  availability: AgentChannelAvailability,
) {
  const before = normalizeAgentChannelConfig(previous);
  for (const channel of metaAgentChannelIds) {
    // Disabling and saving unchanged legacy settings remain possible after a disconnection.
    if (
      next.channels[channel].enabled &&
      JSON.stringify(next.channels[channel]) !==
        JSON.stringify(before.channels[channel]) &&
      !availability[channel].available
    ) {
      throw new Error(availability[channel].reason);
    }
  }
}

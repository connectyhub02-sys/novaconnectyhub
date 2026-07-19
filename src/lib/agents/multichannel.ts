export type AgentChannelId =
  | "whatsapp"
  | "instagram_direct"
  | "instagram_comments"
  | "facebook_messenger"
  | "facebook_comments";

export type AgentChannelMode = "primary" | "private" | "public";

export type AgentChannelConfigItem = {
  enabled: boolean;
  mode: AgentChannelMode;
  autoReply: boolean;
  allowPublicReplies: boolean;
  allowPrivateReplies: boolean;
  requiresHumanApproval: boolean;
};

export type AgentChannelConfig = {
  version: 1;
  primaryChannel: "whatsapp";
  channels: Record<AgentChannelId, AgentChannelConfigItem>;
};

export type AgentChannelDefinition = {
  id: AgentChannelId;
  label: string;
  shortLabel: string;
  provider: "uazapi" | "meta";
  surface: "whatsapp" | "instagram" | "facebook";
  mode: AgentChannelMode;
  primary: boolean;
  description: string;
};

export const agentChannelDefinitions: AgentChannelDefinition[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    shortLabel: "WhatsApp",
    provider: "uazapi",
    surface: "whatsapp",
    mode: "primary",
    primary: true,
    description: "Canal principal do agente e base atual do atendimento.",
  },
  {
    id: "instagram_direct",
    label: "Instagram Direct",
    shortLabel: "Direct IG",
    provider: "meta",
    surface: "instagram",
    mode: "private",
    primary: false,
    description: "Conversas privadas iniciadas pelo lead ou por resposta privada permitida pela Meta.",
  },
  {
    id: "instagram_comments",
    label: "Comentarios Instagram",
    shortLabel: "Comentarios IG",
    provider: "meta",
    surface: "instagram",
    mode: "public",
    primary: false,
    description: "Comentarios em posts, reels e anuncios conectados ao Instagram Business.",
  },
  {
    id: "facebook_messenger",
    label: "Facebook Messenger",
    shortLabel: "Messenger",
    provider: "meta",
    surface: "facebook",
    mode: "private",
    primary: false,
    description: "Conversas privadas com leads na pagina do Facebook.",
  },
  {
    id: "facebook_comments",
    label: "Comentarios Facebook",
    shortLabel: "Comentarios FB",
    provider: "meta",
    surface: "facebook",
    mode: "public",
    primary: false,
    description: "Comentarios em posts e anuncios da pagina do Facebook.",
  },
];

export const defaultAgentChannelConfig: AgentChannelConfig = {
  version: 1,
  primaryChannel: "whatsapp",
  channels: {
    whatsapp: {
      enabled: true,
      mode: "primary",
      autoReply: true,
      allowPublicReplies: false,
      allowPrivateReplies: true,
      requiresHumanApproval: false,
    },
    instagram_direct: {
      enabled: false,
      mode: "private",
      autoReply: true,
      allowPublicReplies: false,
      allowPrivateReplies: true,
      requiresHumanApproval: false,
    },
    instagram_comments: {
      enabled: false,
      mode: "public",
      autoReply: false,
      allowPublicReplies: true,
      allowPrivateReplies: true,
      requiresHumanApproval: true,
    },
    facebook_messenger: {
      enabled: false,
      mode: "private",
      autoReply: true,
      allowPublicReplies: false,
      allowPrivateReplies: true,
      requiresHumanApproval: false,
    },
    facebook_comments: {
      enabled: false,
      mode: "public",
      autoReply: false,
      allowPublicReplies: true,
      allowPrivateReplies: true,
      requiresHumanApproval: true,
    },
  },
};

export function normalizeAgentChannelConfig(value: unknown): AgentChannelConfig {
  const record = readRecord(value);
  const channelsRecord = readRecord(record?.channels);
  const channels = { ...defaultAgentChannelConfig.channels };

  for (const definition of agentChannelDefinitions) {
    const configured = readRecord(channelsRecord?.[definition.id]);
    const current = channels[definition.id];

    channels[definition.id] = {
      enabled: definition.id === "whatsapp" ? true : readBoolean(configured?.enabled, current.enabled),
      mode: definition.mode,
      autoReply: readBoolean(configured?.autoReply ?? configured?.auto_reply, current.autoReply),
      allowPublicReplies: readBoolean(configured?.allowPublicReplies ?? configured?.allow_public_replies, current.allowPublicReplies),
      allowPrivateReplies: readBoolean(configured?.allowPrivateReplies ?? configured?.allow_private_replies, current.allowPrivateReplies),
      requiresHumanApproval: readBoolean(configured?.requiresHumanApproval ?? configured?.requires_human_approval, current.requiresHumanApproval),
    };
  }

  return {
    version: 1,
    primaryChannel: "whatsapp",
    channels,
  };
}

export function isAgentChannelEnabled(config: unknown, channelId: AgentChannelId) {
  return normalizeAgentChannelConfig(config).channels[channelId].enabled;
}

export function buildAgentChannelRuntimeInstruction(input: {
  channelId: AgentChannelId;
  config?: unknown;
}) {
  const config = normalizeAgentChannelConfig(input.config);
  const channel = config.channels[input.channelId];
  const definition = agentChannelDefinitions.find((item) => item.id === input.channelId);

  if (!definition || !channel.enabled) {
    return "Este canal nao esta habilitado para atendimento automatico deste agente.";
  }

  if (definition.id === "whatsapp") {
    return "Canal atual: WhatsApp. Mantenha o atendimento comercial natural, direto e consistente com o prompt principal do agente.";
  }

  if (definition.mode === "public") {
    return [
      `Canal atual: ${definition.label}.`,
      "A conversa acontece em comentario publico: seja breve, nao exponha dados pessoais, nao invente contexto privado e convide para conversa privada quando precisar continuar.",
      channel.allowPrivateReplies
        ? "Quando a politica da Meta permitir resposta privada, voce pode sugerir continuidade no direct/mensagem privada."
        : "Nao inicie resposta privada neste canal sem autorizacao da configuracao.",
      channel.requiresHumanApproval
        ? "Respostas publicas devem passar por aprovacao humana quando houver duvida, reclamacao, preco sensivel ou risco de exposicao."
        : "Responda com cuidado e registre o historico no CRM.",
    ].join(" ");
  }

  return [
    `Canal atual: ${definition.label}.`,
    "A conversa e privada: continue o atendimento comercial com naturalidade, respeitando a janela de mensagens e as politicas da Meta.",
    "Use o mesmo prompt principal, memoria do lead e regras da empresa aplicados ao WhatsApp.",
  ].join(" ");
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

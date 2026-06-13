import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { listWhatsappAudioVoices, type WhatsappAudioVoiceState } from "@/lib/elevenlabs/voices";
import {
  leadQualificationConfigKey,
  normalizeLeadQualificationConfig,
} from "@/lib/leads/qualification";
import { decryptCredentialValue, encryptCredentialValue, previewCredentialValue } from "@/lib/security/credentials-crypto";
import {
  defaultWhatsappAgentPrompt,
  defaultWhatsappBehaviorConfig,
  defaultWhatsappGlobalPrompt,
  normalizeWhatsappBehaviorConfig,
} from "@/lib/whatsapp/agent-behavior";
import type { ClientKnowledgeFile, ClientTrackedLinkButton, ClientWhatsappActionResult, ClientWhatsappState } from "@/lib/whatsapp/client-workspace";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";
import { createServiceClient } from "@/lib/supabase/service";
import { createPlatformWhatsappAgent } from "./platform-whatsapp-agents";

type JsonRecord = Record<string, unknown>;

export type PlatformWhatsappConsoleEntity = {
  id: string;
  name: string;
  slug: string | null;
  planCode: string;
  status: string;
  role: string;
  createdAt: string | null;
};

export type PlatformWhatsappConsoleState = ClientWhatsappState & {
  companies: PlatformWhatsappConsoleEntity[];
  selectedCompanyId: string | null;
};

type SectorRow = {
  id: string;
  sector_code: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string | null;
};

type AgentRow = {
  id: string;
  prompt: string | null;
  persona_name: string | null;
  name: string;
  avatar_url: string | null;
  avatar_alt: string | null;
  updated_at: string | null;
  metadata: JsonRecord | null;
};

type PlatformOrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  plan_code: string;
  status: string;
};

type WhatsappStatus = "draft" | "qr_pending" | "connected" | "disconnected" | "blocked" | "error" | "archived";

type WhatsappInstanceRow = {
  id: string;
  organization_id: string;
  owner_user_id: string | null;
  provider: string;
  provider_instance_id: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: WhatsappStatus;
  qr_status: string | null;
  instance_token_preview: string | null;
  instance_token_encrypted: string | null;
  webhook_url: string | null;
  webhook_configured_at: string | null;
  last_synced_at: string | null;
  last_heartbeat_at: string | null;
  last_message_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  metadata: JsonRecord | null;
  updated_at: string;
};

type KnowledgeMemoryRow = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  metadata: JsonRecord | null;
  created_at: string | null;
};

const maxPromptLength = 8000;
const fallbackVoiceOrganizationId = "00000000-0000-4000-8000-000000000000";
const platformWhatsappOrganizationSlug = "connectyhub-platform-whatsapp";
const whatsappInstanceSelectColumns = "id, organization_id, owner_user_id, provider, provider_instance_id, phone_number, display_name, status, qr_status, instance_token_preview, instance_token_encrypted, webhook_url, webhook_configured_at, last_synced_at, last_heartbeat_at, last_message_at, connected_at, disconnected_at, metadata, updated_at";

export async function getPlatformWhatsappConsoleState(input: {
  sectorId?: string | null;
  userId: string;
  voiceOrganizationId?: string | null;
  client?: SupabaseClient;
}): Promise<PlatformWhatsappConsoleState> {
  const client = input.client ?? createServiceClient();
  const sectors = await listPlatformWhatsappSectors(client);
  const selectedSector = selectSector(sectors, input.sectorId);

  if (!selectedSector) {
    return buildUnavailableState();
  }

  const [agent, rawInstance, knowledgeFiles, linkButtons, audio] = await Promise.all([
    getSectorWhatsappAgent(client, selectedSector.id),
    getSectorWhatsappInstance(client, selectedSector.id),
    listSectorKnowledge(client, selectedSector.id),
    listSectorLinkButtons(client, selectedSector.id),
    listWhatsappAudioVoices({ organizationId: input.voiceOrganizationId || fallbackVoiceOrganizationId, client }),
  ]);

  const instance = rawInstance?.instance_token_encrypted && rawInstance.status !== "connected"
    ? await syncInstanceStatusFromProvider(client, rawInstance).catch(() => rawInstance)
    : rawInstance;

  return {
    ...buildState(instance, agent, getBehaviorConfig(agent, instance), audio, knowledgeFiles, linkButtons),
    companies: sectors.map(mapSectorEntity),
    selectedCompanyId: selectedSector.id,
  };
}

export async function createPlatformWhatsappConsoleAgent(input: {
  sectorId: string;
  name: string;
  roleTitle?: string;
  prompt?: string;
  userId: string;
  voiceOrganizationId?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  await createPlatformWhatsappAgent({
    sectorId: input.sectorId,
    name: input.name,
    roleTitle: input.roleTitle,
    prompt: input.prompt,
    userId: input.userId,
    client,
  });

  revalidateWhatsappAdmin();
  return getPlatformWhatsappConsoleState({
    sectorId: input.sectorId,
    userId: input.userId,
    voiceOrganizationId: input.voiceOrganizationId,
    client,
  });
}

export async function updatePlatformWhatsappConsoleSettings(input: {
  sectorId: string;
  userId: string;
  agentPrompt?: string;
  behavior?: unknown;
  qualificationConfig?: unknown;
  voiceOrganizationId?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const sector = await requirePlatformWhatsappSector(client, input.sectorId);
  const [agent, instance] = await Promise.all([
    getSectorWhatsappAgent(client, sector.id),
    getSectorWhatsappInstance(client, sector.id),
  ]);

  if (!agent) {
    throw new Error("Crie o agente do setor antes de salvar prompt e comportamento.");
  }

  const agentPrompt = input.agentPrompt?.trim();
  const hasAgentPrompt = typeof input.agentPrompt === "string";

  if (hasAgentPrompt && !agentPrompt) {
    throw new Error("O prompt do agente nao pode ficar vazio.");
  }

  if (agentPrompt && agentPrompt.length > maxPromptLength) {
    throw new Error(`O prompt pode ter no maximo ${maxPromptLength} caracteres.`);
  }

  const currentBehavior = getBehaviorConfig(agent, instance);
  const nextBehavior = normalizeWhatsappBehaviorConfig(input.behavior ?? currentBehavior);
  const nextQualificationConfig = input.qualificationConfig !== undefined
    ? normalizeLeadQualificationConfig(input.qualificationConfig)
    : normalizeLeadQualificationConfig(readRecord(agent.metadata)?.[leadQualificationConfigKey]);
  const now = new Date().toISOString();
  const nextPrompt = hasAgentPrompt ? agentPrompt! : agent.prompt?.trim() || defaultWhatsappAgentPrompt;
  const nextVersion = hasAgentPrompt ? await getNextPromptVersion(client, agent.id) : null;
  const metadata = {
    ...(agent.metadata ?? {}),
    whatsapp_behavior_config: nextBehavior,
    [leadQualificationConfigKey]: nextQualificationConfig,
    prompt_control: {
      last_updated_at: now,
      last_updated_by: input.userId,
      previous_length: agent.prompt?.length ?? 0,
      current_length: nextPrompt.length,
      source: "admin_whatsapp_internal",
    },
  };

  const { error } = await client
    .from("agent_registry")
    .update({
      prompt: nextPrompt,
      status: "needs_review",
      metadata,
    })
    .eq("id", agent.id);

  if (error) {
    throw new Error(`Nao foi possivel salvar o agente: ${error.message}`);
  }

  if (nextVersion) {
    await client.from("agent_prompt_versions").insert({
      agent_id: agent.id,
      version_number: nextVersion,
      prompt: nextPrompt,
      change_note: "Atualizado no WhatsApp interno do Admin OS",
      created_by: input.userId,
    });
  }

  if (instance) {
    await client
      .from("whatsapp_instances")
      .update({
        metadata: {
          ...(instance.metadata ?? {}),
          behavior_config: nextBehavior,
          behavior_updated_at: now,
          behavior_updated_by: input.userId,
        },
      })
      .eq("id", instance.id);
  }

  revalidateWhatsappAdmin();
  return getPlatformWhatsappConsoleState({
    sectorId: sector.id,
    userId: input.userId,
    voiceOrganizationId: input.voiceOrganizationId,
    client,
  });
}

export async function connectPlatformWhatsappConsole(input: {
  sectorId: string;
  userId: string;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const sector = await requirePlatformWhatsappSector(client, input.sectorId);
  const agent = await requireSectorWhatsappAgent(client, sector.id);
  const existing = await getSectorWhatsappInstance(client, sector.id);
  let instance = existing?.instance_token_encrypted
    ? existing
    : existing?.provider_instance_id
      ? await recoverProviderInstanceToken(client, credentials, existing) ?? await createPlatformProviderInstance(client, credentials, sector, input.userId, agent)
      : await createPlatformProviderInstance(client, credentials, sector, input.userId, agent);
  let token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("A instancia interna existe, mas o token seguro nao esta disponivel. Gere uma nova conexao.");
  }

  let connectResult = await callUazapi(credentials, "/instance/connect", {
    method: "POST",
    token,
    body: {
      browser: "auto",
      systemName: `ConnectyHub Interno - ${sector.name}`,
    },
    tolerateError: true,
  });

  if (!connectResult.ok && isInvalidInstanceTokenResponse(connectResult)) {
    await markPlatformInstanceDisconnected(client, instance, {
      action: "connect_invalid_token",
      clearToken: true,
      providerData: connectResult.data,
      reason: "invalid_instance_token",
    });

    instance = await createPlatformProviderInstance(client, credentials, sector, input.userId, agent);
    token = decryptInstanceToken(instance);

    if (!token) {
      throw new Error("A nova instancia interna foi criada, mas o token seguro nao esta disponivel.");
    }

    connectResult = await callUazapi(credentials, "/instance/connect", {
      method: "POST",
      token,
      body: {
        browser: "auto",
        systemName: `ConnectyHub Interno - ${sector.name}`,
      },
      tolerateError: true,
    });
  }

  if (!connectResult.ok) {
    throw new Error(readProviderError(connectResult.data) ?? `Uazapi respondeu status ${connectResult.status}.`);
  }

  const status = normalizeWhatsappStatus(findString(connectResult.data, ["status", "state", "connectionStatus"]) ?? "qr_pending");
  const qrCode = normalizeQrCode(findString(connectResult.data, ["qrcode", "qrCode", "qr", "base64"]));
  const phoneNumber = normalizePhone(findString(connectResult.data, ["owner", "phone", "number", "phone_number"]) ?? instance.phone_number);
  const profileData = status === "connected" ? await getConnectedProfileData(credentials, token) : null;
  const avatarData = status === "connected" && phoneNumber ? await getConnectedAvatarData(credentials, token, phoneNumber) : null;
  const displayName = findString(connectResult.data, ["profileName", "displayName", "name"]) ?? findString(profileData, ["profileName", "displayName", "businessName", "name"]) ?? instance.display_name;
  const profileImageUrl = extractProfileImageUrl(connectResult.data) ?? extractProfileImageUrl(profileData) ?? extractProfileImageUrl(avatarData) ?? readProfileImageUrl(instance);
  const now = new Date().toISOString();
  const webhookResult = await configurePlatformWebhook(credentials, token, instance.provider_instance_id);

  await client
    .from("whatsapp_instances")
    .update({
      status: qrCode ? "qr_pending" : status,
      qr_status: qrCode ? "available" : null,
      phone_number: phoneNumber,
      display_name: displayName,
      connected_at: status === "connected" ? now : instance.connected_at,
      disconnected_at: null,
      webhook_url: credentials.webhookUrl,
      webhook_configured_at: webhookResult.ok ? now : instance.webhook_configured_at,
      last_synced_at: now,
      metadata: {
        ...(instance.metadata ?? {}),
        ...buildPlatformInstanceMetadata(sector, agent),
        ...(profileImageUrl ? { profile_image_url: profileImageUrl, profile_image_synced_at: now } : {}),
        webhook_status: webhookResult.ok ? "configured" : "not_configured",
        webhook_error: webhookResult.ok ? null : webhookResult.reason,
        last_platform_action: "connect",
        last_connect_response: sanitizeProviderData(connectResult.data),
        ...(profileData ? { last_profile_response: sanitizeProviderData(profileData) } : {}),
        ...(avatarData ? { last_avatar_response: sanitizeProviderData(avatarData) } : {}),
      },
    })
    .eq("id", instance.id);

  revalidateWhatsappAdmin();
  const state = await getPlatformWhatsappConsoleState({ sectorId: sector.id, userId: input.userId, client });

  return {
    state,
    notice: {
      tone: qrCode ? "warning" : "success",
      message: qrCode ? "Escaneie o QR Code para concluir a conexao interna." : "WhatsApp interno conectado ou em processo de conexao.",
    },
    qrCode,
    pairCode: null,
  };
}

export async function refreshPlatformWhatsappConsoleStatus(input: {
  sectorId: string;
  userId: string;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const sector = await requirePlatformWhatsappSector(client, input.sectorId);
  const instance = await requireSectorWhatsappInstance(client, sector.id);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("Conexao interna sem token seguro. Gere um novo QR Code.");
  }

  const result = await callUazapi(credentials, "/instance/status", { method: "GET", token, tolerateError: true });

  if (!result.ok) {
    if (isInvalidInstanceTokenResponse(result)) {
      await markPlatformInstanceDisconnected(client, instance, {
        action: "refresh_invalid_token",
        clearToken: true,
        providerData: result.data,
        reason: "invalid_instance_token",
      });

      revalidateWhatsappAdmin();
      const state = await getPlatformWhatsappConsoleState({ sectorId: sector.id, userId: input.userId, client });

      return {
        state,
        notice: {
          tone: "warning",
          message: "WhatsApp interno desconectado. Gere um novo QR Code para reconectar.",
        },
        qrCode: null,
        pairCode: null,
      };
    }

    throw new Error(readProviderError(result.data) ?? `Uazapi respondeu status ${result.status}.`);
  }

  const status = normalizeWhatsappStatus(findString(result.data, ["status", "state", "connectionStatus"]));
  const phoneNumber = normalizePhone(findString(result.data, ["owner", "phone", "number", "phone_number"]) ?? instance.phone_number);
  const profileData = status === "connected" ? await getConnectedProfileData(credentials, token) : null;
  const avatarData = status === "connected" && phoneNumber ? await getConnectedAvatarData(credentials, token, phoneNumber) : null;
  const displayName = findString(result.data, ["profileName", "displayName", "name"]) ?? findString(profileData, ["profileName", "displayName", "businessName", "name"]) ?? instance.display_name;
  const profileImageUrl = extractProfileImageUrl(result.data) ?? extractProfileImageUrl(profileData) ?? extractProfileImageUrl(avatarData) ?? readProfileImageUrl(instance);
  const now = new Date().toISOString();
  const webhookResult = status === "connected" ? await configurePlatformWebhook(credentials, token, instance.provider_instance_id) : null;

  await client
    .from("whatsapp_instances")
    .update({
      status,
      phone_number: phoneNumber,
      display_name: displayName,
      connected_at: status === "connected" ? instance.connected_at ?? now : instance.connected_at,
      disconnected_at: status === "disconnected" ? now : instance.disconnected_at,
      webhook_url: status === "connected" ? credentials.webhookUrl : instance.webhook_url,
      webhook_configured_at: webhookResult?.ok ? now : instance.webhook_configured_at,
      last_heartbeat_at: now,
      last_synced_at: now,
      metadata: {
        ...(instance.metadata ?? {}),
        ...(profileImageUrl ? { profile_image_url: profileImageUrl, profile_image_synced_at: now } : {}),
        ...(webhookResult
          ? {
              webhook_status: webhookResult.ok ? "configured" : "not_configured",
              webhook_error: webhookResult.ok ? null : webhookResult.reason,
            }
          : {}),
        last_platform_action: "refresh_status",
        last_status_response: sanitizeProviderData(result.data),
        ...(profileData ? { last_profile_response: sanitizeProviderData(profileData) } : {}),
        ...(avatarData ? { last_avatar_response: sanitizeProviderData(avatarData) } : {}),
      },
    })
    .eq("id", instance.id);

  revalidateWhatsappAdmin();
  const state = await getPlatformWhatsappConsoleState({ sectorId: sector.id, userId: input.userId, client });

  return {
    state,
    notice: {
      tone: state.instance?.status === "connected" ? "success" : "warning",
      message: state.instance?.status === "connected" ? "WhatsApp interno conectado." : "Status atualizado. Conexao interna ainda nao esta ativa.",
    },
    qrCode: null,
    pairCode: null,
  };
}

export async function disconnectPlatformWhatsappConsole(input: {
  sectorId: string;
  userId: string;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const sector = await requirePlatformWhatsappSector(client, input.sectorId);
  const instance = await requireSectorWhatsappInstance(client, sector.id);
  const token = decryptInstanceToken(instance);

  if (!token) {
    await markPlatformInstanceDisconnected(client, instance, {
      action: "disconnect_missing_token",
      clearToken: true,
      reason: "missing_local_token",
    });

    revalidateWhatsappAdmin();
    const state = await getPlatformWhatsappConsoleState({ sectorId: sector.id, userId: input.userId, client });

    return {
      state,
      notice: { tone: "warning", message: "WhatsApp interno marcado como desconectado. Gere um novo QR Code para reconectar." },
      qrCode: null,
      pairCode: null,
    };
  }

  const result = await callUazapi(credentials, "/instance/disconnect", { method: "POST", token, tolerateError: true });

  if (!result.ok && !isInvalidInstanceTokenResponse(result)) {
    throw new Error(readProviderError(result.data) ?? `Uazapi respondeu status ${result.status}.`);
  }

  const tokenInvalid = !result.ok && isInvalidInstanceTokenResponse(result);

  await markPlatformInstanceDisconnected(client, instance, {
    action: tokenInvalid ? "disconnect_invalid_token" : "disconnect",
    clearToken: tokenInvalid,
    providerData: result.data,
    reason: tokenInvalid ? "invalid_instance_token" : "manual_disconnect",
  });

  revalidateWhatsappAdmin();
  const state = await getPlatformWhatsappConsoleState({ sectorId: sector.id, userId: input.userId, client });

  return {
    state,
    notice: {
      tone: "warning",
      message: tokenInvalid
        ? "A sessao interna ja estava desconectada no provedor. Gere um novo QR Code para reconectar."
        : "WhatsApp interno desconectado.",
    },
    qrCode: null,
    pairCode: null,
  };
}

export async function requirePlatformWhatsappSector(client: SupabaseClient, sectorId: string) {
  const id = sectorId.trim();

  if (!id) {
    throw new Error("Escolha um setor da ConnectyHub.");
  }

  const { data, error } = await client
    .from("platform_whatsapp_sectors")
    .select("id, sector_code, name, description, status, created_at")
    .or(`id.eq.${id},sector_code.eq.${id}`)
    .neq("status", "archived")
    .maybeSingle<SectorRow>();

  if (error) {
    throw new Error(formatSectorTableError(`Nao foi possivel carregar o setor: ${error.message}`));
  }

  if (!data) {
    throw new Error("Escolha um setor ativo da ConnectyHub.");
  }

  return data;
}

export function mapKnowledgeFile(row: KnowledgeMemoryRow): ClientKnowledgeFile {
  const metadata = readRecord(row.metadata) ?? {};

  return {
    id: row.id,
    title: row.title,
    fileName: readString(metadata.file_name) ?? row.title,
    contentType: readString(metadata.content_type),
    size: readNumber(metadata.size),
    storageUrl: readString(metadata.storage_url),
    createdAt: row.created_at,
  };
}

export function mapTrackedLinkButton(row: KnowledgeMemoryRow): ClientTrackedLinkButton {
  const metadata = readRecord(row.metadata) ?? {};

  return {
    id: row.id,
    label: readString(metadata.label) ?? row.title,
    url: readString(metadata.url) ?? row.content,
    tag: readString(metadata.tag) ?? `{{link_${row.id.slice(0, 8)}}}`,
    trackingUrl: readString(metadata.tracking_url) ?? "",
    clicks: readNumber(metadata.click_count) ?? 0,
    createdAt: row.created_at,
  };
}

function buildState(
  instance: WhatsappInstanceRow | null,
  agent: AgentRow | null,
  behavior: ReturnType<typeof normalizeWhatsappBehaviorConfig>,
  audio: WhatsappAudioVoiceState,
  knowledgeFiles: ClientKnowledgeFile[],
  linkButtons: ClientTrackedLinkButton[],
): ClientWhatsappState {
  const agentPrompt = agent?.prompt?.trim() || defaultWhatsappAgentPrompt;
  const profileImageUrl = readProfileImageUrl(instance);

  return {
    instance: instance
      ? {
          id: instance.id,
          provider: "uazapi",
          status: instance.status,
          phoneNumber: instance.phone_number,
          displayName: instance.display_name,
          profileImageUrl,
          connectedAt: instance.connected_at,
          disconnectedAt: instance.disconnected_at,
          lastSyncedAt: instance.last_synced_at,
          lastHeartbeatAt: instance.last_heartbeat_at,
          lastMessageAt: instance.last_message_at,
          tokenReady: Boolean(instance.instance_token_encrypted),
        }
      : null,
    agent: agent
      ? {
          id: agent.id,
          name: agent.persona_name?.trim() || agent.name,
          avatarUrl: agent.avatar_url,
          avatarAlt: agent.avatar_alt,
          prompt: agentPrompt,
          promptPreview: preview(agentPrompt),
          qualification: normalizeLeadQualificationConfig(readRecord(agent.metadata)?.[leadQualificationConfigKey]),
          updatedAt: agent.updated_at,
        }
      : null,
    globalAgent: {
      id: agent?.id ?? "pending-platform-whatsapp-agent",
      name: agent?.persona_name?.trim() || agent?.name || "Agente WhatsApp interno",
      prompt: defaultWhatsappGlobalPrompt,
      promptPreview: preview(defaultWhatsappGlobalPrompt),
      updatedAt: agent?.updated_at ?? null,
    },
    behavior,
    audio,
    knowledge: {
      files: knowledgeFiles,
    },
    linkButtons,
    capability: {
      canConnect: Boolean(agent),
      schemaReady: true,
      message: agent ? null : "Crie o agente do setor antes de conectar o WhatsApp interno.",
    },
  };
}

async function listPlatformWhatsappSectors(client: SupabaseClient) {
  const { data, error } = await client
    .from("platform_whatsapp_sectors")
    .select("id, sector_code, name, description, status, created_at")
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(formatSectorTableError(`Nao foi possivel carregar os setores: ${error.message}`));
  }

  return (data ?? []) as SectorRow[];
}

function selectSector(sectors: SectorRow[], sectorId: string | null | undefined) {
  if (!sectorId) {
    return sectors[0] ?? null;
  }

  return sectors.find((sector) => sector.id === sectorId || sector.sector_code === sectorId) ?? sectors[0] ?? null;
}

async function getSectorWhatsappAgent(client: SupabaseClient, sectorId: string): Promise<AgentRow | null> {
  const { data, error } = await client
    .from("agent_registry")
    .select("id, prompt, persona_name, name, avatar_url, avatar_alt, updated_at, metadata")
    .eq("scope", "platform")
    .is("organization_id", null)
    .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp", sector_id: sectorId })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<AgentRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar o agente WhatsApp interno: ${error.message}`);
  }

  return data ?? null;
}

async function requireSectorWhatsappAgent(client: SupabaseClient, sectorId: string) {
  const agent = await getSectorWhatsappAgent(client, sectorId);

  if (!agent) {
    throw new Error("Crie o agente do setor antes de gerar o QR Code interno.");
  }

  return agent;
}

async function getSectorWhatsappInstance(client: SupabaseClient, sectorId: string): Promise<WhatsappInstanceRow | null> {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select(whatsappInstanceSelectColumns)
    .eq("provider", "uazapi")
    .contains("metadata", { admin_whatsapp: true, sector_id: sectorId })
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsappInstanceRow>();

  if (error) {
    if (error.message.includes("instance_token_encrypted")) {
      return null;
    }

    throw new Error(`Nao foi possivel carregar a instancia WhatsApp interna: ${error.message}`);
  }

  return data ?? null;
}

async function requireSectorWhatsappInstance(client: SupabaseClient, sectorId: string) {
  const instance = await getSectorWhatsappInstance(client, sectorId);

  if (!instance) {
    throw new Error("Gere um QR Code antes de executar esta acao.");
  }

  return instance;
}

async function createPlatformProviderInstance(
  client: SupabaseClient,
  credentials: UazapiCredentials,
  sector: SectorRow,
  userId: string,
  agent: AgentRow,
) {
  const organization = await getOrCreatePlatformWhatsappOrganization(client, userId);
  const now = new Date().toISOString();
  const name = buildProviderInstanceName(sector);

  const existingInProvider = await findProviderInstanceByName(credentials, name);
  if (existingInProvider) {
    return await upsertRecoveredInstance(client, credentials, existingInProvider, organization, sector, agent, userId, now);
  }

  const result = await callUazapi(credentials, "/instance/create", {
    method: "POST",
    admin: true,
    body: {
      name,
      systemName: `ConnectyHub Interno - ${sector.name}`,
      adminField01: organization.id,
      adminField02: sector.id,
    },
  });
  const providerInstanceId = findString(result.data, ["id", "instance_id", "instanceId", "instanceid"]);
  const token = findString(result.data, ["token", "instanceToken", "instance_token"]);
  const profileImageUrl = extractProfileImageUrl(result.data);

  if (!providerInstanceId || !token) {
    throw new Error("A Uazapi nao retornou id/token da instancia interna. Verifique as credenciais no Admin OS.");
  }

  const webhookResult = await configurePlatformWebhook(credentials, token, providerInstanceId);
  const payload = {
    organization_id: organization.id,
    owner_user_id: userId,
    provider: "uazapi",
    provider_instance_id: providerInstanceId,
    phone_number: normalizePhone(findString(result.data, ["owner", "phone", "number", "phone_number"])),
    display_name: findString(result.data, ["profileName", "displayName", "name"]) ?? `ConnectyHub - ${sector.name}`,
    status: "draft" as WhatsappStatus,
    qr_status: null,
    instance_token_preview: previewCredentialValue(token, "secret"),
    instance_token_encrypted: encryptCredentialValue(token),
    webhook_url: credentials.webhookUrl,
    webhook_configured_at: webhookResult.ok ? now : null,
    last_synced_at: now,
    plan_code: "internal",
    created_by: userId,
    metadata: {
      ...buildPlatformInstanceMetadata(sector, agent),
      provider_name: name,
      behavior_config: getBehaviorConfig(agent, null),
      ...(profileImageUrl ? { profile_image_url: profileImageUrl, profile_image_synced_at: now } : {}),
      webhook_status: webhookResult.ok ? "configured" : "not_configured",
      webhook_error: webhookResult.ok ? null : webhookResult.reason,
      create_response: sanitizeProviderData(result.data),
    },
  };

  const { data: existing, error: existingError } = await client
    .from("whatsapp_instances")
    .select("id")
    .eq("provider", "uazapi")
    .eq("provider_instance_id", providerInstanceId)
    .maybeSingle<{ id: string }>();

  if (existingError) {
    throw new Error(`Nao foi possivel verificar a instancia WhatsApp interna: ${existingError.message}`);
  }

  const query = existing
    ? client
        .from("whatsapp_instances")
        .update(payload)
        .eq("id", existing.id)
    : client
        .from("whatsapp_instances")
        .insert(payload);

  const { data, error } = await query
    .select(whatsappInstanceSelectColumns)
    .single<WhatsappInstanceRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar a instancia WhatsApp interna.");
  }

  await client
    .from("whatsapp_instances")
    .update({ status: "archived", metadata: { archived_reason: "replaced_by_new_instance", replaced_by: data.id, archived_at: now } })
    .eq("provider", "uazapi")
    .contains("metadata", { admin_whatsapp: true, sector_id: sector.id })
    .neq("id", data.id)
    .neq("status", "archived");

  return data;
}

async function findProviderInstanceByName(
  credentials: UazapiCredentials,
  name: string,
): Promise<Record<string, unknown> | null> {
  const response = await callUazapi(credentials, "/instance/all", {
    method: "GET",
    admin: true,
    tolerateError: true,
  });

  if (!response.ok || !response.data) return null;

  const instances = Array.isArray(response.data)
    ? response.data
    : Array.isArray((response.data as Record<string, unknown>)?.instances)
      ? (response.data as Record<string, unknown>).instances as unknown[]
      : [];

  const match = instances.find((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    const itemName = record.name ?? record.instanceName ?? record.instance_name;
    return typeof itemName === "string" && itemName === name;
  }) as Record<string, unknown> | undefined;

  return match ?? null;
}

async function upsertRecoveredInstance(
  client: SupabaseClient,
  credentials: UazapiCredentials,
  providerData: Record<string, unknown>,
  organization: PlatformOrganizationRow,
  sector: SectorRow,
  agent: AgentRow,
  userId: string,
  now: string,
): Promise<WhatsappInstanceRow> {
  const providerInstanceId = findString(providerData, ["id", "instance_id", "instanceId", "instanceid"]);
  const token = findString(providerData, ["token", "instanceToken", "instance_token"]);
  const profileImageUrl = extractProfileImageUrl(providerData);

  if (!providerInstanceId || !token) {
    throw new Error("Instancia encontrada na Uazapi mas sem id/token valido.");
  }

  const webhookResult = await configurePlatformWebhook(credentials, token, providerInstanceId);
  const payload = {
    organization_id: organization.id,
    owner_user_id: userId,
    provider: "uazapi",
    provider_instance_id: providerInstanceId,
    phone_number: normalizePhone(findString(providerData, ["owner", "phone", "number", "phone_number"])),
    display_name: findString(providerData, ["profileName", "displayName", "name"]) ?? `ConnectyHub - ${sector.name}`,
    status: "draft" as WhatsappStatus,
    qr_status: null,
    instance_token_preview: previewCredentialValue(token, "secret"),
    instance_token_encrypted: encryptCredentialValue(token),
    webhook_url: credentials.webhookUrl,
    webhook_configured_at: webhookResult.ok ? now : null,
    last_synced_at: now,
    plan_code: "internal",
    created_by: userId,
    metadata: {
      ...buildPlatformInstanceMetadata(sector, agent),
      provider_name: findString(providerData, ["name", "instanceName", "instance_name"]),
      behavior_config: getBehaviorConfig(agent, null),
      ...(profileImageUrl ? { profile_image_url: profileImageUrl, profile_image_synced_at: now } : {}),
      webhook_status: webhookResult.ok ? "configured" : "not_configured",
      webhook_error: webhookResult.ok ? null : webhookResult.reason,
      recovered_from_provider: true,
      recovered_at: now,
    },
  };

  const { data: existing, error: existingError } = await client
    .from("whatsapp_instances")
    .select("id")
    .eq("provider", "uazapi")
    .eq("provider_instance_id", providerInstanceId)
    .maybeSingle<{ id: string }>();

  if (existingError) {
    throw new Error(`Nao foi possivel verificar a instancia WhatsApp interna: ${existingError.message}`);
  }

  const query = existing
    ? client.from("whatsapp_instances").update(payload).eq("id", existing.id)
    : client.from("whatsapp_instances").insert(payload);

  const { data, error } = await query
    .select(whatsappInstanceSelectColumns)
    .single<WhatsappInstanceRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar a instancia recuperada.");
  }

  await client
    .from("whatsapp_instances")
    .update({ status: "archived", metadata: { archived_reason: "replaced_by_recovered_instance", replaced_by: data.id, archived_at: now } })
    .eq("provider", "uazapi")
    .contains("metadata", { admin_whatsapp: true, sector_id: sector.id })
    .neq("id", data.id)
    .neq("status", "archived");

  return data;
}

async function recoverProviderInstanceToken(
  client: SupabaseClient,
  credentials: UazapiCredentials,
  instance: WhatsappInstanceRow,
): Promise<WhatsappInstanceRow | null> {
  const response = await callUazapi(credentials, "/instance/all", {
    method: "GET",
    admin: true,
    tolerateError: true,
  });

  if (!response.ok || !response.data) {
    return null;
  }

  const instances = Array.isArray(response.data)
    ? response.data
    : Array.isArray((response.data as Record<string, unknown>)?.instances)
      ? (response.data as Record<string, unknown>).instances as unknown[]
      : [];

  const match = instances.find((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    const id = record.id ?? record.instance_id ?? record.instanceId;
    return typeof id === "string" && id === instance.provider_instance_id;
  }) as Record<string, unknown> | undefined;

  if (!match) {
    return null;
  }

  const token = findString(match, ["token", "instanceToken", "instance_token"]);

  if (!token) {
    return null;
  }

  const now = new Date().toISOString();
  const { data, error } = await client
    .from("whatsapp_instances")
    .update({
      instance_token_preview: previewCredentialValue(token, "secret"),
      instance_token_encrypted: encryptCredentialValue(token),
      last_synced_at: now,
      metadata: {
        ...(instance.metadata ?? {}),
        token_recovered_at: now,
        token_recovery_source: "uazapi_admin_api",
      },
    })
    .eq("id", instance.id)
    .select(whatsappInstanceSelectColumns)
    .single<WhatsappInstanceRow>();

  if (error || !data) {
    return null;
  }

  return data;
}

async function getOrCreatePlatformWhatsappOrganization(client: SupabaseClient, userId: string) {
  const select = "id, name, slug, plan_code, status";
  const { data: existing, error: existingError } = await client
    .from("organizations")
    .select(select)
    .eq("slug", platformWhatsappOrganizationSlug)
    .maybeSingle<PlatformOrganizationRow>();

  if (existingError) {
    throw new Error(`Nao foi possivel carregar a organizacao tecnica da ConnectyHub: ${existingError.message}`);
  }

  if (existing) {
    return existing;
  }

  const { data, error } = await client
    .from("organizations")
    .insert({
      name: "ConnectyHub Interno",
      slug: platformWhatsappOrganizationSlug,
      owner_id: userId,
      plan_code: "internal",
      status: "active",
    })
    .select(select)
    .single<PlatformOrganizationRow>();

  if (!error && data) {
    return data;
  }

  if (error?.code === "23505") {
    const { data: createdByRace, error: raceError } = await client
      .from("organizations")
      .select(select)
      .eq("slug", platformWhatsappOrganizationSlug)
      .maybeSingle<PlatformOrganizationRow>();

    if (!raceError && createdByRace) {
      return createdByRace;
    }
  }

  throw new Error(error?.message ?? "Nao foi possivel criar a organizacao tecnica da ConnectyHub.");
}

async function markPlatformInstanceDisconnected(
  client: SupabaseClient,
  instance: WhatsappInstanceRow,
  input: {
    action: string;
    clearToken?: boolean;
    providerData?: unknown;
    reason: string;
  },
) {
  const now = new Date().toISOString();
  const metadata: JsonRecord = {
    ...(instance.metadata ?? {}),
    connection_loss_reason: input.reason,
    connection_loss_synced_at: now,
    last_platform_action: input.action,
    ...(input.providerData !== undefined ? { last_disconnect_response: sanitizeProviderData(input.providerData) } : {}),
    ...(input.clearToken
      ? {
          token_invalidated_at: now,
          token_status: "invalid",
        }
      : {}),
  };

  const { error } = await client
    .from("whatsapp_instances")
    .update({
      status: "disconnected",
      qr_status: null,
      disconnected_at: now,
      last_heartbeat_at: now,
      last_synced_at: now,
      ...(input.clearToken
        ? {
            instance_token_encrypted: null,
            instance_token_preview: null,
          }
        : {}),
      metadata,
    })
    .eq("id", instance.id);

  if (error) {
    throw new Error(`Nao foi possivel atualizar a conexao WhatsApp interna: ${error.message}`);
  }
}

async function listSectorKnowledge(client: SupabaseClient, sectorId: string) {
  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, title, content, tags, metadata, created_at")
    .eq("scope", "platform")
    .is("organization_id", null)
    .eq("memory_type", "knowledge_file")
    .contains("metadata", { admin_whatsapp: true, sector_id: sectorId })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Nao foi possivel carregar os arquivos do setor: ${error.message}`);
  }

  return ((data ?? []) as KnowledgeMemoryRow[]).map(mapKnowledgeFile);
}

async function listSectorLinkButtons(client: SupabaseClient, sectorId: string) {
  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, title, content, tags, metadata, created_at")
    .eq("scope", "platform")
    .is("organization_id", null)
    .eq("memory_type", "tracked_link_button")
    .contains("metadata", { admin_whatsapp: true, sector_id: sectorId })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Nao foi possivel carregar os links do setor: ${error.message}`);
  }

  return ((data ?? []) as KnowledgeMemoryRow[]).map(mapTrackedLinkButton);
}

function mapSectorEntity(row: SectorRow): PlatformWhatsappConsoleEntity {
  return {
    id: row.id,
    name: row.name,
    slug: row.sector_code,
    planCode: "internal",
    status: row.status,
    role: "platform",
    createdAt: row.created_at,
  };
}

function getBehaviorConfig(agent: AgentRow | null, instance: WhatsappInstanceRow | null) {
  const instanceConfig = readRecord(instance?.metadata)?.behavior_config;
  const agentConfig = readRecord(agent?.metadata)?.whatsapp_behavior_config;
  return normalizeWhatsappBehaviorConfig(instanceConfig ?? agentConfig ?? defaultWhatsappBehaviorConfig);
}

async function getNextPromptVersion(client: SupabaseClient, agentId: string) {
  const { data } = await client
    .from("agent_prompt_versions")
    .select("version_number")
    .eq("agent_id", agentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ version_number: number }>();

  return (data?.version_number ?? 0) + 1;
}

async function configurePlatformWebhook(credentials: UazapiCredentials, token: string, providerInstanceId?: string | null) {
  if (!credentials.webhookUrl) {
    return { ok: false as const, reason: "NEXT_PUBLIC_APP_URL nao configurada." };
  }

  const webhookUrl = new URL(credentials.webhookUrl);
  if (credentials.webhookSecret) {
    webhookUrl.searchParams.set("secret", credentials.webhookSecret);
  }
  if (providerInstanceId) {
    webhookUrl.searchParams.set("instanceId", providerInstanceId);
  }

  const response = await callUazapi(credentials, "/webhook", {
    method: "POST",
    token,
    body: {
      url: webhookUrl.toString(),
      events: ["messages", "messages_update", "connection", "history"],
      excludeMessages: ["wasSentByApi"],
      enabled: true,
      addUrlEvents: false,
      addUrlTypesMessages: false,
    },
    tolerateError: true,
  });

  if (!response.ok) {
    return { ok: false as const, reason: `Webhook respondeu status ${response.status}.` };
  }

  return { ok: true as const };
}

async function getConnectedProfileData(credentials: UazapiCredentials, token: string) {
  const attempts: Array<{ path: string; method: "GET" | "POST" }> = [
    { path: "/business/get/profile", method: "POST" },
    { path: "/instance/profile", method: "GET" },
    { path: "/profile", method: "GET" },
  ];
  let firstOkData: unknown = null;

  for (const attempt of attempts) {
    const result = await callUazapi(credentials, attempt.path, {
      method: attempt.method,
      token,
      tolerateError: true,
    });

    if (!result.ok) {
      continue;
    }

    firstOkData ??= result.data;

    if (
      extractProfileImageUrl(result.data) ||
      findString(result.data, ["profileName", "displayName", "businessName", "name"])
    ) {
      return {
        source: attempt.path,
        data: result.data,
      };
    }
  }

  return firstOkData ? { source: "profile_fallback", data: firstOkData } : null;
}

async function getConnectedAvatarData(credentials: UazapiCredentials, token: string, phoneNumber: string) {
  const chatDetails = await callUazapi(credentials, "/chat/details", {
    method: "POST",
    token,
    body: {
      number: phoneNumber,
      preview: true,
    },
    tolerateError: true,
  });

  if (chatDetails.ok && extractProfileImageUrl(chatDetails.data)) {
    return {
      source: "chat_details",
      data: chatDetails.data,
    };
  }

  const contactAvatar = await callUazapi(credentials, "/contact/avatar", {
    method: "POST",
    token,
    body: {
      number: phoneNumber,
    },
    tolerateError: true,
  });

  if (contactAvatar.ok && extractProfileImageUrl(contactAvatar.data)) {
    return {
      source: "contact_avatar",
      data: contactAvatar.data,
    };
  }

  return null;
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    token?: string;
    admin?: boolean;
    tolerateError?: boolean;
  },
) {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.admin ? { admintoken: credentials.adminToken } : {}),
      ...(options.token ? { token: options.token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const data = await readResponse(response);

  if (!response.ok && !options.tolerateError) {
    throw new Error(readProviderError(data) ?? `Uazapi respondeu status ${response.status}.`);
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function readResponse(response: Response) {
  const text = await response.text().catch(() => "");

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildUnavailableState(): PlatformWhatsappConsoleState {
  return {
    ...buildState(null, null, defaultWhatsappBehaviorConfig, buildUnavailableAudioState(), [], []),
    companies: [],
    selectedCompanyId: null,
    capability: {
      canConnect: false,
      schemaReady: true,
      message: "Cadastre um setor em Setores antes de configurar o WhatsApp interno.",
    },
  };
}

function buildUnavailableAudioState(): WhatsappAudioVoiceState {
  return {
    configured: false,
    defaultVoiceId: null,
    defaultModelId: null,
    outputFormat: null,
    voices: [],
    errorMessage: null,
  };
}

function revalidateWhatsappAdmin() {
  revalidatePath("/admin/whatsapp/atendimento");
  revalidatePath("/admin/whatsapp/agentes");
  revalidatePath("/admin/setores");
}

async function syncInstanceStatusFromProvider(
  client: SupabaseClient,
  instance: WhatsappInstanceRow,
): Promise<WhatsappInstanceRow> {
  const token = decryptInstanceToken(instance);

  if (!token) {
    return instance;
  }

  const credentials = await loadUazapiCredentials(client);
  const result = await callUazapi(credentials, "/instance/status", {
    method: "GET",
    token,
    tolerateError: true,
  });

  if (!result.ok) {
    return instance;
  }

  const status = normalizeWhatsappStatus(findString(result.data, ["status", "state", "connectionStatus"]));

  if (status === instance.status) {
    return instance;
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status,
    last_synced_at: now,
    last_heartbeat_at: now,
  };

  if (status === "connected") {
    update.connected_at = instance.connected_at ?? now;
    update.disconnected_at = null;
  }

  await client.from("whatsapp_instances").update(update).eq("id", instance.id);

  return { ...instance, ...update } as WhatsappInstanceRow;
}

function decryptInstanceToken(instance: WhatsappInstanceRow) {
  if (!instance.instance_token_encrypted) {
    return null;
  }

  try {
    return decryptCredentialValue(instance.instance_token_encrypted);
  } catch {
    return null;
  }
}

function buildPlatformInstanceMetadata(sector: SectorRow, agent: AgentRow) {
  return {
    created_from: "admin_whatsapp_internal",
    admin_whatsapp: true,
    platform_whatsapp: true,
    connectyhub_internal: true,
    agent_kind: "whatsapp",
    sector_id: sector.id,
    sector_code: sector.sector_code,
    sector_name: sector.name,
    agent_id: agent.id,
    agent_name: agent.persona_name?.trim() || agent.name,
  };
}

function buildProviderInstanceName(sector: SectorRow) {
  const base = slugify(`${sector.name}-${sector.id.slice(0, 8)}`).slice(0, 28);
  return `connectyhub-interno-${base || sector.id.slice(0, 8)}`;
}

function normalizeWhatsappStatus(value: string | null | undefined): WhatsappStatus {
  const status = value?.toLowerCase() ?? "";

  if (["disconnected", "not_connected", "notconnected", "not connected", "not_logged", "not logged", "close", "logout", "offline"].some((item) => status.includes(item))) return "disconnected";
  if (["connected", "open", "online", "logged", "ready"].some((item) => status.includes(item))) return "connected";
  if (["qr", "pair", "scan"].some((item) => status.includes(item))) return "qr_pending";
  if (["blocked", "ban"].some((item) => status.includes(item))) return "blocked";
  if (["error", "fail"].some((item) => status.includes(item))) return "error";

  return "draft";
}

function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

function readProfileImageUrl(instance: WhatsappInstanceRow | null) {
  const metadata = readRecord(instance?.metadata);

  return (
    normalizeProfileImageUrl(typeof metadata?.profile_image_url === "string" ? metadata.profile_image_url : null) ??
    extractProfileImageUrl(metadata?.last_profile_response) ??
    extractProfileImageUrl(metadata?.last_status_response) ??
    extractProfileImageUrl(metadata?.last_connect_response) ??
    extractProfileImageUrl(metadata?.last_avatar_response) ??
    extractProfileImageUrl(metadata?.create_response)
  );
}

function extractProfileImageUrl(value: unknown) {
  return normalizeProfileImageUrl(
    findString(value, [
      "profileImageUrl",
      "profile_image_url",
      "profilePictureUrl",
      "profile_picture_url",
      "profilePicUrl",
      "profile_pic_url",
      "pictureUrl",
      "picture_url",
      "photoUrl",
      "photo_url",
      "imageUrl",
      "image_url",
      "avatarUrl",
      "avatar_url",
      "profileImage",
      "profilePicture",
      "profilePic",
      "profilePicThumbObj",
      "imagePreview",
      "picture",
      "photo",
      "image",
      "avatar",
    ]),
  );
}

function normalizeProfileImageUrl(value: string | null | undefined) {
  const url = value?.trim();

  if (!url || !/^https?:\/\//i.test(url)) {
    return null;
  }

  return url;
}

function findString(value: unknown, keys: string[]): string | null {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => {
    return lowerKeys.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0;
  });

  return typeof found === "string" ? found.trim() : null;
}

function findValue(value: unknown, predicate: (key: string, value: unknown) => boolean): unknown {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, predicate);
      if (found) return found;
    }

    return null;
  }

  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (predicate(key, item)) {
      return item;
    }

    const found = findValue(item, predicate);
    if (found) return found;
  }

  return null;
}

function normalizeQrCode(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.startsWith("data:image/") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 120) {
    return `data:image/png;base64,${value}`;
  }

  return value;
}

function sanitizeProviderData(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeProviderData);
  }

  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, item]) => {
      const normalized = key.toLowerCase();

      if (normalized.includes("token") || normalized.includes("secret") || normalized.includes("qrcode")) {
        return [key, "[redacted]"];
      }

      if (typeof item === "string" && item.length > 500 && (normalized.includes("image") || normalized.includes("photo") || normalized.includes("picture"))) {
        return [key, "[redacted-image]"];
      }

      return [key, sanitizeProviderData(item)];
    }),
  );
}

function isInvalidInstanceTokenResponse(result: { status: number; data: unknown }) {
  const message = readProviderError(result.data)?.toLowerCase() ?? "";

  return (
    (message.includes("token") && (message.includes("invalid") || message.includes("invalido") || message.includes("invalido"))) ||
    ([401, 403].includes(result.status) && message.includes("token"))
  );
}

function readProviderError(value: unknown) {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  return findString(value, ["error", "message", "detail"]);
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function preview(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

function formatSectorTableError(message: string) {
  if (message.includes("platform_whatsapp_sectors") || message.includes("schema cache")) {
    return "A tabela de setores internos ainda nao existe no Supabase. Aplique a migration supabase/migrations/0011_admin_whatsapp_sectors.sql e atualize a pagina para cadastrar setores.";
  }

  return message;
}

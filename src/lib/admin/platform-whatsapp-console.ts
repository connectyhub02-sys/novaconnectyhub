import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { generateElevenLabsAudio } from "@/lib/elevenlabs/tts";
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
  mergeWhatsappHandoffNotificationSettings,
  normalizeWhatsappCloneMemory,
  normalizeWhatsappCloneProfile,
  normalizeWhatsappBehaviorConfig,
  type WhatsappBehaviorConfig,
  type WhatsappCloneProfile,
} from "@/lib/whatsapp/agent-behavior";
import {
  describeWhatsappHandoffNotificationResult,
  processWhatsappHandoffNotification,
} from "@/lib/whatsapp/handoff-notifications";
import {
  enqueueWhatsappCloneProfileImport,
  normalizeWhatsappCloneProfileImportStatus,
} from "@/lib/whatsapp/clone-profile-history";
import { normalizeCloneHumanizationMetrics } from "@/lib/whatsapp/clone-humanization";
import {
  listWhatsappRuntimeAlerts,
  type ClientCloneRealTestSummary,
  type ClientKnowledgeFile,
  type ClientTrackedLinkButton,
  type ClientWhatsappActionResult,
  type ClientWhatsappState,
} from "@/lib/whatsapp/client-workspace";
import {
  appendConnectionDiagnosticEvent,
  isPasskeyDisconnectReason,
  readConnectionDiagnostics,
  resolveConnectionDiagnosticEventType,
} from "@/lib/whatsapp/connection-diagnostics";
import {
  deleteUazapiProviderInstance,
  type UazapiProviderInstanceDeleteResult,
} from "@/lib/whatsapp/uazapi-instance-cleanup";
import { resolveUazapiWhatsappStatus } from "@/lib/uazapi/status";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";
import { createServiceClient } from "@/lib/supabase/service";
import { createPlatformWhatsappAgent, createPlatformWhatsappSector } from "./platform-whatsapp-agents";

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

type CloneRealTestEventRow = {
  id: string;
  title: string | null;
  summary: string | null;
  confidence: number | null;
  payload: JsonRecord | null;
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
  const [cloneTest, runtimeAlerts] = await Promise.all([
    agent
      ? listPlatformCloneRealTests(client, agent.id)
      : Promise.resolve(emptyCloneRealTestSummary()),
    agent
      ? listWhatsappRuntimeAlerts(client, { agentId: agent.id, instanceId: instance?.id ?? null })
      : Promise.resolve([]),
  ]);

  return {
    ...buildState(instance, agent, getBehaviorConfig(agent, instance), audio, knowledgeFiles, linkButtons, cloneTest, runtimeAlerts),
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

export async function createPlatformWhatsappConsoleSectorAgent(input: {
  sectorName: string;
  description?: string;
  name: string;
  roleTitle?: string;
  userId: string;
  voiceOrganizationId?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const sector = await createPlatformWhatsappSector({
    name: input.sectorName,
    description: input.description,
    userId: input.userId,
    client,
  });

  await createPlatformWhatsappAgent({
    sectorId: sector.id,
    name: input.name,
    roleTitle: input.roleTitle,
    userId: input.userId,
    client,
  });

  revalidateWhatsappAdmin();
  return getPlatformWhatsappConsoleState({
    sectorId: sector.id,
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
  cloneProfile?: unknown;
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
  const hasCloneProfile = input.cloneProfile !== undefined;
  const nextCloneProfile = hasCloneProfile
    ? normalizeWhatsappCloneProfile(input.cloneProfile)
    : getCloneProfileConfig(agent);
  const nextQualificationConfig = input.qualificationConfig !== undefined
    ? normalizeLeadQualificationConfig(input.qualificationConfig)
    : normalizeLeadQualificationConfig(readRecord(agent.metadata)?.[leadQualificationConfigKey]);
  const now = new Date().toISOString();
  const nextPrompt = hasAgentPrompt ? agentPrompt! : agent.prompt?.trim() || defaultWhatsappAgentPrompt;
  const nextVersion = hasAgentPrompt ? await getNextPromptVersion(client, agent.id) : null;
  const metadata = {
    ...(agent.metadata ?? {}),
    whatsapp_behavior_config: nextBehavior,
    whatsapp_clone_profile: nextCloneProfile,
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
  connectPhone?: string | null;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const sector = await requirePlatformWhatsappSector(client, input.sectorId);
  const agent = await requireSectorWhatsappAgent(client, sector.id);
  const connectPhone = normalizePhone(input.connectPhone);
  const connectionMode = connectPhone ? "phone" : "qr";
  const connectStartedAt = new Date().toISOString();
  const connectPayload: JsonRecord = {
    browser: "auto",
    systemName: `ConnectyHub Interno - ${sector.name}`,
    ...(connectPhone ? { phone: connectPhone } : {}),
  };
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
    body: connectPayload,
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
      body: connectPayload,
      tolerateError: true,
    });
  }

  if (!connectResult.ok) {
    throw new Error(readProviderError(connectResult.data) ?? `Uazapi respondeu status ${connectResult.status}.`);
  }

  const status = resolveUazapiWhatsappStatus(connectResult.data, "qr_pending");
  const qrCode = normalizeQrCode(findString(connectResult.data, ["qrcode", "qrCode", "qr", "base64"]));
  const pairCode = findString(connectResult.data, ["paircode", "pairCode", "pair_code"]);
  const pendingConnection = status !== "connected" && Boolean(qrCode || pairCode);
  const connectionEventType = resolveConnectionDiagnosticEventType({
    defaultType: "connect_response",
    providerPayload: connectResult.data,
    resolvedStatus: status,
  });
  let connectionMetadata = appendConnectionDiagnosticEvent(instance.metadata, {
    type: "connect_requested",
    mode: connectionMode,
    phone: connectPhone,
    at: connectStartedAt,
    providerPayload: connectPayload,
  });
  connectionMetadata = appendConnectionDiagnosticEvent(connectionMetadata, {
    type: connectionEventType,
    mode: connectionMode,
    providerStatus: connectResult.status,
    providerPayload: connectResult.data,
  });
  const phoneNumber = normalizePhone(findString(connectResult.data, ["owner", "phone", "number", "phone_number"]) ?? connectPhone ?? instance.phone_number);
  const profileData = status === "connected" ? await getConnectedProfileData(credentials, token) : null;
  const avatarData = status === "connected" && phoneNumber ? await getConnectedAvatarData(credentials, token, phoneNumber) : null;
  const displayName = findString(connectResult.data, ["profileName", "displayName", "name"]) ?? findString(profileData, ["profileName", "displayName", "businessName", "name"]) ?? instance.display_name;
  const profileImageUrl = extractProfileImageUrl(connectResult.data) ?? extractProfileImageUrl(profileData) ?? extractProfileImageUrl(avatarData) ?? readProfileImageUrl(instance);
  const now = new Date().toISOString();
  const webhookResult = await configurePlatformWebhook(credentials, token, instance.provider_instance_id);

  await client
    .from("whatsapp_instances")
    .update({
      status: pendingConnection ? "qr_pending" : status,
      qr_status: qrCode ? "available" : pairCode ? "pair_code" : null,
      phone_number: phoneNumber,
      display_name: displayName,
      connected_at: status === "connected" ? now : instance.connected_at,
      disconnected_at: null,
      webhook_url: credentials.webhookUrl,
      webhook_configured_at: webhookResult.ok ? now : instance.webhook_configured_at,
      last_synced_at: now,
      metadata: {
        ...connectionMetadata,
        ...buildPlatformInstanceMetadata(sector, agent),
        ...(profileImageUrl ? { profile_image_url: profileImageUrl, profile_image_synced_at: now } : {}),
        webhook_status: webhookResult.ok ? "configured" : "not_configured",
        webhook_error: webhookResult.ok ? null : webhookResult.reason,
        last_platform_action: "connect",
        last_connect_request: sanitizeProviderData(connectPayload),
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
      tone: pendingConnection ? "warning" : "success",
      message: qrCode
        ? "Escaneie o QR Code para concluir a conexao interna."
        : pairCode
          ? "Use o codigo de pareamento no WhatsApp para concluir a conexao interna."
          : "WhatsApp interno conectado ou em processo de conexao.",
    },
    qrCode,
    pairCode,
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

  const status = resolveUazapiWhatsappStatus(result.data);
  const qrCode = normalizeQrCode(findString(result.data, ["qrcode", "qrCode", "qr", "base64"]));
  const pairCode = findString(result.data, ["paircode", "pairCode", "pair_code"]);
  const pendingConnection = status !== "connected" && Boolean(qrCode || pairCode);
  const lastDisconnectReason = findString(result.data, ["lastDisconnectReason", "last_disconnect_reason", "disconnectReason", "disconnect_reason"]);
  const connectionEventType = resolveConnectionDiagnosticEventType({
    defaultType: "status_poll",
    providerPayload: result.data,
    resolvedStatus: status,
  });
  const connectionMetadata = appendConnectionDiagnosticEvent(instance.metadata, {
    type: connectionEventType,
    providerStatus: result.status,
    providerPayload: result.data,
  });
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
      status: pendingConnection ? "qr_pending" : status,
      qr_status: qrCode ? "available" : pairCode ? "pair_code" : null,
      phone_number: phoneNumber,
      display_name: displayName,
      connected_at: status === "connected" ? instance.connected_at ?? now : instance.connected_at,
      disconnected_at: status === "disconnected" ? now : instance.disconnected_at,
      webhook_url: status === "connected" ? credentials.webhookUrl : instance.webhook_url,
      webhook_configured_at: webhookResult?.ok ? now : instance.webhook_configured_at,
      last_heartbeat_at: now,
      last_synced_at: now,
      metadata: {
        ...connectionMetadata,
        ...(profileImageUrl ? { profile_image_url: profileImageUrl, profile_image_synced_at: now } : {}),
        ...(webhookResult
          ? {
              webhook_status: webhookResult.ok ? "configured" : "not_configured",
              webhook_error: webhookResult.ok ? null : webhookResult.reason,
            }
          : {}),
        last_platform_action: "refresh_status",
        last_status_response: sanitizeProviderData(result.data),
        last_disconnect_reason: lastDisconnectReason,
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
      message: state.instance?.status === "connected"
        ? "WhatsApp interno conectado."
        : isPasskeyDisconnectReason(lastDisconnectReason)
          ? "Esta conta pediu uma verificacao extra por chave de acesso. Nosso servico ainda nao suporta essa verificacao pelo painel."
        : pairCode
          ? "Codigo de pareamento interno atualizado."
          : "Status atualizado. Conexao interna ainda nao esta ativa.",
    },
    qrCode: state.instance?.status === "connected" ? null : qrCode,
    pairCode: state.instance?.status === "connected" ? null : pairCode,
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

  const deleteResult = await deleteUazapiProviderInstance({
    credentials,
    providerInstanceId: instance.provider_instance_id,
    token: decryptInstanceToken(instance),
  });

  if (!deleteResult.providerDeleted && !deleteResult.skipped) {
    const providerMessage = readProviderError(deleteResult.providerResponse);
    throw new Error(providerMessage ?? "Nao foi possivel excluir a instancia interna na Uazapi. A conexao foi mantida para evitar divergencia.");
  }

  await archivePlatformInstanceAfterProviderDelete(client, instance, {
    actorId: input.userId,
    action: "manual_disconnect_delete",
    reason: "manual_disconnect",
    providerDeleteResult: deleteResult,
  });

  revalidateWhatsappAdmin();
  const state = await getPlatformWhatsappConsoleState({ sectorId: sector.id, userId: input.userId, client });

  return {
    state,
    notice: {
      tone: "success",
      message: "Conexao WhatsApp interna removida. Gere um novo QR Code para criar uma nova instancia.",
    },
    qrCode: null,
    pairCode: null,
  };
}

export async function resetPlatformWhatsappConsoleConnection(input: {
  sectorId: string;
  userId: string;
  connectPhone?: string | null;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const connectPhone = normalizePhone(input.connectPhone);

  if (input.connectPhone && (!connectPhone || connectPhone.length < 10)) {
    throw new Error("Informe o telefone com DDI usando apenas numeros.");
  }

  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const sector = await requirePlatformWhatsappSector(client, input.sectorId);
  const agent = await requireSectorWhatsappAgent(client, sector.id);
  const existing = await getSectorWhatsappInstance(client, sector.id);

  if (!existing) {
    throw new Error("Gere uma conexao WhatsApp interna antes de usar o reset.");
  }

  let instance = existing;
  let token = decryptInstanceToken(instance);

  if (!token && instance.provider_instance_id) {
    instance = await recoverProviderInstanceToken(client, credentials, instance) ?? instance;
    token = decryptInstanceToken(instance);
  }

  if (token) {
    const resetResult = await callUazapi(credentials, "/instance/reset", {
      method: "POST",
      token,
      tolerateError: true,
    });

    if (resetResult.ok) {
      await recordPlatformConnectionReset(client, instance, resetResult);
      await sleep(6000);
    } else if (isInvalidInstanceTokenResponse(resetResult) || isNotReconnectableResetResponse(resetResult)) {
      await markPlatformInstanceDisconnected(client, instance, {
        action: isInvalidInstanceTokenResponse(resetResult) ? "reset_invalid_token" : "reset_not_reconnectable",
        clearToken: isInvalidInstanceTokenResponse(resetResult),
        providerData: resetResult.data,
        reason: isInvalidInstanceTokenResponse(resetResult) ? "invalid_instance_token" : "not_reconnectable",
      });
      await createPlatformProviderInstance(client, credentials, sector, input.userId, agent, {
        forceNew: true,
        replacingInstance: instance,
        replacementProviderData: resetResult.data,
        replacementReason: isInvalidInstanceTokenResponse(resetResult) ? "reset_invalid_token" : "reset_not_reconnectable",
      });
    } else {
      throw new Error(readProviderError(resetResult.data) ?? `Uazapi respondeu status ${resetResult.status}.`);
    }
  } else {
    await createPlatformProviderInstance(client, credentials, sector, input.userId, agent, {
      forceNew: true,
      replacingInstance: instance,
      replacementReason: "missing_instance_token",
    });
  }

  const result = await connectPlatformWhatsappConsole({
    sectorId: sector.id,
    userId: input.userId,
    connectPhone,
    client,
  });

  return {
    ...result,
    notice: {
      tone: result.notice?.tone ?? "success",
      message: result.pairCode
        ? "Sessao interna resetada. Use o codigo de pareamento para concluir."
        : result.qrCode
          ? "Sessao interna resetada. Escaneie o novo QR Code para concluir."
          : "Sessao interna resetada e reconexao iniciada.",
    },
  };
}

export async function sendPlatformWhatsappConsoleTest(input: {
  sectorId: string;
  userId: string;
  phone: string;
  text: string;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const phone = normalizePhone(input.phone);
  const text = input.text.trim();

  if (!phone || phone.length < 10) {
    throw new Error("Informe um numero com DDD para enviar o teste.");
  }

  if (!text) {
    throw new Error("Escreva a mensagem de teste.");
  }

  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const sector = await requirePlatformWhatsappSector(client, input.sectorId);
  const [agent, instance] = await Promise.all([
    requireSectorWhatsappAgent(client, sector.id),
    requireSectorWhatsappInstance(client, sector.id),
  ]);
  const behavior = getBehaviorConfig(agent, instance);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("Conecte o WhatsApp interno antes de enviar mensagens.");
  }

  let deliveryMode: "text" | "audio" = "text";
  let generatedAudio: Awaited<ReturnType<typeof generateElevenLabsAudio>> | null = null;

  if (behavior.responseMode === "audio") {
    deliveryMode = "audio";
    generatedAudio = await generateElevenLabsAudio({
      organizationId: instance.organization_id,
      userId: input.userId,
      text,
      voiceId: behavior.audioVoiceId || null,
      voicePublicOwnerId: behavior.audioVoicePublicOwnerId || null,
      voiceName: behavior.audioVoiceName || null,
      modelId: behavior.audioModelId || null,
      source: "whatsapp_internal_test",
      metadata: {
        whatsappInstanceId: instance.id,
        sectorId: sector.id,
        sectorCode: sector.sector_code,
        testPhone: phone,
        audioVoiceName: behavior.audioVoiceName || null,
      },
      client,
    });

    await callUazapi(credentials, "/send/media", {
      method: "POST",
      token,
      body: {
        number: phone,
        type: "ptt",
        file: generatedAudio.audioUrl,
        track_source: "connectyhub",
        track_id: `platform_test_audio_${Date.now()}`,
      },
    });
  } else {
    await callUazapi(credentials, "/send/text", {
      method: "POST",
      token,
      body: {
        number: phone,
        text,
        linkPreview: true,
        track_source: "connectyhub",
        track_id: `platform_test_${Date.now()}`,
      },
    });
  }

  await client
    .from("whatsapp_instances")
    .update({
      last_message_at: new Date().toISOString(),
      metadata: {
        ...(instance.metadata ?? {}),
        last_platform_action: "send_test",
        last_test_delivery_mode: deliveryMode,
        last_test_audio_media_id: generatedAudio?.mediaId ?? null,
        last_test_audio_object_key: generatedAudio?.objectKey ?? null,
      },
    })
    .eq("id", instance.id);

  revalidateWhatsappAdmin();
  const state = await getPlatformWhatsappConsoleState({ sectorId: sector.id, userId: input.userId, client });

  return {
    state,
    notice: { tone: "success", message: deliveryMode === "audio" ? "Audio de teste interno enviado." : "Mensagem de teste interna enviada." },
    qrCode: null,
    pairCode: null,
  };
}

export async function sendPlatformWhatsappHandoffNotificationTest(input: {
  sectorId: string;
  userId: string;
  behavior?: unknown;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const sector = await requirePlatformWhatsappSector(client, input.sectorId);
  const [agent, instance] = await Promise.all([
    requireSectorWhatsappAgent(client, sector.id),
    requireSectorWhatsappInstance(client, sector.id),
  ]);
  const behaviorDraft = normalizeWhatsappBehaviorConfig(input.behavior ?? getBehaviorConfig(agent, instance));
  const behavior = mergeWhatsappHandoffNotificationSettings(getBehaviorConfig(agent, instance), behaviorDraft);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("Conecte o WhatsApp interno antes de testar o aviso humano.");
  }

  if (!behavior.humanHandoffNotifications) {
    throw new Error("Ligue o controle Avisar humano no WhatsApp antes de testar.");
  }

  if (!behavior.humanHandoffNotificationNumbers.trim()) {
    throw new Error("Informe pelo menos um numero responsavel para receber o aviso.");
  }

  const requestedAt = new Date().toISOString();
  const notificationResult = await processWhatsappHandoffNotification({
    client,
    data: {
      organizationId: instance.organization_id,
      whatsappInstanceId: instance.id,
      agentId: agent.id,
      test: true,
      notificationNumbers: behavior.humanHandoffNotificationNumbers,
      notificationCooldownMinutes: behavior.humanHandoffNotificationCooldownMinutes,
      requestedByUserId: input.userId,
      requestText: "Teste de aviso de atendimento humano.",
      requestedAt,
      source: "admin_whatsapp_internal_test",
    },
  });
  const resultMessage = describeWhatsappHandoffNotificationResult(notificationResult);

  if (notificationResult.status !== "sent") {
    throw new Error(resultMessage);
  }

  await persistPlatformHandoffNotificationSettings(client, agent, behavior, input.userId, requestedAt);

  await client
    .from("whatsapp_instances")
    .update({
      metadata: {
        ...(instance.metadata ?? {}),
        behavior_config: behavior,
        behavior_updated_at: requestedAt,
        behavior_updated_by: input.userId,
        last_platform_action: "send_handoff_test",
        last_handoff_test_sent_at: requestedAt,
        last_handoff_test_result: notificationResult,
      },
    })
    .eq("id", instance.id);

  revalidateWhatsappAdmin();
  const state = await getPlatformWhatsappConsoleState({ sectorId: sector.id, userId: input.userId, client });

  return {
    state,
    notice: { tone: "success", message: resultMessage },
    qrCode: null,
    pairCode: null,
  };
}

async function persistPlatformHandoffNotificationSettings(
  client: SupabaseClient,
  agent: AgentRow,
  behavior: WhatsappBehaviorConfig,
  userId: string,
  updatedAt: string,
) {
  const { error } = await client
    .from("agent_registry")
    .update({
      metadata: {
        ...(agent.metadata ?? {}),
        whatsapp_behavior_config: behavior,
        prompt_control: {
          ...(readRecord(readRecord(agent.metadata)?.prompt_control) ?? {}),
          last_updated_at: updatedAt,
          last_updated_by: userId,
          source: "admin_whatsapp_internal_handoff_test",
        },
      },
    })
    .eq("id", agent.id);

  if (error) {
    throw new Error(`Nao foi possivel salvar o aviso humano interno: ${error.message}`);
  }
}

export async function generatePlatformWhatsappCloneProfileFromHistory(input: {
  sectorId: string;
  userId: string;
  maxChats?: number;
  maxMessagesPerChat?: number;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const sector = await requirePlatformWhatsappSector(client, input.sectorId);
  const [agent, instance] = await Promise.all([
    requireSectorWhatsappAgent(client, sector.id),
    requireSectorWhatsappInstance(client, sector.id),
  ]);

  if (!instance.instance_token_encrypted) {
    throw new Error("Reconecte o WhatsApp interno antes de gerar o DNA pelo historico.");
  }

  await enqueueWhatsappCloneProfileImport({
    scope: "platform",
    agentId: agent.id,
    organizationId: null,
    sectorId: sector.id,
    instanceId: instance.id,
    requestedBy: input.userId,
    maxChats: input.maxChats,
    maxMessagesPerChat: input.maxMessagesPerChat,
    client,
  });

  revalidateWhatsappAdmin();
  const state = await getPlatformWhatsappConsoleState({
    sectorId: sector.id,
    userId: input.userId,
    client,
  });

  return {
    state,
    notice: {
      tone: "success",
      message: "Analise do historico enviada para o Inngest. O DNA interno sera preenchido quando terminar.",
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
  cloneTest: ClientCloneRealTestSummary = emptyCloneRealTestSummary(),
  runtimeAlerts: ClientWhatsappState["runtimeAlerts"] = [],
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
          connectionDiagnostics: readConnectionDiagnostics(instance.metadata),
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
          cloneProfile: getCloneProfileConfig(agent),
          cloneMemory: getCloneMemoryConfig(agent),
          cloneProfileImport: getCloneProfileImportStatus(agent),
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
    cloneTest,
    runtimeAlerts,
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
  options: {
    forceNew?: boolean;
    replacingInstance?: WhatsappInstanceRow | null;
    replacementProviderData?: unknown;
    replacementReason?: string;
  } = {},
) {
  const organization = await getOrCreatePlatformWhatsappOrganization(client, userId);
  const now = new Date().toISOString();
  const baseName = buildProviderInstanceName(sector);
  const name = options.forceNew ? buildResetProviderInstanceName(baseName) : baseName;
  const replacementCleanup = options.forceNew && options.replacingInstance
    ? await deletePlatformProviderInstanceBeforeReplacement(client, credentials, options.replacingInstance, {
        providerData: options.replacementProviderData,
        reason: options.replacementReason ?? "force_new_instance",
        userId,
      })
    : null;

  const existingInProvider = options.forceNew ? null : await findProviderInstanceByName(credentials, name);
  if (!options.forceNew && existingInProvider) {
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

  await archivePlatformInstancesReplacedByNewInstance(client, sector.id, data.id, now, replacementCleanup);

  return data;
}

type PlatformReplacementCleanup = {
  instanceId: string;
  at: string;
  userId: string;
  reason: string;
  providerData?: unknown;
  deleteResult: UazapiProviderInstanceDeleteResult;
};

async function archivePlatformInstanceAfterProviderDelete(
  client: SupabaseClient,
  instance: WhatsappInstanceRow,
  input: {
    actorId: string;
    action: string;
    reason: string;
    providerDeleteResult: UazapiProviderInstanceDeleteResult;
  },
) {
  const now = new Date().toISOString();
  const metadata = {
    ...(instance.metadata ?? {}),
    archived_reason: input.reason,
    archived_at: now,
    archived_by: input.actorId,
    last_platform_action: input.action,
    provider_delete_ok: input.providerDeleteResult.providerDeleted,
    provider_delete_status: input.providerDeleteResult.providerStatus,
    provider_delete_response: input.providerDeleteResult.providerResponse,
    provider_delete_refreshed_token_used: input.providerDeleteResult.refreshedTokenUsed,
    provider_delete_skipped: input.providerDeleteResult.skipped,
  };

  const { error } = await client
    .from("whatsapp_instances")
    .update({
      status: "archived",
      qr_status: null,
      instance_token_preview: null,
      instance_token_encrypted: null,
      webhook_url: null,
      webhook_configured_at: null,
      disconnected_at: now,
      last_synced_at: now,
      metadata,
    })
    .eq("id", instance.id);

  if (error) {
    throw new Error(`Nao foi possivel remover a conexao WhatsApp interna: ${error.message}`);
  }
}

async function deletePlatformProviderInstanceBeforeReplacement(
  client: SupabaseClient,
  credentials: UazapiCredentials,
  instance: WhatsappInstanceRow,
  input: {
    providerData?: unknown;
    reason: string;
    userId: string;
  },
): Promise<PlatformReplacementCleanup> {
  const deleteResult = await deleteUazapiProviderInstance({
    credentials,
    providerInstanceId: instance.provider_instance_id,
    token: decryptInstanceToken(instance),
  });

  if (!deleteResult.providerDeleted && !deleteResult.skipped) {
    const providerMessage = readProviderError(deleteResult.providerResponse);
    throw new Error(providerMessage ?? "Nao foi possivel excluir a instancia interna antiga na Uazapi. Nenhuma nova instancia foi criada para evitar cobranca duplicada.");
  }

  return {
    instanceId: instance.id,
    at: new Date().toISOString(),
    userId: input.userId,
    reason: input.reason,
    providerData: input.providerData,
    deleteResult,
  };
}

async function archivePlatformInstancesReplacedByNewInstance(
  client: SupabaseClient,
  sectorId: string,
  replacementInstanceId: string,
  archivedAt: string,
  cleanup: PlatformReplacementCleanup | null,
) {
  const { data: rows, error } = await client
    .from("whatsapp_instances")
    .select("id, metadata")
    .eq("provider", "uazapi")
    .contains("metadata", { admin_whatsapp: true, sector_id: sectorId })
    .neq("id", replacementInstanceId)
    .neq("status", "archived");

  if (error) {
    throw new Error(`Nao foi possivel listar instancias internas antigas para arquivar: ${error.message}`);
  }

  await Promise.all((rows ?? []).map(async (row) => {
    const cleanupMetadata = cleanup && cleanup.instanceId === row.id
      ? {
          replacement_cleanup_at: cleanup.at,
          replacement_cleanup_by: cleanup.userId,
          replacement_cleanup_reason: cleanup.reason,
          replacement_reset_response: sanitizeProviderData(cleanup.providerData),
          provider_delete_ok: cleanup.deleteResult.providerDeleted,
          provider_delete_status: cleanup.deleteResult.providerStatus,
          provider_delete_response: cleanup.deleteResult.providerResponse,
          provider_delete_refreshed_token_used: cleanup.deleteResult.refreshedTokenUsed,
          provider_delete_skipped: cleanup.deleteResult.skipped,
        }
      : {};
    const metadata = {
      ...((row.metadata as JsonRecord | null) ?? {}),
      archived_reason: "replaced_by_new_instance",
      replaced_by: replacementInstanceId,
      archived_at: archivedAt,
      ...cleanupMetadata,
    };

    const { error: archiveError } = await client
      .from("whatsapp_instances")
      .update({
        status: "archived",
        qr_status: null,
        instance_token_preview: null,
        instance_token_encrypted: null,
        webhook_url: null,
        webhook_configured_at: null,
        disconnected_at: archivedAt,
        last_synced_at: archivedAt,
        metadata,
      })
      .eq("id", row.id);

    if (archiveError) {
      throw new Error(`Nao foi possivel arquivar a instancia interna antiga: ${archiveError.message}`);
    }
  }));
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
  const disconnectedByUser = input.reason === "manual_disconnect";
  const connectionMetadata = appendConnectionDiagnosticEvent(instance.metadata, {
    type: disconnectedByUser ? "status_disconnected" : "provider_error",
    providerPayload: input.providerData,
    message: input.reason,
    finalStatus: disconnectedByUser ? "disconnected" : "provider_error",
    finalReason: input.reason,
  });
  const metadata: JsonRecord = {
    ...connectionMetadata,
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

async function recordPlatformConnectionReset(
  client: SupabaseClient,
  instance: WhatsappInstanceRow,
  result: { status: number; data: unknown },
) {
  const now = new Date().toISOString();
  const connectionMetadata = appendConnectionDiagnosticEvent(instance.metadata, {
    type: "reset_requested",
    providerStatus: result.status,
    providerPayload: result.data,
    finalStatus: "reset",
    finalReason: readProviderError(result.data) ?? "runtime_reset",
  });

  const { error } = await client
    .from("whatsapp_instances")
    .update({
      qr_status: null,
      last_synced_at: now,
      metadata: {
        ...connectionMetadata,
        last_platform_action: "reset_connection",
        last_reset_response: sanitizeProviderData(result.data),
        last_reset_at: now,
      },
    })
    .eq("id", instance.id);

  if (error) {
    throw new Error(`Nao foi possivel registrar o reset da conexao WhatsApp interna: ${error.message}`);
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

async function listPlatformCloneRealTests(
  client: SupabaseClient,
  agentId: string,
): Promise<ClientCloneRealTestSummary> {
  const { data, error } = await client
    .from("intelligence_events")
    .select("id, title, summary, confidence, payload, created_at")
    .eq("producer_agent_id", agentId)
    .eq("event_type", "whatsapp.clone.real_test_turn")
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    return emptyCloneRealTestSummary();
  }

  return buildCloneRealTestSummary((data ?? []) as CloneRealTestEventRow[]);
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

function getCloneProfileConfig(agent: AgentRow | null): WhatsappCloneProfile {
  return normalizeWhatsappCloneProfile(readRecord(agent?.metadata)?.whatsapp_clone_profile);
}

function getCloneMemoryConfig(agent: AgentRow | null) {
  return normalizeWhatsappCloneMemory(readRecord(agent?.metadata)?.whatsapp_clone_memory);
}

function getCloneProfileImportStatus(agent: AgentRow | null) {
  return normalizeWhatsappCloneProfileImportStatus(readRecord(agent?.metadata)?.whatsapp_clone_profile_import);
}

function emptyCloneRealTestSummary(): ClientCloneRealTestSummary {
  return {
    total: 0,
    averageScore: null,
    lastScore: null,
    reviewCount: 0,
    lastEventAt: null,
    events: [],
  };
}

function buildCloneRealTestSummary(rows: CloneRealTestEventRow[]): ClientCloneRealTestSummary {
  const events = rows.map(mapCloneRealTestEvent);
  const scores = events
    .map((event) => event.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

  return {
    total: events.length,
    averageScore: scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : null,
    lastScore: events[0]?.score ?? null,
    reviewCount: events.filter((event) => event.reviewFlags.length > 0).length,
    lastEventAt: events[0]?.createdAt ?? null,
    events,
  };
}

function mapCloneRealTestEvent(row: CloneRealTestEventRow): ClientCloneRealTestSummary["events"][number] {
  const payload = readRecord(row.payload) ?? {};
  const humanizationScore = readNumber(payload.humanizationScore) ?? readNumber(payload.score) ?? row.confidence ?? null;
  const reviewFlags = uniqueStrings([
    ...readStringList(payload.humanizationReviewFlags, 8),
    ...readStringList(payload.reviewFlags, 8),
  ]);

  return {
    id: row.id,
    title: row.title ?? "Metrica de humanizacao",
    summary: row.summary ?? readString(payload.outputPreview) ?? "",
    score: humanizationScore,
    humanizationScore,
    humanizationMetrics: normalizeCloneHumanizationMetrics(payload.humanizationMetrics),
    reviewFlags,
    outboundMessages: readNumber(payload.outboundMessages) ?? 0,
    outboundModes: readStringList(payload.outboundModes, 4),
    linkCount: readNumber(payload.linkCount) ?? 0,
    usedSharedCompanyContext: payload.usedSharedCompanyContext === true,
    cloneProfileEnabled: payload.cloneProfileEnabled === true,
    createdAt: row.created_at,
  };
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
      events: ["messages", "messages_update", "connection", "history", "presence", "chats", "contacts", "groups", "labels", "chat_labels", "newsletter_messages"],
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

  const status = resolveUazapiWhatsappStatus(result.data);

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

function buildResetProviderInstanceName(baseName: string) {
  const suffix = `reset-${Date.now().toString(36).slice(-8)}`;
  return `${baseName.slice(0, 63 - suffix.length)}-${suffix}`.slice(0, 64);
}

function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNotReconnectableResetResponse(result: { data: unknown }) {
  const text = `${readProviderError(result.data) ?? ""} ${safeJsonStringify(result.data)}`.toLowerCase();
  return /not reconnectable|nao.*recuper|não.*recuper|not.*recover|cannot.*recover|can't.*recover/.test(text);
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "";
  }
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

function readStringList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)
    .slice(0, limit);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
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

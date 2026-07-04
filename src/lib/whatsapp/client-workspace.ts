import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { generateElevenLabsAudio } from "@/lib/elevenlabs/tts";
import { listWhatsappAudioVoices, type WhatsappAudioVoiceState } from "@/lib/elevenlabs/voices";
import {
  leadQualificationConfigKey,
  normalizeLeadQualificationConfig,
  type LeadQualificationConfig,
} from "@/lib/leads/qualification";
import { decryptCredentialValue, encryptCredentialValue, previewCredentialValue } from "@/lib/security/credentials-crypto";
import type { CurrentOrganization } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { buildTrackedLinkUrl } from "@/lib/tracking/tracked-links";
import { resolveUazapiWhatsappStatus } from "@/lib/uazapi/status";
import {
  defaultWhatsappAgentPrompt,
  defaultWhatsappBehaviorConfig,
  defaultWhatsappGlobalPrompt,
  mergeWhatsappHandoffNotificationSettings,
  normalizeWhatsappCloneMemory,
  normalizeWhatsappCloneProfile,
  normalizeWhatsappBehaviorConfig,
  type WhatsappBehaviorConfig,
  type WhatsappCloneMemory,
  type WhatsappCloneProfile,
} from "./agent-behavior";
import {
  describeWhatsappHandoffNotificationResult,
  processWhatsappHandoffNotification,
} from "./handoff-notifications";
import {
  normalizeCloneHumanizationMetrics,
  type CloneHumanizationMetric,
} from "./clone-humanization";
import {
  enqueueWhatsappCloneProfileImport,
  normalizeWhatsappCloneProfileImportStatus,
  type WhatsappCloneProfileImportStatus,
} from "./clone-profile-history";
import {
  appendConnectionDiagnosticEvent,
  isPasskeyDisconnectReason,
  readConnectionDiagnostics,
  resolveConnectionDiagnosticEventType,
  type WhatsappConnectionDiagnostics,
} from "./connection-diagnostics";
import { loadUazapiCredentials, type UazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;

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

type AgentRow = {
  id: string;
  organization_id: string;
  sector_code: string | null;
  sector_name: string | null;
  agent_code: string | null;
  prompt: string | null;
  persona_name: string | null;
  name: string;
  avatar_url: string | null;
  avatar_alt: string | null;
  updated_at: string | null;
  created_at: string | null;
  metadata: JsonRecord | null;
};

type AgentRunAlertRow = {
  id: string;
  agent_id: string | null;
  organization_id: string | null;
  run_status: string | null;
  input_summary: string | null;
  output_summary: string | null;
  metadata: JsonRecord | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
};

type KnowledgeMemoryRow = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  metadata: JsonRecord | null;
  created_at: string | null;
};

export type ClientKnowledgeFile = {
  id: string;
  title: string;
  fileName: string;
  contentType: string | null;
  size: number | null;
  storageUrl: string | null;
  createdAt: string | null;
};

export type ClientTrackedLinkButton = {
  id: string;
  label: string;
  url: string;
  tag: string;
  trackingUrl: string;
  clicks: number;
  createdAt: string | null;
};

export type ClientWhatsappRuntimeAlert = {
  id: string;
  kind: "internal_instance_block";
  tone: "warning";
  title: string;
  message: string;
  runId: string;
  conversationId: string | null;
  whatsappInstanceId: string | null;
  providerChatId: string | null;
  phoneNumber: string | null;
  occurredAt: string | null;
  inputPreview: string | null;
  outputSummary: string | null;
};

export type ClientCloneRealTestEvent = {
  id: string;
  title: string;
  summary: string;
  score: number | null;
  humanizationScore: number | null;
  humanizationMetrics: CloneHumanizationMetric[];
  reviewFlags: string[];
  outboundMessages: number;
  outboundModes: string[];
  linkCount: number;
  usedSharedCompanyContext: boolean;
  cloneProfileEnabled: boolean;
  createdAt: string | null;
};

export type ClientCloneRealTestSummary = {
  total: number;
  averageScore: number | null;
  lastScore: number | null;
  reviewCount: number;
  lastEventAt: string | null;
  events: ClientCloneRealTestEvent[];
};

export type ClientWhatsappState = {
  instance: {
    id: string;
    provider: "uazapi";
    status: WhatsappStatus;
    phoneNumber: string | null;
    displayName: string | null;
    profileImageUrl: string | null;
    connectedAt: string | null;
    disconnectedAt: string | null;
    lastSyncedAt: string | null;
    lastHeartbeatAt: string | null;
    lastMessageAt: string | null;
    tokenReady: boolean;
    connectionDiagnostics: WhatsappConnectionDiagnostics;
  } | null;
  agent: {
    id: string;
    companyId?: string;
    sectorCode?: string | null;
    sectorName?: string | null;
    name: string;
    avatarUrl: string | null;
    avatarAlt: string | null;
    prompt: string;
    promptPreview: string;
    cloneProfile: WhatsappCloneProfile;
    cloneMemory: WhatsappCloneMemory;
    cloneProfileImport: WhatsappCloneProfileImportStatus;
    qualification: LeadQualificationConfig;
    updatedAt: string | null;
  } | null;
  globalAgent: {
    id: string;
    name: string;
    prompt: string;
    promptPreview: string;
    updatedAt: string | null;
  };
  behavior: WhatsappBehaviorConfig;
  audio: WhatsappAudioVoiceState;
  knowledge: {
    files: ClientKnowledgeFile[];
  };
  linkButtons: ClientTrackedLinkButton[];
  cloneTest: ClientCloneRealTestSummary;
  runtimeAlerts: ClientWhatsappRuntimeAlert[];
  capability: {
    canConnect: boolean;
    schemaReady: boolean;
    message: string | null;
  };
};

export type ClientWhatsappActionResult = {
  state: ClientWhatsappState;
  notice: {
    tone: "success" | "warning" | "error";
    message: string;
  };
  qrCode: string | null;
  pairCode: string | null;
};

const whatsappAgentCode = "agente-whatsapp-sistema";
const whatsappGlobalAgentCode = "agente-whatsapp-global";
const maxPromptLength = 8000;
const agentSelectColumns = "id, organization_id, sector_code, sector_name, agent_code, prompt, persona_name, name, avatar_url, avatar_alt, updated_at, created_at, metadata";

export async function getClientWhatsappState(input: {
  organization: CurrentOrganization;
  userId: string;
  agentId?: string | null;
  client?: SupabaseClient;
}): Promise<ClientWhatsappState> {
  const client = input.client ?? createServiceClient();
  const agent = await getWorkspaceWhatsappAgent(client, input.organization.id, input.agentId);
  const [rawInstance, globalAgent, knowledgeFiles, linkButtons, cloneTest] = await Promise.all([
    getWorkspaceInstance(client, input.organization.id, agent),
    getOrCreateWorkspaceGlobalAgent(client, input.organization, input.userId),
    listWorkspaceKnowledge(client, input.organization.id),
    listWorkspaceLinkButtons(client, input.organization.id),
    agent
      ? listOrganizationCloneRealTests(client, input.organization.id, agent.id)
      : Promise.resolve(emptyCloneRealTestSummary()),
  ]);

  const instance = rawInstance?.instance_token_encrypted && rawInstance.status !== "connected"
    ? await syncClientInstanceStatus(client, rawInstance).catch(() => rawInstance)
    : rawInstance;

  const behavior = getBehaviorConfig(globalAgent, instance, agent);
  const [audio, runtimeAlerts] = await Promise.all([
    listWhatsappAudioVoices({ organizationId: input.organization.id, client }),
    listWhatsappRuntimeAlerts(client, {
      organizationId: input.organization.id,
      agentId: agent?.id ?? null,
      instanceId: instance?.id ?? null,
    }),
  ]);

  return buildState(instance, agent, globalAgent, behavior, audio, knowledgeFiles, linkButtons, cloneTest, runtimeAlerts);
}

export async function listWhatsappRuntimeAlerts(
  client: SupabaseClient,
  input: {
    organizationId?: string | null;
    agentId?: string | null;
    instanceId?: string | null;
    limit?: number;
  },
): Promise<ClientWhatsappRuntimeAlert[]> {
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 10);

  if (!input.organizationId && !input.agentId && !input.instanceId) {
    return [];
  }

  let query = client
    .from("agent_runs")
    .select("id, agent_id, organization_id, run_status, input_summary, output_summary, metadata, started_at, finished_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (input.organizationId) {
    query = query.eq("organization_id", input.organizationId);
  }

  if (input.agentId) {
    query = query.eq("agent_id", input.agentId);
  }

  const { data, error } = await query;

  if (error) {
    return [];
  }

  return ((data ?? []) as AgentRunAlertRow[])
    .filter((row) => isInternalInstanceRuntimeRun(row, input.instanceId ?? null))
    .slice(0, limit)
    .map(mapInternalInstanceRuntimeAlert);
}

export async function connectClientWhatsapp(input: {
  organization: CurrentOrganization;
  userId: string;
  agentId?: string | null;
  connectPhone?: string | null;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const agent = await requireWorkspaceWhatsappAgent(client, input.organization.id, input.agentId);
  const connectPhone = normalizePhone(input.connectPhone);
  const connectionMode = connectPhone ? "phone" : "qr";
  const connectStartedAt = new Date().toISOString();
  const connectPayload: JsonRecord = {
    browser: "auto",
    systemName: "ConnectyHub",
    ...(connectPhone ? { phone: connectPhone } : {}),
  };
  const existing = await getWorkspaceInstance(client, input.organization.id, agent);
  let instance = existing?.instance_token_encrypted
    ? existing
    : existing?.provider_instance_id
      ? await recoverProviderInstanceToken(client, credentials, existing) ?? await createProviderInstance(client, credentials, input.organization, agent, input.userId)
      : await createProviderInstance(client, credentials, input.organization, agent, input.userId);
  let token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("A instancia existe, mas o token seguro nao esta disponivel. Sincronize ou recrie a conexao.");
  }

  let connectResult = await callUazapi(credentials, "/instance/connect", {
    method: "POST",
    token,
    body: connectPayload,
    tolerateError: true,
  });

  if (!connectResult.ok && isInvalidInstanceTokenResponse(connectResult)) {
    await markWorkspaceInstanceDisconnected(client, instance, {
      action: "connect_invalid_token",
      clearToken: true,
      providerData: connectResult.data,
      reason: "invalid_instance_token",
    });

    instance = await createProviderInstance(client, credentials, input.organization, agent, input.userId);
    token = decryptInstanceToken(instance);

    if (!token) {
      throw new Error("A nova instancia foi criada, mas o token seguro nao esta disponivel.");
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
  const connectedAt = status === "connected" ? now : instance.connected_at;
  const webhookResult = await configureClientWebhook(credentials, token, instance.provider_instance_id);

  await client
    .from("whatsapp_instances")
    .update({
      status: pendingConnection ? "qr_pending" : status,
      qr_status: qrCode ? "available" : pairCode ? "pair_code" : null,
      phone_number: phoneNumber,
      display_name: displayName,
      connected_at: connectedAt,
      disconnected_at: null,
      webhook_url: credentials.webhookUrl,
      webhook_configured_at: webhookResult.ok ? now : instance.webhook_configured_at,
      last_synced_at: now,
      metadata: {
        ...connectionMetadata,
        ...buildAgentInstanceMetadata(input.organization, agent),
        ...(profileImageUrl ? { profile_image_url: profileImageUrl, profile_image_synced_at: now } : {}),
        webhook_status: webhookResult.ok ? "configured" : "not_configured",
        webhook_error: webhookResult.ok ? null : webhookResult.reason,
        last_client_action: "connect",
        last_connect_request: sanitizeProviderData(connectPayload),
        last_connect_response: sanitizeProviderData(connectResult.data),
        ...(profileData ? { last_profile_response: sanitizeProviderData(profileData) } : {}),
        ...(avatarData ? { last_avatar_response: sanitizeProviderData(avatarData) } : {}),
      },
    })
    .eq("id", instance.id);

  const state = await getClientWhatsappState({ organization: input.organization, userId: input.userId, agentId: agent.id, client });
  revalidatePath("/dashboard/whatsapp");

  return {
    state,
    notice: {
      tone: pendingConnection ? "warning" : "success",
      message: qrCode
        ? "Escaneie o QR Code para concluir a conexao."
        : pairCode
          ? "Use o codigo de pareamento no WhatsApp para concluir a conexao."
          : "WhatsApp conectado ou em processo de conexao.",
    },
    qrCode,
    pairCode,
  };
}

export async function refreshClientWhatsappStatus(input: {
  organization: CurrentOrganization;
  userId: string;
  agentId?: string | null;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const agent = await requireWorkspaceWhatsappAgent(client, input.organization.id, input.agentId);
  const instance = await requireWorkspaceInstance(client, input.organization.id, agent);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("Conexao sem token seguro. Conecte o WhatsApp novamente.");
  }

  const result = await callUazapi(credentials, "/instance/status", { method: "GET", token, tolerateError: true });

  if (!result.ok) {
    if (isInvalidInstanceTokenResponse(result)) {
      await markWorkspaceInstanceDisconnected(client, instance, {
        action: "refresh_invalid_token",
        clearToken: true,
        providerData: result.data,
        reason: "invalid_instance_token",
      });

      const state = await getClientWhatsappState({ organization: input.organization, userId: input.userId, agentId: agent.id, client });
      revalidatePath("/dashboard/whatsapp");

      return {
        state,
        notice: {
          tone: "warning",
          message: "WhatsApp desconectado no celular. Gere um novo QR Code para reconectar.",
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
  const webhookResult = status === "connected"
    ? await configureClientWebhook(credentials, token, instance.provider_instance_id)
    : null;

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
        ...buildAgentInstanceMetadata(input.organization, agent),
        ...(profileImageUrl ? { profile_image_url: profileImageUrl, profile_image_synced_at: now } : {}),
        ...(webhookResult
          ? {
              webhook_status: webhookResult.ok ? "configured" : "not_configured",
              webhook_error: webhookResult.ok ? null : webhookResult.reason,
            }
          : {}),
        last_client_action: "refresh_status",
        last_status_response: sanitizeProviderData(result.data),
        last_disconnect_reason: lastDisconnectReason,
        ...(profileData ? { last_profile_response: sanitizeProviderData(profileData) } : {}),
        ...(avatarData ? { last_avatar_response: sanitizeProviderData(avatarData) } : {}),
      },
    })
    .eq("id", instance.id);

  const state = await getClientWhatsappState({ organization: input.organization, userId: input.userId, agentId: agent.id, client });
  revalidatePath("/dashboard/whatsapp");

  return {
    state,
    notice: {
      tone: state.instance?.status === "connected" ? "success" : "warning",
      message: state.instance?.status === "connected"
        ? "WhatsApp conectado."
        : isPasskeyDisconnectReason(lastDisconnectReason)
          ? "O WhatsApp pediu um segundo QR de chave de acesso, mas o provedor nao retornou esse desafio para o painel."
        : pairCode
          ? "Codigo de pareamento atualizado."
          : "Status atualizado. Conexao ainda nao esta ativa.",
    },
    qrCode: state.instance?.status === "connected" ? null : qrCode,
    pairCode: state.instance?.status === "connected" ? null : pairCode,
  };
}

export async function disconnectClientWhatsapp(input: {
  organization: CurrentOrganization;
  userId: string;
  agentId?: string | null;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const agent = await requireWorkspaceWhatsappAgent(client, input.organization.id, input.agentId);
  const instance = await requireWorkspaceInstance(client, input.organization.id, agent);
  const token = decryptInstanceToken(instance);

  if (!token) {
    await markWorkspaceInstanceDisconnected(client, instance, {
      action: "disconnect_missing_token",
      clearToken: true,
      reason: "missing_local_token",
    });

    const state = await getClientWhatsappState({ organization: input.organization, userId: input.userId, agentId: agent.id, client });
    revalidatePath("/dashboard/whatsapp");

    return {
      state,
      notice: { tone: "warning", message: "WhatsApp marcado como desconectado. Gere um novo QR Code para reconectar." },
      qrCode: null,
      pairCode: null,
    };
  }

  const result = await callUazapi(credentials, "/instance/disconnect", { method: "POST", token, tolerateError: true });

  if (!result.ok && !isInvalidInstanceTokenResponse(result)) {
    throw new Error(readProviderError(result.data) ?? `Uazapi respondeu status ${result.status}.`);
  }

  const tokenInvalid = !result.ok && isInvalidInstanceTokenResponse(result);

  await markWorkspaceInstanceDisconnected(client, instance, {
    action: tokenInvalid ? "disconnect_invalid_token" : "disconnect",
    clearToken: tokenInvalid,
    providerData: result.data,
    reason: tokenInvalid ? "invalid_instance_token" : "manual_disconnect",
  });

  const state = await getClientWhatsappState({ organization: input.organization, userId: input.userId, agentId: agent.id, client });
  revalidatePath("/dashboard/whatsapp");

  return {
    state,
    notice: {
      tone: "warning",
      message: tokenInvalid
        ? "A sessao ja estava desconectada no provedor. Gere um novo QR Code para reconectar."
        : "WhatsApp desconectado.",
    },
    qrCode: null,
    pairCode: null,
  };
}

export async function resetClientWhatsappConnection(input: {
  organization: CurrentOrganization;
  userId: string;
  agentId?: string | null;
  connectPhone?: string | null;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const connectPhone = normalizePhone(input.connectPhone);

  if (input.connectPhone && (!connectPhone || connectPhone.length < 10)) {
    throw new Error("Informe o telefone com DDI usando apenas numeros.");
  }

  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const agent = await requireWorkspaceWhatsappAgent(client, input.organization.id, input.agentId);
  const existing = await getWorkspaceInstance(client, input.organization.id, agent);

  if (!existing) {
    throw new Error("Gere uma conexao WhatsApp antes de usar o reset.");
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
      await recordWorkspaceConnectionReset(client, instance, resetResult);
      await sleep(6000);
    } else if (isInvalidInstanceTokenResponse(resetResult) || isNotReconnectableResetResponse(resetResult)) {
      await markWorkspaceInstanceDisconnected(client, instance, {
        action: isInvalidInstanceTokenResponse(resetResult) ? "reset_invalid_token" : "reset_not_reconnectable",
        clearToken: isInvalidInstanceTokenResponse(resetResult),
        providerData: resetResult.data,
        reason: isInvalidInstanceTokenResponse(resetResult) ? "invalid_instance_token" : "not_reconnectable",
      });
      await createProviderInstance(client, credentials, input.organization, agent, input.userId, { forceNew: true });
    } else {
      throw new Error(readProviderError(resetResult.data) ?? `Uazapi respondeu status ${resetResult.status}.`);
    }
  } else {
    await createProviderInstance(client, credentials, input.organization, agent, input.userId, { forceNew: true });
  }

  const result = await connectClientWhatsapp({
    organization: input.organization,
    userId: input.userId,
    agentId: agent.id,
    connectPhone,
    client,
  });

  return {
    ...result,
    notice: {
      tone: result.notice?.tone ?? "success",
      message: result.pairCode
        ? "Sessao resetada. Use o codigo de pareamento para concluir."
        : result.qrCode
          ? "Sessao resetada. Escaneie o novo QR Code para concluir."
          : "Sessao resetada e reconexao iniciada.",
    },
  };
}

export async function sendClientWhatsappTest(input: {
  organization: CurrentOrganization;
  userId: string;
  agentId?: string | null;
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
  const agent = await requireWorkspaceWhatsappAgent(client, input.organization.id, input.agentId);
  const instance = await requireWorkspaceInstance(client, input.organization.id, agent);
  const globalAgent = await getOrCreateWorkspaceGlobalAgent(client, input.organization, input.userId);
  const behavior = getBehaviorConfig(globalAgent, instance, agent);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("Conecte o WhatsApp antes de enviar mensagens.");
  }

  let deliveryMode: "text" | "audio" = "text";
  let generatedAudio: Awaited<ReturnType<typeof generateElevenLabsAudio>> | null = null;

  if (behavior.responseMode === "audio") {
    deliveryMode = "audio";
    generatedAudio = await generateElevenLabsAudio({
      organizationId: input.organization.id,
      userId: input.userId,
      text,
      voiceId: behavior.audioVoiceId || null,
      voicePublicOwnerId: behavior.audioVoicePublicOwnerId || null,
      voiceName: behavior.audioVoiceName || null,
      modelId: behavior.audioModelId || null,
      source: "whatsapp_test",
      metadata: {
        whatsappInstanceId: instance.id,
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
        track_id: `client_test_audio_${Date.now()}`,
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
        track_id: `client_test_${Date.now()}`,
      },
    });
  }

  await client
    .from("whatsapp_instances")
    .update({
      last_message_at: new Date().toISOString(),
      metadata: {
        ...(instance.metadata ?? {}),
        last_client_action: "send_test",
        last_test_delivery_mode: deliveryMode,
        last_test_audio_media_id: generatedAudio?.mediaId ?? null,
        last_test_audio_object_key: generatedAudio?.objectKey ?? null,
      },
    })
    .eq("id", instance.id);

  const state = await getClientWhatsappState({ organization: input.organization, userId: input.userId, agentId: agent.id, client });

  return {
    state,
    notice: { tone: "success", message: deliveryMode === "audio" ? "Audio de teste enviado." : "Mensagem de teste enviada." },
    qrCode: null,
    pairCode: null,
  };
}

export async function sendClientWhatsappHandoffNotificationTest(input: {
  organization: CurrentOrganization;
  userId: string;
  agentId?: string | null;
  behavior?: unknown;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const agent = await requireWorkspaceWhatsappAgent(client, input.organization.id, input.agentId);
  const instance = await requireWorkspaceInstance(client, input.organization.id, agent);
  const globalAgent = await getOrCreateWorkspaceGlobalAgent(client, input.organization, input.userId);
  const behaviorDraft = normalizeWhatsappBehaviorConfig(input.behavior ?? getBehaviorConfig(globalAgent, instance, agent));
  const behavior = mergeWhatsappHandoffNotificationSettings(getBehaviorConfig(globalAgent, instance, agent), behaviorDraft);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("Conecte o WhatsApp antes de testar o aviso humano.");
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
      organizationId: input.organization.id,
      whatsappInstanceId: instance.id,
      test: true,
      notificationNumbers: behavior.humanHandoffNotificationNumbers,
      notificationCooldownMinutes: behavior.humanHandoffNotificationCooldownMinutes,
      requestedByUserId: input.userId,
      requestText: "Teste de aviso de atendimento humano.",
      requestedAt,
      source: "client_dashboard_test",
    },
  });
  const resultMessage = describeWhatsappHandoffNotificationResult(notificationResult);

  if (notificationResult.status !== "sent") {
    throw new Error(resultMessage);
  }

  await persistClientHandoffNotificationSettings(client, agent, behavior, input.userId, requestedAt);

  await client
    .from("whatsapp_instances")
    .update({
      metadata: {
        ...(instance.metadata ?? {}),
        behavior_config: behavior,
        behavior_updated_at: requestedAt,
        behavior_updated_by: input.userId,
        last_client_action: "send_handoff_test",
        last_handoff_test_sent_at: requestedAt,
        last_handoff_test_result: notificationResult,
      },
    })
    .eq("id", instance.id);

  const state = await getClientWhatsappState({ organization: input.organization, userId: input.userId, agentId: agent.id, client });

  return {
    state,
    notice: { tone: "success", message: resultMessage },
    qrCode: null,
    pairCode: null,
  };
}

async function persistClientHandoffNotificationSettings(
  client: SupabaseClient,
  agent: AgentRow,
  behavior: WhatsappBehaviorConfig,
  userId: string,
  updatedAt: string,
) {
  const { error: agentError } = await client
    .from("agent_registry")
    .update({
      metadata: {
        ...(agent.metadata ?? {}),
        whatsapp_behavior_config: behavior,
        prompt_control: {
          ...(readRecord(readRecord(agent.metadata)?.prompt_control) ?? {}),
          last_updated_at: updatedAt,
          last_updated_by: userId,
          source: "client_dashboard_handoff_test",
        },
      },
    })
    .eq("id", agent.id);

  if (agentError) {
    throw new Error(`Nao foi possivel salvar o aviso humano: ${agentError.message}`);
  }
}

export async function generateClientWhatsappCloneProfileFromHistory(input: {
  organization: CurrentOrganization;
  userId: string;
  agentId?: string | null;
  maxChats?: number;
  maxMessagesPerChat?: number;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const agent = await requireWorkspaceWhatsappAgent(client, input.organization.id, input.agentId);
  const instance = await requireWorkspaceInstance(client, input.organization.id, agent);

  if (!instance.instance_token_encrypted) {
    throw new Error("Reconecte o WhatsApp deste agente antes de gerar o DNA pelo historico.");
  }

  await enqueueWhatsappCloneProfileImport({
    scope: "client",
    agentId: agent.id,
    organizationId: input.organization.id,
    instanceId: instance.id,
    requestedBy: input.userId,
    maxChats: input.maxChats,
    maxMessagesPerChat: input.maxMessagesPerChat,
    client,
  });

  const state = await getClientWhatsappState({
    organization: input.organization,
    userId: input.userId,
    agentId: agent.id,
    client,
  });

  return {
    state,
    notice: {
      tone: "success",
      message: "Analise do historico enviada para o Inngest. O DNA sera preenchido quando terminar.",
    },
    qrCode: null,
    pairCode: null,
  };
}

export async function updateClientWhatsappPrompt(input: {
  organization: CurrentOrganization;
  userId: string;
  agentId?: string | null;
  prompt?: string;
  agentPrompt?: string;
  globalPrompt?: string;
  behavior?: unknown;
  cloneProfile?: unknown;
  qualificationConfig?: unknown;
  client?: SupabaseClient;
}): Promise<ClientWhatsappState> {
  const agentPrompt = (input.agentPrompt ?? input.prompt)?.trim();
  const globalPrompt = input.globalPrompt?.trim();
  const hasAgentPrompt = typeof agentPrompt === "string";
  const hasGlobalPrompt = typeof globalPrompt === "string";

  if (hasAgentPrompt && !agentPrompt) {
    throw new Error("O prompt do agente nao pode ficar vazio.");
  }

  if (hasGlobalPrompt && !globalPrompt) {
    throw new Error("O prompt global nao pode ficar vazio.");
  }

  if (hasAgentPrompt && agentPrompt.length > maxPromptLength) {
    throw new Error(`O prompt pode ter no maximo ${maxPromptLength} caracteres.`);
  }

  if (hasGlobalPrompt && globalPrompt.length > maxPromptLength) {
    throw new Error(`O prompt global pode ter no maximo ${maxPromptLength} caracteres.`);
  }

  const client = input.client ?? createServiceClient();
  const agent = await requireWorkspaceWhatsappAgent(client, input.organization.id, input.agentId);
  const [globalAgent, instance] = await Promise.all([
    getOrCreateWorkspaceGlobalAgent(client, input.organization, input.userId),
    getWorkspaceInstance(client, input.organization.id, agent),
  ]);
  const resolvedInstance = instance && agent ? await ensureInstanceAgentMetadata(client, instance, input.organization, agent) : instance;
  const nextBehavior = normalizeWhatsappBehaviorConfig(input.behavior ?? getBehaviorConfig(globalAgent, resolvedInstance, agent));
  const hasCloneProfile = input.cloneProfile !== undefined;
  const nextCloneProfile = hasCloneProfile
    ? normalizeWhatsappCloneProfile(input.cloneProfile)
    : getCloneProfileConfig(agent);
  const hasQualificationConfig = input.qualificationConfig !== undefined;
  const nextQualificationConfig = hasQualificationConfig
    ? normalizeLeadQualificationConfig(input.qualificationConfig)
    : getLeadQualificationConfig(agent);
  const now = new Date().toISOString();

  if (hasAgentPrompt || hasQualificationConfig || input.behavior !== undefined || hasCloneProfile) {
    const promptToSave = hasAgentPrompt ? agentPrompt : agent.prompt?.trim() || defaultWhatsappAgentPrompt;
    const nextVersion = hasAgentPrompt ? await getNextPromptVersion(client, agent.id) : null;
    const { error } = await client
      .from("agent_registry")
      .update({
        prompt: promptToSave,
        status: "needs_review",
        metadata: {
          ...(agent.metadata ?? {}),
          whatsapp_behavior_config: nextBehavior,
          whatsapp_clone_profile: nextCloneProfile,
          [leadQualificationConfigKey]: nextQualificationConfig,
          prompt_control: {
            last_updated_at: now,
            last_updated_by: input.userId,
            previous_length: agent.prompt?.length ?? 0,
            current_length: promptToSave.length,
            source: "client_dashboard",
          },
        },
      })
      .eq("id", agent.id);

    if (error) {
      throw new Error(`Nao foi possivel salvar o prompt: ${error.message}`);
    }

    if (nextVersion) {
      await client.from("agent_prompt_versions").insert({
        agent_id: agent.id,
        version_number: nextVersion,
        prompt: promptToSave,
        change_note: "Atualizado no painel do cliente",
        created_by: input.userId,
      });
    }
  }

  if (hasGlobalPrompt) {
    const nextGlobalVersion = hasGlobalPrompt ? await getNextPromptVersion(client, globalAgent.id) : null;
    const promptToSave = hasGlobalPrompt ? globalPrompt : globalAgent.prompt?.trim() || defaultWhatsappGlobalPrompt;
    const { error } = await client
      .from("agent_registry")
      .update({
        prompt: promptToSave,
        status: "needs_review",
        metadata: {
          ...(globalAgent.metadata ?? {}),
          prompt_control: {
            last_updated_at: now,
            last_updated_by: input.userId,
            previous_length: globalAgent.prompt?.length ?? 0,
            current_length: promptToSave.length,
            source: "client_dashboard",
          },
        },
      })
      .eq("id", globalAgent.id);

    if (error) {
      throw new Error(`Nao foi possivel salvar o comportamento: ${error.message}`);
    }

    if (hasGlobalPrompt && nextGlobalVersion) {
      await client.from("agent_prompt_versions").insert({
        agent_id: globalAgent.id,
        version_number: nextGlobalVersion,
        prompt: promptToSave,
        change_note: "Prompt global atualizado no painel do cliente",
        created_by: input.userId,
      });
    }

  }

  if (resolvedInstance && input.behavior !== undefined) {
    await client
      .from("whatsapp_instances")
      .update({
        metadata: {
          ...(resolvedInstance.metadata ?? {}),
          ...buildAgentInstanceMetadata(input.organization, agent),
          behavior_config: nextBehavior,
          behavior_updated_at: now,
          behavior_updated_by: input.userId,
        },
      })
      .eq("id", resolvedInstance.id);
  }

  revalidatePath("/dashboard/whatsapp");
  return getClientWhatsappState({ organization: input.organization, userId: input.userId, agentId: agent.id, client });
}

async function createProviderInstance(
  client: SupabaseClient,
  credentials: UazapiCredentials,
  organization: CurrentOrganization,
  agent: AgentRow,
  userId: string,
  options: { forceNew?: boolean } = {},
) {
  const now = new Date().toISOString();
  const baseName = buildProviderInstanceName(organization, agent);
  const name = options.forceNew ? buildResetProviderInstanceName(baseName) : baseName;

  const existingInProvider = options.forceNew ? null : await findProviderInstanceByName(credentials, name);
  if (!options.forceNew && existingInProvider) {
    return await upsertRecoveredClientInstance(client, credentials, existingInProvider, organization, agent, userId, now);
  }

  const result = await callUazapi(credentials, "/instance/create", {
    method: "POST",
    admin: true,
    body: {
      name,
      systemName: `ConnectyHub - ${organization.name} - ${agent.name}`,
      adminField01: organization.id,
      adminField02: userId,
      adminField03: agent.id,
    },
  });
  const providerInstanceId = findString(result.data, ["id", "instance_id", "instanceId", "instanceid"]);
  const token = findString(result.data, ["token", "instanceToken", "instance_token"]);
  const profileImageUrl = extractProfileImageUrl(result.data);

  if (!providerInstanceId || !token) {
    throw new Error("A Uazapi nao retornou id/token da instancia. Tente novamente ou verifique as credenciais no Admin OS.");
  }

  const webhookResult = await configureClientWebhook(credentials, token, providerInstanceId);
  const payload = {
    organization_id: organization.id,
    owner_user_id: userId,
    provider: "uazapi",
    provider_instance_id: providerInstanceId,
    phone_number: normalizePhone(findString(result.data, ["owner", "phone", "number", "phone_number"])),
    display_name: findString(result.data, ["profileName", "displayName", "name"]) ?? organization.name,
    status: "draft" as WhatsappStatus,
    qr_status: null,
    instance_token_preview: previewCredentialValue(token, "secret"),
    instance_token_encrypted: encryptCredentialValue(token),
    webhook_url: credentials.webhookUrl,
    webhook_configured_at: webhookResult.ok ? now : null,
    last_synced_at: now,
    plan_code: organization.planCode,
    created_by: userId,
    metadata: {
      created_from: "client_dashboard",
      provider_name: name,
      ...buildAgentInstanceMetadata(organization, agent),
      behavior_config: defaultWhatsappBehaviorConfig,
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
    throw new Error(`Nao foi possivel verificar a instancia WhatsApp: ${existingError.message}`);
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
    .select("id, organization_id, owner_user_id, provider, provider_instance_id, phone_number, display_name, status, qr_status, instance_token_preview, instance_token_encrypted, webhook_url, webhook_configured_at, last_synced_at, last_heartbeat_at, last_message_at, connected_at, disconnected_at, metadata, updated_at")
    .single<WhatsappInstanceRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar a instancia WhatsApp.");
  }

  await client
    .from("whatsapp_instances")
    .update({ status: "archived", metadata: { archived_reason: "replaced_by_new_instance", replaced_by: data.id, archived_at: now } })
    .eq("provider", "uazapi")
    .eq("organization_id", organization.id)
    .contains("metadata", { agent_id: agent.id })
    .neq("id", data.id)
    .neq("status", "archived");

  return data;
}

async function getWorkspaceInstance(client: SupabaseClient, organizationId: string, agent?: AgentRow | null) {
  if (agent?.id) {
    const { data, error } = await client
      .from("whatsapp_instances")
      .select("id, organization_id, owner_user_id, provider, provider_instance_id, phone_number, display_name, status, qr_status, instance_token_preview, instance_token_encrypted, webhook_url, webhook_configured_at, last_synced_at, last_heartbeat_at, last_message_at, connected_at, disconnected_at, metadata, updated_at")
      .eq("organization_id", organizationId)
      .eq("provider", "uazapi")
      .contains("metadata", { agent_id: agent.id })
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<WhatsappInstanceRow>();

    if (error) {
      if (error.message.includes("instance_token_encrypted")) {
        return null;
      }

      throw new Error(`Nao foi possivel carregar a conexao WhatsApp: ${error.message}`);
    }

    if (data) {
      return data;
    }

    const legacy = await getLegacyWorkspaceInstance(client, organizationId);

    if (legacy && canClaimLegacyInstance(agent, legacy)) {
      return ensureInstanceAgentMetadata(client, legacy, { id: organizationId, name: "" }, agent);
    }

    return null;
  }

  const { data, error } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, owner_user_id, provider, provider_instance_id, phone_number, display_name, status, qr_status, instance_token_preview, instance_token_encrypted, webhook_url, webhook_configured_at, last_synced_at, last_heartbeat_at, last_message_at, connected_at, disconnected_at, metadata, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "uazapi")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsappInstanceRow>();

  if (error) {
    if (error.message.includes("instance_token_encrypted")) {
      return null;
    }

    throw new Error(`Nao foi possivel carregar a conexao WhatsApp: ${error.message}`);
  }

  return data ?? null;
}

async function getLegacyWorkspaceInstance(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, owner_user_id, provider, provider_instance_id, phone_number, display_name, status, qr_status, instance_token_preview, instance_token_encrypted, webhook_url, webhook_configured_at, last_synced_at, last_heartbeat_at, last_message_at, connected_at, disconnected_at, metadata, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "uazapi")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(10)
    .returns<WhatsappInstanceRow[]>();

  if (error) {
    if (error.message.includes("instance_token_encrypted")) {
      return null;
    }

    throw new Error(`Nao foi possivel carregar a conexao WhatsApp: ${error.message}`);
  }

  return (data ?? []).find((instance) => !readString(readRecord(instance.metadata)?.agent_id)) ?? null;
}

function canClaimLegacyInstance(agent: AgentRow, instance: WhatsappInstanceRow) {
  const agentMetadata = readRecord(agent.metadata);

  if (readString(agentMetadata?.cloned_from_agent_id)) {
    return false;
  }

  if (readString(readRecord(instance.metadata)?.agent_id)) {
    return false;
  }

  if (!agent.created_at) {
    return true;
  }

  const agentCreatedAt = new Date(agent.created_at).getTime();
  const instanceAnchor = instance.connected_at ?? instance.last_synced_at ?? instance.updated_at;
  const instanceCreatedBeforeAgent = instanceAnchor && new Date(instanceAnchor).getTime() < agentCreatedAt;

  return !instanceCreatedBeforeAgent;
}

async function ensureInstanceAgentMetadata(
  client: SupabaseClient,
  instance: WhatsappInstanceRow,
  organization: Pick<CurrentOrganization, "id" | "name">,
  agent: AgentRow,
) {
  const currentMetadata = readRecord(instance.metadata) ?? {};

  if (readString(currentMetadata.agent_id) === agent.id) {
    return instance;
  }

  const metadata = {
    ...currentMetadata,
    ...buildAgentInstanceMetadata(organization, agent),
    agent_metadata_claimed_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("whatsapp_instances")
    .update({ metadata })
    .eq("id", instance.id)
    .select("id, organization_id, owner_user_id, provider, provider_instance_id, phone_number, display_name, status, qr_status, instance_token_preview, instance_token_encrypted, webhook_url, webhook_configured_at, last_synced_at, last_heartbeat_at, last_message_at, connected_at, disconnected_at, metadata, updated_at")
    .single<WhatsappInstanceRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel vincular esta conexao ao agente.");
  }

  return data;
}

function buildAgentInstanceMetadata(
  organization: Pick<CurrentOrganization, "id" | "name">,
  agent: AgentRow,
): JsonRecord {
  const metadata = readRecord(agent.metadata);

  return compactRecord({
    client_agent: true,
    agent_id: agent.id,
    agent_name: agent.persona_name?.trim() || agent.name,
    agent_code: agent.agent_code ?? undefined,
    company_id: organization.id,
    company_name: readString(metadata?.company_name) ?? organization.name,
    sector_code: agent.sector_code ?? readString(metadata?.sector_code) ?? undefined,
    sector_name: agent.sector_name ?? readString(metadata?.sector_name) ?? undefined,
  });
}

function compactRecord(record: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null));
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

async function upsertRecoveredClientInstance(
  client: SupabaseClient,
  credentials: UazapiCredentials,
  providerData: Record<string, unknown>,
  organization: CurrentOrganization,
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

  const webhookResult = await configureClientWebhook(credentials, token, providerInstanceId);
  const payload = {
    organization_id: organization.id,
    owner_user_id: userId,
    provider: "uazapi",
    provider_instance_id: providerInstanceId,
    phone_number: normalizePhone(findString(providerData, ["owner", "phone", "number", "phone_number"])),
    display_name: findString(providerData, ["profileName", "displayName", "name"]) ?? organization.name,
    status: "draft" as WhatsappStatus,
    qr_status: null,
    instance_token_preview: previewCredentialValue(token, "secret"),
    instance_token_encrypted: encryptCredentialValue(token),
    webhook_url: credentials.webhookUrl,
    webhook_configured_at: webhookResult.ok ? now : null,
    last_synced_at: now,
    plan_code: organization.planCode,
    created_by: userId,
    metadata: {
      created_from: "client_dashboard",
      provider_name: findString(providerData, ["name", "instanceName", "instance_name"]),
      ...buildAgentInstanceMetadata(organization, agent),
      behavior_config: defaultWhatsappBehaviorConfig,
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
    throw new Error(`Nao foi possivel verificar a instancia WhatsApp: ${existingError.message}`);
  }

  const query = existing
    ? client.from("whatsapp_instances").update(payload).eq("id", existing.id)
    : client.from("whatsapp_instances").insert(payload);

  const { data, error } = await query
    .select("id, organization_id, owner_user_id, provider, provider_instance_id, phone_number, display_name, status, qr_status, instance_token_preview, instance_token_encrypted, webhook_url, webhook_configured_at, last_synced_at, last_heartbeat_at, last_message_at, connected_at, disconnected_at, metadata, updated_at")
    .single<WhatsappInstanceRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar a instancia recuperada.");
  }

  await client
    .from("whatsapp_instances")
    .update({ status: "archived", metadata: { archived_reason: "replaced_by_recovered_instance", replaced_by: data.id, archived_at: now } })
    .eq("provider", "uazapi")
    .eq("organization_id", organization.id)
    .contains("metadata", { agent_id: agent.id })
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

  if (!response.ok || !response.data) return null;

  const list = Array.isArray(response.data)
    ? response.data
    : Array.isArray((response.data as Record<string, unknown>)?.instances)
      ? (response.data as Record<string, unknown>).instances as unknown[]
      : [];

  const match = list.find((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    const id = record.id ?? record.instance_id ?? record.instanceId;
    return typeof id === "string" && id === instance.provider_instance_id;
  }) as Record<string, unknown> | undefined;

  if (!match) return null;

  const token = findString(match, ["token", "instanceToken", "instance_token"]);
  if (!token) return null;

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
    .select("id, organization_id, owner_user_id, provider, provider_instance_id, phone_number, display_name, status, qr_status, instance_token_preview, instance_token_encrypted, webhook_url, webhook_configured_at, last_synced_at, last_heartbeat_at, last_message_at, connected_at, disconnected_at, metadata, updated_at")
    .single<WhatsappInstanceRow>();

  return error ? null : data;
}

async function requireWorkspaceInstance(client: SupabaseClient, organizationId: string, agent?: AgentRow | null) {
  const instance = await getWorkspaceInstance(client, organizationId, agent);

  if (!instance) {
    throw new Error("Conecte o WhatsApp deste agente antes de executar esta acao.");
  }

  return instance;
}

async function markWorkspaceInstanceDisconnected(
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
    last_client_action: input.action,
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
    throw new Error(`Nao foi possivel atualizar a conexao WhatsApp: ${error.message}`);
  }
}

async function recordWorkspaceConnectionReset(
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
        last_client_action: "reset_connection",
        last_reset_response: sanitizeProviderData(result.data),
        last_reset_at: now,
      },
    })
    .eq("id", instance.id);

  if (error) {
    throw new Error(`Nao foi possivel registrar o reset da conexao WhatsApp: ${error.message}`);
  }
}

async function getWorkspaceWhatsappAgent(client: SupabaseClient, organizationId: string, agentId?: string | null): Promise<AgentRow | null> {
  if (agentId) {
    const { data, error } = await client
      .from("agent_registry")
      .select(agentSelectColumns)
      .eq("id", agentId)
      .eq("scope", "organization")
      .eq("organization_id", organizationId)
      .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
      .maybeSingle<AgentRow>();

    if (error) {
      throw new Error(`Nao foi possivel carregar o agente WhatsApp: ${error.message}`);
    }

    return data ?? null;
  }

  const { data: clientAgent, error: clientAgentError } = await client
    .from("agent_registry")
    .select(agentSelectColumns)
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<AgentRow>();

  if (clientAgentError) {
    throw new Error(`Nao foi possivel carregar o agente WhatsApp: ${clientAgentError.message}`);
  }

  if (clientAgent) {
    return clientAgent;
  }

  const { data: existing, error: existingError } = await client
    .from("agent_registry")
    .select(agentSelectColumns)
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("agent_code", whatsappAgentCode)
    .maybeSingle<AgentRow>();

  if (existingError) {
    throw new Error(`Nao foi possivel carregar o agente WhatsApp: ${existingError.message}`);
  }

  return existing ?? null;
}

async function requireWorkspaceWhatsappAgent(client: SupabaseClient, organizationId: string, agentId?: string | null) {
  const agent = await getWorkspaceWhatsappAgent(client, organizationId, agentId);

  if (!agent) {
    throw new Error("Crie um agente antes de salvar prompt e comportamento.");
  }

  return agent;
}

async function getOrCreateWorkspaceGlobalAgent(client: SupabaseClient, organization: CurrentOrganization, userId: string): Promise<AgentRow> {
  const { data: existing, error: existingError } = await client
    .from("agent_registry")
    .select(agentSelectColumns)
    .eq("scope", "organization")
    .eq("organization_id", organization.id)
    .eq("agent_code", whatsappGlobalAgentCode)
    .maybeSingle<AgentRow>();

  if (existingError) {
    throw new Error(`Nao foi possivel carregar o agente global WhatsApp: ${existingError.message}`);
  }

  if (existing) {
    return existing;
  }

  const { data: platformAgent } = await client
    .from("agent_registry")
    .select("prompt, persona_name, name, avatar_url, avatar_alt, profile_bio, llm_provider, model_id")
    .eq("scope", "platform")
    .eq("agent_code", whatsappGlobalAgentCode)
    .maybeSingle<{
      prompt: string | null;
      persona_name: string | null;
      name: string;
      avatar_url: string | null;
      avatar_alt: string | null;
      profile_bio: string | null;
      llm_provider: string | null;
      model_id: string | null;
    }>();

  const { data, error } = await client
    .from("agent_registry")
    .insert({
      scope: "organization",
      organization_id: organization.id,
      sector_code: "atendimento",
      sector_name: "Atendimento IA",
      agent_code: whatsappGlobalAgentCode,
      name: "Agente Global WhatsApp",
      persona_name: platformAgent?.persona_name ?? "Rafael Nunes",
      avatar_url: platformAgent?.avatar_url ?? null,
      avatar_alt: platformAgent?.avatar_alt ?? "Agente global de WhatsApp",
      profile_bio: platformAgent?.profile_bio ?? "Controla diretrizes globais, limites e comportamento dos agentes WhatsApp da empresa.",
      role_title: "Controlador global de atendimento",
      description: "Define prompt global e comportamento padrao aplicado aos agentes de WhatsApp da organizacao.",
      prompt: platformAgent?.prompt?.trim() || defaultWhatsappGlobalPrompt,
      llm_provider: platformAgent?.llm_provider ?? "gemini",
      model_id: platformAgent?.model_id ?? null,
      status: "needs_review",
      autonomy_level: 35,
      requires_human_approval: true,
      tools: ["prompt_review", "whatsapp", "governance"],
      triggers: ["connectyhub/whatsapp.behavior.updated"],
      memory_access_level: "organization",
      created_by: userId,
      metadata: {
        created_from: "client_dashboard",
        controls_all_whatsapp_agents: true,
        whatsapp_behavior_config: defaultWhatsappBehaviorConfig,
      },
    })
    .select(agentSelectColumns)
    .single<AgentRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar o agente global WhatsApp.");
  }

  return data;
}

async function listWorkspaceKnowledge(client: SupabaseClient, organizationId: string): Promise<ClientKnowledgeFile[]> {
  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, title, content, tags, metadata, created_at")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .contains("tags", ["knowledge_base"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Nao foi possivel carregar arquivos da empresa: ${error.message}`);
  }

  return ((data ?? []) as KnowledgeMemoryRow[]).map(mapKnowledgeFile);
}

async function listWorkspaceLinkButtons(client: SupabaseClient, organizationId: string): Promise<ClientTrackedLinkButton[]> {
  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, title, content, tags, metadata, created_at")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .contains("tags", ["tracked_link_button"])
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    throw new Error(`Nao foi possivel carregar links rastreados: ${error.message}`);
  }

  return ((data ?? []) as KnowledgeMemoryRow[]).map(mapTrackedLinkButton);
}

type CloneRealTestEventRow = {
  id: string;
  title: string | null;
  summary: string | null;
  confidence: number | null;
  payload: JsonRecord | null;
  created_at: string | null;
};

async function listOrganizationCloneRealTests(
  client: SupabaseClient,
  organizationId: string,
  agentId: string,
): Promise<ClientCloneRealTestSummary> {
  const { data, error } = await client
    .from("intelligence_events")
    .select("id, title, summary, confidence, payload, created_at")
    .eq("organization_id", organizationId)
    .eq("producer_agent_id", agentId)
    .eq("event_type", "whatsapp.clone.real_test_turn")
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    return emptyCloneRealTestSummary();
  }

  return buildCloneRealTestSummary((data ?? []) as CloneRealTestEventRow[]);
}

function mapKnowledgeFile(row: KnowledgeMemoryRow): ClientKnowledgeFile {
  const metadata = readRecord(row.metadata) ?? {};
  const size = typeof metadata.size === "number" ? metadata.size : null;

  return {
    id: row.id,
    title: row.title,
    fileName: typeof metadata.file_name === "string" ? metadata.file_name : row.title,
    contentType: typeof metadata.content_type === "string" ? metadata.content_type : null,
    size,
    storageUrl: typeof metadata.storage_url === "string" ? metadata.storage_url : null,
    createdAt: row.created_at,
  };
}

function mapTrackedLinkButton(row: KnowledgeMemoryRow): ClientTrackedLinkButton {
  const metadata = readRecord(row.metadata) ?? {};
  const label = readString(metadata.label) ?? row.title;
  const url = readString(metadata.url) ?? row.content;
  const tag = readString(metadata.tag) ?? `{{link_${row.id.slice(0, 8)}}}`;
  const trackingUrl = readString(metadata.tracking_url) ?? buildTrackedLinkUrl(row.id);
  const clicks = readNumber(metadata.click_count) ?? 0;

  return {
    id: row.id,
    label,
    url,
    tag,
    trackingUrl,
    clicks,
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
    .maybeSingle<{ version_number: number | null }>();

  return Number(data?.version_number ?? 0) + 1;
}

async function configureClientWebhook(credentials: UazapiCredentials, token: string, providerInstanceId?: string | null) {
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

function buildState(
  instance: WhatsappInstanceRow | null,
  agent: AgentRow | null,
  globalAgent: AgentRow,
  behavior: WhatsappBehaviorConfig,
  audio: WhatsappAudioVoiceState,
  knowledgeFiles: ClientKnowledgeFile[],
  linkButtons: ClientTrackedLinkButton[],
  cloneTest: ClientCloneRealTestSummary = emptyCloneRealTestSummary(),
  runtimeAlerts: ClientWhatsappRuntimeAlert[] = [],
): ClientWhatsappState {
  const agentPrompt = agent?.prompt?.trim() || defaultWhatsappAgentPrompt;
  const globalPrompt = globalAgent.prompt?.trim() || defaultWhatsappGlobalPrompt;
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
          companyId: agent.organization_id,
          sectorCode: agent.sector_code,
          sectorName: agent.sector_name,
          name: agent.persona_name?.trim() || agent.name,
          avatarUrl: agent.avatar_url,
          avatarAlt: agent.avatar_alt,
          prompt: agentPrompt,
          promptPreview: preview(agentPrompt),
          cloneProfile: getCloneProfileConfig(agent),
          cloneMemory: getCloneMemoryConfig(agent),
          cloneProfileImport: getCloneProfileImportStatus(agent),
          qualification: getLeadQualificationConfig(agent),
          updatedAt: agent.updated_at,
        }
      : null,
    globalAgent: {
      id: globalAgent.id,
      name: globalAgent.persona_name?.trim() || globalAgent.name,
      prompt: globalPrompt,
      promptPreview: preview(globalPrompt),
      updatedAt: globalAgent.updated_at,
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
      canConnect: true,
      schemaReady: true,
      message: null,
    },
  };
}

function isInternalInstanceRuntimeRun(row: AgentRunAlertRow, instanceId: string | null) {
  const metadata = readRecord(row.metadata) ?? {};
  const reason = readString(metadata.reason)?.toLowerCase();
  const outputSummary = (row.output_summary ?? "").toLowerCase();

  if (reason !== "internal_instance" && !outputSummary.includes("mensagem interna entre instancias")) {
    return false;
  }

  if (!instanceId) {
    return true;
  }

  const metadataInstanceId = readString(metadata.whatsappInstanceId) ?? readString(metadata.whatsapp_instance_id);
  return !metadataInstanceId || metadataInstanceId === instanceId;
}

function mapInternalInstanceRuntimeAlert(row: AgentRunAlertRow): ClientWhatsappRuntimeAlert {
  const metadata = readRecord(row.metadata) ?? {};
  const providerChatId = readString(metadata.providerChatId) ?? readString(metadata.provider_chat_id);
  const phoneNumber = readString(metadata.phoneNumber) ?? readString(metadata.phone_number) ?? providerChatId;
  const occurredAt = row.finished_at ?? row.started_at ?? row.created_at;
  const inputPreview = row.input_summary ? preview(row.input_summary) : null;

  return {
    id: `internal-instance-${row.id}`,
    kind: "internal_instance_block",
    tone: "warning",
    title: "Protecao entre instancias acionada",
    message: "O agente ignorou esta entrada porque o numero tambem pertence a uma instancia conectada do ecossistema ConnectyHub.",
    runId: row.id,
    conversationId: readString(metadata.conversationId) ?? readString(metadata.conversation_id),
    whatsappInstanceId: readString(metadata.whatsappInstanceId) ?? readString(metadata.whatsapp_instance_id),
    providerChatId,
    phoneNumber,
    occurredAt,
    inputPreview,
    outputSummary: row.output_summary,
  };
}

function getBehaviorConfig(globalAgent: AgentRow, instance: WhatsappInstanceRow | null, agent?: AgentRow | null) {
  const globalConfig = readRecord(globalAgent.metadata)?.whatsapp_behavior_config;
  const instanceConfig = readRecord(instance?.metadata)?.behavior_config;
  const agentConfig = readRecord(agent?.metadata)?.whatsapp_behavior_config;

  return normalizeWhatsappBehaviorConfig(instanceConfig ?? agentConfig ?? globalConfig);
}

function getLeadQualificationConfig(agent: AgentRow | null) {
  return normalizeLeadQualificationConfig(readRecord(agent?.metadata)?.[leadQualificationConfigKey]);
}

function getCloneProfileConfig(agent: AgentRow | null) {
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

function mapCloneRealTestEvent(row: CloneRealTestEventRow): ClientCloneRealTestEvent {
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

async function syncClientInstanceStatus(
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

function buildProviderInstanceName(organization: CurrentOrganization, agent?: AgentRow | null) {
  const base = (organization.slug || organization.name || organization.id)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);

  const agentBase = (agent?.agent_code || agent?.sector_code || agent?.name || agent?.id || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return `connectyhub-${base || organization.id.slice(0, 8)}${agentBase ? `-${agentBase}` : ""}`.slice(0, 64);
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
    (message.includes("token") && (message.includes("invalid") || message.includes("invalido") || message.includes("inválido"))) ||
    ([401, 403].includes(result.status) && message.includes("token"))
  );
}

function readProviderError(value: unknown) {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  return findString(value, ["error", "message", "detail"]);
}

function preview(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

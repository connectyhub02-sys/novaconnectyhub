import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { generateElevenLabsAudio } from "@/lib/elevenlabs/tts";
import { listWhatsappAudioVoices, type WhatsappAudioVoiceState } from "@/lib/elevenlabs/voices";
import { decryptCredentialValue, encryptCredentialValue, previewCredentialValue } from "@/lib/security/credentials-crypto";
import type { CurrentOrganization } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import {
  defaultWhatsappAgentPrompt,
  defaultWhatsappBehaviorConfig,
  defaultWhatsappGlobalPrompt,
  normalizeWhatsappBehaviorConfig,
  type WhatsappBehaviorConfig,
} from "./agent-behavior";
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
  prompt: string | null;
  persona_name: string | null;
  name: string;
  avatar_url: string | null;
  avatar_alt: string | null;
  updated_at: string | null;
  metadata: JsonRecord | null;
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
  } | null;
  agent: {
    id: string;
    name: string;
    avatarUrl: string | null;
    avatarAlt: string | null;
    prompt: string;
    promptPreview: string;
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
const maxPromptLength = 24000;
const agentSelectColumns = "id, prompt, persona_name, name, avatar_url, avatar_alt, updated_at, metadata";

export async function getClientWhatsappState(input: {
  organization: CurrentOrganization;
  userId: string;
  client?: SupabaseClient;
}): Promise<ClientWhatsappState> {
  const client = input.client ?? createServiceClient();
  const [instance, agent, globalAgent] = await Promise.all([
    getWorkspaceInstance(client, input.organization.id),
    getWorkspaceWhatsappAgent(client, input.organization.id),
    getOrCreateWorkspaceGlobalAgent(client, input.organization, input.userId),
  ]);

  const behavior = getBehaviorConfig(globalAgent, instance);
  const audio = await listWhatsappAudioVoices({ organizationId: input.organization.id, client });

  return buildState(instance, agent, globalAgent, behavior, audio);
}

export async function connectClientWhatsapp(input: {
  organization: CurrentOrganization;
  userId: string;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const existing = await getWorkspaceInstance(client, input.organization.id);
  const instance = existing?.instance_token_encrypted
    ? existing
    : await createProviderInstance(client, credentials, input.organization, input.userId);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("A instancia existe, mas o token seguro nao esta disponivel. Sincronize ou recrie a conexao.");
  }

  const connectResult = await callUazapi(credentials, "/instance/connect", {
    method: "POST",
    token,
    body: {
      browser: "auto",
      systemName: "ConnectyHub",
    },
  });
  const status = normalizeWhatsappStatus(findString(connectResult.data, ["status", "state", "connectionStatus"]) ?? "qr_pending");
  const qrCode = normalizeQrCode(findString(connectResult.data, ["qrcode", "qrCode", "qr", "base64"]));
  const profileData = status === "connected" ? await getConnectedProfileData(credentials, token) : null;
  const phoneNumber = normalizePhone(findString(connectResult.data, ["owner", "phone", "number", "phone_number"]) ?? instance.phone_number);
  const displayName = findString(connectResult.data, ["profileName", "displayName", "name"]) ?? findString(profileData, ["profileName", "displayName", "businessName", "name"]) ?? instance.display_name;
  const profileImageUrl = extractProfileImageUrl(connectResult.data) ?? extractProfileImageUrl(profileData) ?? readProfileImageUrl(instance);
  const now = new Date().toISOString();
  const connectedAt = status === "connected" ? now : instance.connected_at;
  const webhookResult = await configureClientWebhook(credentials, token);

  await client
    .from("whatsapp_instances")
    .update({
      status: qrCode ? "qr_pending" : status,
      qr_status: qrCode ? "available" : null,
      phone_number: phoneNumber,
      display_name: displayName,
      connected_at: connectedAt,
      disconnected_at: null,
      webhook_url: credentials.webhookUrl,
      webhook_configured_at: webhookResult.ok ? now : instance.webhook_configured_at,
      last_synced_at: now,
      metadata: {
        ...(instance.metadata ?? {}),
        ...(profileImageUrl ? { profile_image_url: profileImageUrl, profile_image_synced_at: now } : {}),
        webhook_status: webhookResult.ok ? "configured" : "not_configured",
        webhook_error: webhookResult.ok ? null : webhookResult.reason,
        last_client_action: "connect",
        last_connect_response: sanitizeProviderData(connectResult.data),
        ...(profileData ? { last_profile_response: sanitizeProviderData(profileData) } : {}),
      },
    })
    .eq("id", instance.id);

  if (profileImageUrl) {
    await syncWorkspaceAgentAvatar(client, input.organization.id, profileImageUrl, displayName ?? phoneNumber ?? input.organization.name);
  }

  const state = await getClientWhatsappState({ organization: input.organization, userId: input.userId, client });
  revalidatePath("/dashboard/whatsapp");

  return {
    state,
    notice: {
      tone: qrCode ? "warning" : "success",
      message: qrCode ? "Escaneie o QR Code para concluir a conexao." : "WhatsApp conectado ou em processo de conexao.",
    },
    qrCode,
    pairCode: null,
  };
}

export async function refreshClientWhatsappStatus(input: {
  organization: CurrentOrganization;
  userId: string;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const instance = await requireWorkspaceInstance(client, input.organization.id);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("Conexao sem token seguro. Conecte o WhatsApp novamente.");
  }

  const result = await callUazapi(credentials, "/instance/status", { method: "GET", token });
  const status = normalizeWhatsappStatus(findString(result.data, ["status", "state", "connectionStatus"]));
  const profileData = status === "connected" ? await getConnectedProfileData(credentials, token) : null;
  const phoneNumber = normalizePhone(findString(result.data, ["owner", "phone", "number", "phone_number"]) ?? instance.phone_number);
  const displayName = findString(result.data, ["profileName", "displayName", "name"]) ?? findString(profileData, ["profileName", "displayName", "businessName", "name"]) ?? instance.display_name;
  const profileImageUrl = extractProfileImageUrl(result.data) ?? extractProfileImageUrl(profileData) ?? readProfileImageUrl(instance);
  const now = new Date().toISOString();
  const webhookResult = status === "connected"
    ? await configureClientWebhook(credentials, token)
    : null;

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
        last_client_action: "refresh_status",
        last_status_response: sanitizeProviderData(result.data),
        ...(profileData ? { last_profile_response: sanitizeProviderData(profileData) } : {}),
      },
    })
    .eq("id", instance.id);

  if (profileImageUrl) {
    await syncWorkspaceAgentAvatar(client, input.organization.id, profileImageUrl, displayName ?? phoneNumber ?? input.organization.name);
  }

  const state = await getClientWhatsappState({ organization: input.organization, userId: input.userId, client });
  revalidatePath("/dashboard/whatsapp");

  return {
    state,
    notice: {
      tone: state.instance?.status === "connected" ? "success" : "warning",
      message: state.instance?.status === "connected" ? "WhatsApp conectado." : "Status atualizado. Conexao ainda nao esta ativa.",
    },
    qrCode: null,
    pairCode: null,
  };
}

export async function disconnectClientWhatsapp(input: {
  organization: CurrentOrganization;
  userId: string;
  client?: SupabaseClient;
}): Promise<ClientWhatsappActionResult> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadUazapiCredentials(client);
  const instance = await requireWorkspaceInstance(client, input.organization.id);
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("Conexao sem token seguro. Nao foi possivel desconectar no provedor.");
  }

  await callUazapi(credentials, "/instance/disconnect", { method: "POST", token });
  await client
    .from("whatsapp_instances")
    .update({
      status: "disconnected",
      disconnected_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      metadata: {
        ...(instance.metadata ?? {}),
        last_client_action: "disconnect",
      },
    })
    .eq("id", instance.id);

  const state = await getClientWhatsappState({ organization: input.organization, userId: input.userId, client });
  revalidatePath("/dashboard/whatsapp");

  return {
    state,
    notice: { tone: "warning", message: "WhatsApp desconectado." },
    qrCode: null,
    pairCode: null,
  };
}

export async function sendClientWhatsappTest(input: {
  organization: CurrentOrganization;
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
  const instance = await requireWorkspaceInstance(client, input.organization.id);
  const globalAgent = await getOrCreateWorkspaceGlobalAgent(client, input.organization, input.userId);
  const behavior = getBehaviorConfig(globalAgent, instance);
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

  const state = await getClientWhatsappState({ organization: input.organization, userId: input.userId, client });

  return {
    state,
    notice: { tone: "success", message: deliveryMode === "audio" ? "Audio de teste enviado." : "Mensagem de teste enviada." },
    qrCode: null,
    pairCode: null,
  };
}

export async function updateClientWhatsappPrompt(input: {
  organization: CurrentOrganization;
  userId: string;
  prompt?: string;
  agentPrompt?: string;
  globalPrompt?: string;
  behavior?: unknown;
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
  const [agent, globalAgent, instance] = await Promise.all([
    requireWorkspaceWhatsappAgent(client, input.organization.id),
    getOrCreateWorkspaceGlobalAgent(client, input.organization, input.userId),
    getWorkspaceInstance(client, input.organization.id),
  ]);
  const nextBehavior = normalizeWhatsappBehaviorConfig(input.behavior ?? getBehaviorConfig(globalAgent, instance));
  const now = new Date().toISOString();

  if (hasAgentPrompt) {
    const nextVersion = await getNextPromptVersion(client, agent.id);
    const { error } = await client
      .from("agent_registry")
      .update({
        prompt: agentPrompt,
        status: "needs_review",
        metadata: {
          ...(agent.metadata ?? {}),
          prompt_control: {
            last_updated_at: now,
            last_updated_by: input.userId,
            previous_length: agent.prompt?.length ?? 0,
            current_length: agentPrompt.length,
            source: "client_dashboard",
          },
        },
      })
      .eq("id", agent.id);

    if (error) {
      throw new Error(`Nao foi possivel salvar o prompt: ${error.message}`);
    }

    await client.from("agent_prompt_versions").insert({
      agent_id: agent.id,
      version_number: nextVersion,
      prompt: agentPrompt,
      change_note: "Atualizado no painel do cliente",
      created_by: input.userId,
    });
  }

  if (hasGlobalPrompt || input.behavior !== undefined) {
    const nextGlobalVersion = hasGlobalPrompt ? await getNextPromptVersion(client, globalAgent.id) : null;
    const promptToSave = hasGlobalPrompt ? globalPrompt : globalAgent.prompt?.trim() || defaultWhatsappGlobalPrompt;
    const { error } = await client
      .from("agent_registry")
      .update({
        prompt: promptToSave,
        status: "needs_review",
        metadata: {
          ...(globalAgent.metadata ?? {}),
          whatsapp_behavior_config: nextBehavior,
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
  }

  revalidatePath("/dashboard/whatsapp");
  return getClientWhatsappState({ organization: input.organization, userId: input.userId, client });
}

async function createProviderInstance(
  client: SupabaseClient,
  credentials: UazapiCredentials,
  organization: CurrentOrganization,
  userId: string,
) {
  const now = new Date().toISOString();
  const name = buildProviderInstanceName(organization);
  const result = await callUazapi(credentials, "/instance/create", {
    method: "POST",
    admin: true,
    body: {
      name,
      systemName: `ConnectyHub - ${organization.name}`,
      adminField01: organization.id,
      adminField02: userId,
    },
  });
  const providerInstanceId = findString(result.data, ["id", "instance_id", "instanceId", "instanceid"]);
  const token = findString(result.data, ["token", "instanceToken", "instance_token"]);
  const profileImageUrl = extractProfileImageUrl(result.data);

  if (!providerInstanceId || !token) {
    throw new Error("A Uazapi nao retornou id/token da instancia. Tente novamente ou verifique as credenciais no Admin OS.");
  }

  const webhookResult = await configureClientWebhook(credentials, token);
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

  return data;
}

async function getWorkspaceInstance(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, owner_user_id, provider, provider_instance_id, phone_number, display_name, status, qr_status, instance_token_preview, instance_token_encrypted, webhook_url, webhook_configured_at, last_synced_at, last_heartbeat_at, last_message_at, connected_at, disconnected_at, metadata, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "uazapi")
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

async function requireWorkspaceInstance(client: SupabaseClient, organizationId: string) {
  const instance = await getWorkspaceInstance(client, organizationId);

  if (!instance) {
    throw new Error("Conecte um WhatsApp antes de executar esta acao.");
  }

  return instance;
}

async function getWorkspaceWhatsappAgent(client: SupabaseClient, organizationId: string): Promise<AgentRow | null> {
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

async function requireWorkspaceWhatsappAgent(client: SupabaseClient, organizationId: string) {
  const agent = await getWorkspaceWhatsappAgent(client, organizationId);

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

async function configureClientWebhook(credentials: UazapiCredentials, token: string) {
  if (!credentials.webhookUrl) {
    return { ok: false as const, reason: "NEXT_PUBLIC_APP_URL nao configurada." };
  }

  const response = await callUazapi(credentials, "/webhook", {
    method: "POST",
    token,
    body: {
      url: credentials.webhookSecret
        ? `${credentials.webhookUrl}?secret=${encodeURIComponent(credentials.webhookSecret)}`
        : credentials.webhookUrl,
      events: ["messages", "messages_update", "connection", "history"],
      excludeMessages: ["wasSentByApi"],
      addUrlEvents: true,
      addUrlTypesMessages: true,
    },
    tolerateError: true,
  });

  if (!response.ok) {
    return { ok: false as const, reason: `Webhook respondeu status ${response.status}.` };
  }

  return { ok: true as const };
}

async function getConnectedProfileData(credentials: UazapiCredentials, token: string) {
  const result = await callUazapi(credentials, "/business/get/profile", {
    method: "POST",
    token,
    tolerateError: true,
  });

  return result.ok ? result.data : null;
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
): ClientWhatsappState {
  const agentPrompt = agent?.prompt?.trim() || defaultWhatsappAgentPrompt;
  const globalPrompt = globalAgent.prompt?.trim() || defaultWhatsappGlobalPrompt;
  const profileImageUrl = readProfileImageUrl(instance);
  const profileImageAlt = profileImageUrl ? `Foto do WhatsApp ${instance?.display_name ?? instance?.phone_number ?? ""}`.trim() : null;

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
          avatarUrl: agent.avatar_url ?? profileImageUrl,
          avatarAlt: agent.avatar_alt ?? profileImageAlt,
          prompt: agentPrompt,
          promptPreview: preview(agentPrompt),
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
    capability: {
      canConnect: true,
      schemaReady: true,
      message: null,
    },
  };
}

function getBehaviorConfig(globalAgent: AgentRow, instance: WhatsappInstanceRow | null) {
  const globalConfig = readRecord(globalAgent.metadata)?.whatsapp_behavior_config;
  const instanceConfig = readRecord(instance?.metadata)?.behavior_config;

  return normalizeWhatsappBehaviorConfig(instanceConfig ?? globalConfig);
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

async function syncWorkspaceAgentAvatar(client: SupabaseClient, organizationId: string, profileImageUrl: string, label: string) {
  const agent = await getWorkspaceWhatsappAgent(client, organizationId).catch(() => null);

  if (!agent || agent.avatar_url === profileImageUrl) {
    return;
  }

  await client
    .from("agent_registry")
    .update({
      avatar_url: profileImageUrl,
      avatar_alt: `Foto do WhatsApp de ${label}`,
    })
    .eq("id", agent.id);
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

function buildProviderInstanceName(organization: CurrentOrganization) {
  const base = (organization.slug || organization.name || organization.id)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34);

  return `connectyhub-${base || organization.id.slice(0, 8)}`;
}

function normalizeWhatsappStatus(value: string | null | undefined): WhatsappStatus {
  const status = value?.toLowerCase() ?? "";

  if (["connected", "open", "online", "logged", "ready"].some((item) => status.includes(item))) return "connected";
  if (["qr", "pair", "scan"].some((item) => status.includes(item))) return "qr_pending";
  if (["blocked", "ban"].some((item) => status.includes(item))) return "blocked";
  if (["error", "fail"].some((item) => status.includes(item))) return "error";
  if (["disconnected", "close", "logout", "offline"].some((item) => status.includes(item))) return "disconnected";

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

function readProviderError(value: unknown) {
  return findString(value, ["error", "message", "detail"]);
}

function preview(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

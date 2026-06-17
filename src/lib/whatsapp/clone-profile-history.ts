import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import { loadGeminiCredentials, normalizeGeminiModel } from "@/lib/gemini/credentials";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import {
  normalizeWhatsappCloneProfile,
  type WhatsappCloneProfile,
} from "./agent-behavior";
import { loadUazapiCredentials, type UazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;

type CloneProfileImportScope = "client" | "platform";

type AgentRow = {
  id: string;
  scope: string;
  organization_id: string | null;
  name: string;
  persona_name: string | null;
  model_id: string | null;
  metadata: JsonRecord | null;
};

type WhatsappInstanceRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
  provider_instance_id: string | null;
  instance_token_encrypted: string | null;
  metadata: JsonRecord | null;
};

export const whatsappCloneProfileImportEventName = "connectyhub/whatsapp.clone_profile.import_requested";

export type WhatsappCloneProfileImportStatusValue = "idle" | "queued" | "running" | "succeeded" | "failed";

export type WhatsappCloneProfileImportStatus = {
  status: WhatsappCloneProfileImportStatusValue;
  source: "uazapi_history";
  requestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  requestedBy: string | null;
  sampledChats: number;
  sampledMessages: number;
  outboundSamples: number;
  error: string | null;
};

export type WhatsappCloneProfileImportEventData = {
  scope: CloneProfileImportScope;
  agentId: string;
  organizationId: string | null;
  sectorId: string | null;
  instanceId: string;
  requestedBy: string;
  maxChats: number;
  maxMessagesPerChat: number;
};

const cloneProfileImportMetadataKey = "whatsapp_clone_profile_import";
const defaultMaxChats = 12;
const defaultMaxMessagesPerChat = 24;
const maxOutboundSamples = 80;

export const defaultWhatsappCloneProfileImportStatus: WhatsappCloneProfileImportStatus = {
  status: "idle",
  source: "uazapi_history",
  requestedAt: null,
  startedAt: null,
  completedAt: null,
  requestedBy: null,
  sampledChats: 0,
  sampledMessages: 0,
  outboundSamples: 0,
  error: null,
};

export function normalizeWhatsappCloneProfileImportStatus(value: unknown): WhatsappCloneProfileImportStatus {
  const input = readRecord(value) ?? {};
  const rawStatus = readString(input.status);
  const status: WhatsappCloneProfileImportStatusValue =
    rawStatus === "queued" || rawStatus === "running" || rawStatus === "succeeded" || rawStatus === "failed"
      ? rawStatus
      : "idle";

  return {
    status,
    source: "uazapi_history",
    requestedAt: readString(input.requestedAt) ?? readString(input.requested_at),
    startedAt: readString(input.startedAt) ?? readString(input.started_at),
    completedAt: readString(input.completedAt) ?? readString(input.completed_at),
    requestedBy: readString(input.requestedBy) ?? readString(input.requested_by),
    sampledChats: readSafeNumber(input.sampledChats ?? input.sampled_chats),
    sampledMessages: readSafeNumber(input.sampledMessages ?? input.sampled_messages),
    outboundSamples: readSafeNumber(input.outboundSamples ?? input.outbound_samples),
    error: readString(input.error),
  };
}

export async function enqueueWhatsappCloneProfileImport(input: {
  scope: CloneProfileImportScope;
  agentId: string;
  organizationId?: string | null;
  sectorId?: string | null;
  instanceId: string;
  requestedBy: string;
  maxChats?: number;
  maxMessagesPerChat?: number;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const eventData: WhatsappCloneProfileImportEventData = {
    scope: input.scope,
    agentId: input.agentId,
    organizationId: input.organizationId ?? null,
    sectorId: input.sectorId ?? null,
    instanceId: input.instanceId,
    requestedBy: input.requestedBy,
    maxChats: clampInteger(input.maxChats, 3, 40, defaultMaxChats),
    maxMessagesPerChat: clampInteger(input.maxMessagesPerChat, 8, 80, defaultMaxMessagesPerChat),
  };

  await requireScopedAgent(client, eventData);
  await requireScopedInstance(client, eventData);

  const now = new Date().toISOString();
  await updateImportStatus(client, input.agentId, {
    ...defaultWhatsappCloneProfileImportStatus,
    status: "queued",
    requestedAt: now,
    requestedBy: input.requestedBy,
  });

  await inngest.send({
    name: whatsappCloneProfileImportEventName,
    data: eventData,
  });

  return normalizeWhatsappCloneProfileImportStatus({
    status: "queued",
    requestedAt: now,
    requestedBy: input.requestedBy,
  });
}

export async function processWhatsappCloneProfileImport(input: {
  data: WhatsappCloneProfileImportEventData;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const startedAt = new Date().toISOString();

  await updateImportStatus(client, input.data.agentId, {
    ...defaultWhatsappCloneProfileImportStatus,
    status: "running",
    requestedAt: startedAt,
    startedAt,
    requestedBy: input.data.requestedBy,
  });

  try {
    const [agent, instance, credentials, geminiCredentials] = await Promise.all([
      requireScopedAgent(client, input.data),
      requireScopedInstance(client, input.data),
      loadUazapiCredentials(client),
      loadGeminiCredentials(client),
    ]);
    const token = decryptInstanceToken(instance);

    if (!token) {
      throw new Error("A instancia WhatsApp nao possui token valido para consultar historico.");
    }

    const sample = await collectOutboundHistorySample({
      credentials,
      token,
      maxChats: input.data.maxChats,
      maxMessagesPerChat: input.data.maxMessagesPerChat,
    });

    if (sample.outboundTexts.length < 8) {
      throw new Error("Historico insuficiente. Encontrei poucas mensagens humanas de saida para montar um DNA confiavel.");
    }

    const profile = await generateCloneProfileFromSamples({
      apiKey: geminiCredentials.apiKey,
      model: agent.model_id || geminiCredentials.model,
      agentName: agent.persona_name?.trim() || agent.name,
      samples: sample.outboundTexts,
    });
    const completedAt = new Date().toISOString();

    await updateImportStatus(client, input.data.agentId, {
      status: "succeeded",
      source: "uazapi_history",
      requestedAt: startedAt,
      startedAt,
      completedAt,
      requestedBy: input.data.requestedBy,
      sampledChats: sample.sampledChats,
      sampledMessages: sample.sampledMessages,
      outboundSamples: sample.outboundTexts.length,
      error: null,
    }, profile);

    return {
      status: "succeeded",
      sampledChats: sample.sampledChats,
      sampledMessages: sample.sampledMessages,
      outboundSamples: sample.outboundTexts.length,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Nao foi possivel gerar o DNA pelo historico.";

    await updateImportStatus(client, input.data.agentId, {
      status: "failed",
      source: "uazapi_history",
      requestedAt: startedAt,
      startedAt,
      completedAt,
      requestedBy: input.data.requestedBy,
      sampledChats: 0,
      sampledMessages: 0,
      outboundSamples: 0,
      error: message,
    });

    return { status: "failed", error: message };
  }
}

async function collectOutboundHistorySample(input: {
  credentials: UazapiCredentials;
  token: string;
  maxChats: number;
  maxMessagesPerChat: number;
}) {
  const chatsResponse = await callUazapi(input.credentials, "/chat/find", {
    method: "POST",
    token: input.token,
    body: {
      operator: "AND",
      sort: "-wa_lastMsgTimestamp",
      limit: input.maxChats,
      offset: 0,
    },
  });
  const chats = extractRecords(chatsResponse.data);
  const chatIds = uniqueStrings(chats.map(extractChatId).filter(Boolean) as string[])
    .filter(isPrivateChatId)
    .slice(0, input.maxChats);
  const outboundTexts: string[] = [];
  let sampledMessages = 0;

  for (const chatId of chatIds) {
    await callUazapi(input.credentials, "/message/history-sync", {
      method: "POST",
      token: input.token,
      body: {
        number: chatId,
        mode: "history",
        count: input.maxMessagesPerChat,
      },
      tolerateError: true,
    });

    const messagesResponse = await callUazapi(input.credentials, "/message/find", {
      method: "POST",
      token: input.token,
      body: {
        chatid: chatId,
        limit: input.maxMessagesPerChat,
        offset: 0,
      },
      tolerateError: true,
    });

    if (!messagesResponse.ok) {
      continue;
    }

    const messages = extractRecords(messagesResponse.data);
    sampledMessages += messages.length;

    for (const message of messages) {
      if (!isHumanOutboundMessage(message)) {
        continue;
      }

      const text = sanitizeSampleText(extractMessageText(message));
      if (text) {
        outboundTexts.push(text);
      }

      if (outboundTexts.length >= maxOutboundSamples) {
        break;
      }
    }

    if (outboundTexts.length >= maxOutboundSamples) {
      break;
    }
  }

  return {
    sampledChats: chatIds.length,
    sampledMessages,
    outboundTexts: uniqueStrings(outboundTexts).slice(0, maxOutboundSamples),
  };
}

async function generateCloneProfileFromSamples(input: {
  apiKey: string;
  model: string;
  agentName: string;
  samples: string[];
}) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizeGeminiModel(input.model))}:generateContent`);
  url.searchParams.set("key", input.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "Voce analisa historico de atendimento e retorna somente JSON valido, sem markdown." }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildCloneProfileAnalysisPrompt(input.agentName, input.samples) }],
        },
      ],
      generationConfig: {
        temperature: 0.25,
        topP: 0.85,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
      ],
    }),
    cache: "no-store",
  });
  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(readProviderError(data) ?? `Gemini respondeu status ${response.status}.`);
  }

  const record = readRecord(parseJsonObject(extractGeminiText(data)));

  if (!record) {
    throw new Error("Gemini nao retornou um JSON valido para o DNA.");
  }

  return normalizeWhatsappCloneProfile({
    enabled: true,
    source: "history",
    displayName: readString(record.displayName) ?? input.agentName,
    roleIdentity: record.roleIdentity,
    tone: record.tone,
    vocabulary: record.vocabulary,
    responseRhythm: record.responseRhythm,
    salesStyle: record.salesStyle,
    objectionStyle: record.objectionStyle,
    closingStyle: record.closingStyle,
    emojiStyle: record.emojiStyle,
    audioStyle: record.audioStyle,
    forbiddenPatterns: record.forbiddenPatterns,
    notes: record.notes,
  });
}

function buildCloneProfileAnalysisPrompt(agentName: string, samples: string[]) {
  return [
    `Agente analisado: ${agentName}`,
    "",
    "Analise somente o estilo das mensagens humanas de saida abaixo.",
    "Nao copie dados pessoais, nomes de clientes, telefones, links, enderecos, promessas ou conteudo sensivel.",
    "Generalize o jeito da pessoa atender: tom, ritmo, palavras comuns, como vende, como responde objecoes e como fecha.",
    "Se perceber vicios ruins ou coisas que quebram naturalidade, coloque em forbiddenPatterns.",
    "",
    "Retorne JSON com exatamente estas chaves string:",
    "displayName, roleIdentity, tone, vocabulary, responseRhythm, salesStyle, objectionStyle, closingStyle, emojiStyle, audioStyle, forbiddenPatterns, notes",
    "",
    "Amostras:",
    samples.map((sample, index) => `${index + 1}. ${sample}`).join("\n"),
  ].join("\n");
}

async function requireScopedAgent(client: SupabaseClient, data: WhatsappCloneProfileImportEventData) {
  let query = client
    .from("agent_registry")
    .select("id, scope, organization_id, name, persona_name, model_id, metadata")
    .eq("id", data.agentId);

  if (data.scope === "client") {
    query = query
      .eq("scope", "organization")
      .eq("organization_id", data.organizationId)
      .contains("metadata", { client_created: true, agent_kind: "whatsapp" });
  } else {
    query = query
      .eq("scope", "platform")
      .is("organization_id", null)
      .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp" });
  }

  const { data: agent, error } = await query.maybeSingle<AgentRow>();

  if (error) {
    throw new Error(`Nao foi possivel validar o agente para gerar DNA: ${error.message}`);
  }

  if (!agent) {
    throw new Error("Agente WhatsApp nao encontrado para gerar DNA.");
  }

  const metadata = readRecord(agent.metadata);
  if (data.scope === "platform" && data.sectorId && readString(metadata?.sector_id) !== data.sectorId) {
    throw new Error("O agente interno nao pertence ao setor informado.");
  }

  return agent;
}

async function requireScopedInstance(client: SupabaseClient, data: WhatsappCloneProfileImportEventData) {
  const { data: instance, error } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, provider, status, provider_instance_id, instance_token_encrypted, metadata")
    .eq("id", data.instanceId)
    .eq("provider", "uazapi")
    .neq("status", "archived")
    .maybeSingle<WhatsappInstanceRow>();

  if (error) {
    throw new Error(`Nao foi possivel validar a instancia WhatsApp: ${error.message}`);
  }

  if (!instance) {
    throw new Error("Instancia WhatsApp nao encontrada para gerar DNA.");
  }

  const metadata = readRecord(instance.metadata);
  if (readString(metadata?.agent_id) !== data.agentId) {
    throw new Error("A instancia WhatsApp nao pertence ao agente selecionado.");
  }

  if (data.scope === "client" && instance.organization_id !== data.organizationId) {
    throw new Error("A instancia WhatsApp nao pertence a empresa selecionada.");
  }

  if (data.scope === "platform") {
    if (metadata?.admin_whatsapp !== true || (data.sectorId && readString(metadata.sector_id) !== data.sectorId)) {
      throw new Error("A instancia interna nao pertence ao setor selecionado.");
    }
  }

  return instance;
}

async function updateImportStatus(
  client: SupabaseClient,
  agentId: string,
  status: WhatsappCloneProfileImportStatus,
  profile?: WhatsappCloneProfile,
) {
  const { data: agent, error: lookupError } = await client
    .from("agent_registry")
    .select("id, metadata")
    .eq("id", agentId)
    .maybeSingle<{ id: string; metadata: JsonRecord | null }>();

  if (lookupError || !agent) {
    throw new Error(lookupError?.message ?? "Nao foi possivel atualizar status do DNA.");
  }

  const metadata = {
    ...(agent.metadata ?? {}),
    [cloneProfileImportMetadataKey]: {
      status: status.status,
      source: status.source,
      requestedAt: status.requestedAt,
      startedAt: status.startedAt,
      completedAt: status.completedAt,
      requestedBy: status.requestedBy,
      sampledChats: status.sampledChats,
      sampledMessages: status.sampledMessages,
      outboundSamples: status.outboundSamples,
      error: status.error,
    },
    ...(profile ? { whatsapp_clone_profile: profile } : {}),
  };

  const { error } = await client
    .from("agent_registry")
    .update({
      metadata,
      ...(profile ? { status: "needs_review" } : {}),
    })
    .eq("id", agentId);

  if (error) {
    throw new Error(`Nao foi possivel atualizar DNA do agente: ${error.message}`);
  }
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

function extractRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  const root = readRecord(value);
  if (!root) {
    return [];
  }

  for (const key of ["data", "items", "messages", "chats", "contacts", "rows", "result", "results", "response"]) {
    const direct = root[key];
    if (Array.isArray(direct)) {
      return direct.filter(isRecord);
    }

    const nested = readRecord(direct);
    if (nested) {
      const records = extractRecords(nested);
      if (records.length) {
        return records;
      }
    }
  }

  return [];
}

function extractChatId(chat: JsonRecord) {
  const key = readRecord(chat.key);
  return (
    readString(chat.chatid) ??
    readString(chat.chatId) ??
    readString(chat.remoteJid) ??
    readString(chat.jid) ??
    readString(chat.id) ??
    readString(key?.remoteJid)
  );
}

function isPrivateChatId(chatId: string) {
  const normalized = chatId.toLowerCase();
  return (
    !normalized.includes("status@broadcast") &&
    !normalized.endsWith("@g.us") &&
    !normalized.includes("@newsletter") &&
    !normalized.includes("broadcast")
  );
}

function isHumanOutboundMessage(message: JsonRecord) {
  const key = readRecord(message.key);
  const flags = [
    message.wasSentByApi,
    message.sentByApi,
    message.fromApi,
    message.isFromApi,
    message.api,
  ];

  if (flags.some((flag) => flag === true || flag === "true")) {
    return false;
  }

  const fromMe = [
    message.fromMe,
    message.fromme,
    message.isFromMe,
    key?.fromMe,
    readRecord(message.message)?.fromMe,
  ];

  if (fromMe.some((flag) => flag === true || flag === "true" || flag === 1)) {
    return true;
  }

  return false;
}

function extractMessageText(message: JsonRecord) {
  const payload = readRecord(message.message);
  const extended = readRecord(payload?.extendedTextMessage);
  const image = readRecord(payload?.imageMessage);
  const video = readRecord(payload?.videoMessage);
  const document = readRecord(payload?.documentMessage);
  const button = readRecord(payload?.buttonsResponseMessage);
  const list = readRecord(payload?.listResponseMessage);

  return (
    readString(message.text) ??
    readString(message.body) ??
    readString(message.caption) ??
    readString(message.content) ??
    readString(message.messageText) ??
    readString(payload?.conversation) ??
    readString(extended?.text) ??
    readString(image?.caption) ??
    readString(video?.caption) ??
    readString(document?.caption) ??
    readString(button?.selectedDisplayText) ??
    readString(list?.title) ??
    ""
  );
}

function sanitizeSampleText(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{8,}\b/g, "[numero]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);

    if (!match) {
      return {};
    }

    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      return {};
    }
  }
}

function extractGeminiText(value: unknown) {
  const candidates = readRecord(value)?.candidates;
  if (!Array.isArray(candidates)) return "";

  return candidates
    .flatMap((candidate) => {
      const parts = readRecord(readRecord(candidate)?.content)?.parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) => readRecord(part)?.text)
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .join("\n")
    .trim();
}

function readProviderError(value: unknown) {
  return findString(value, ["error", "message", "detail"]);
}

function findString(value: unknown, keys: string[]): string | null {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => lowerKeys.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0);
  return typeof found === "string" ? found.trim() : null;
}

function findValue(value: unknown, predicate: (key: string, value: unknown) => boolean): unknown {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, predicate);
      if (found) return found;
    }
    return null;
  }

  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (predicate(key, item)) return item;

    const found = findValue(item, predicate);
    if (found) return found;
  }

  return null;
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

function readRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readSafeNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  const safe = Number.isFinite(number) ? Math.round(number) : fallback;
  return Math.min(max, Math.max(min, safe));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

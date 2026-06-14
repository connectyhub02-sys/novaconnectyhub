import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeWhatsappBehaviorConfig, type WhatsappBehaviorConfig } from "./agent-behavior";
import { loadUazapiCredentials, type UazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;

type WhatsappInstanceRow = {
  id: string;
  organization_id: string;
  phone_number: string | null;
  display_name: string | null;
  instance_token_encrypted: string | null;
  metadata: JsonRecord | null;
};

type ConversationRow = {
  id: string;
  metadata: JsonRecord | null;
};

type LeadRow = {
  id: string;
  phone_number: string | null;
  display_name: string | null;
  metadata: JsonRecord | null;
};

export const whatsappHandoffNotificationEventName = "connectyhub/whatsapp.handoff.notify";

export type WhatsappHandoffNotificationEventData = {
  organizationId: string;
  whatsappInstanceId: string;
  conversationId?: string | null;
  leadId?: string | null;
  agentId?: string | null;
  agentRunId?: string | null;
  leadName?: string | null;
  leadPhone?: string | null;
  requestText?: string | null;
  requestedAt?: string | null;
  pausedUntil?: string | null;
  test?: boolean;
  notificationNumbers?: string | null;
  notificationCooldownMinutes?: number | null;
  requestedByUserId?: string | null;
  source?: string | null;
};

export async function enqueueWhatsappHandoffNotification(data: WhatsappHandoffNotificationEventData) {
  await inngest.send({
    name: whatsappHandoffNotificationEventName,
    data,
  });
}

export async function processWhatsappHandoffNotification(input: {
  data: WhatsappHandoffNotificationEventData;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const eventData = input.data;
  const instance = await loadWhatsappInstance(client, eventData.whatsappInstanceId);

  if (!instance) {
    return { status: "skipped", reason: "missing_instance" };
  }

  const [credentials, conversation, lead] = await Promise.all([
    loadUazapiCredentials(client),
    eventData.conversationId ? loadConversation(client, eventData.conversationId) : Promise.resolve(null),
    eventData.leadId ? loadLead(client, eventData.leadId) : Promise.resolve(null),
  ]);

  const token = decryptInstanceToken(instance);
  const behavior = resolveNotificationBehavior(instance, eventData);
  const recipients = resolveNotificationRecipients(behavior, eventData)
    .filter((number) => !samePhone(number, eventData.leadPhone ?? lead?.phone_number))
    .filter((number) => !samePhone(number, instance.phone_number));

  if (!token) {
    await recordNotificationEvent(client, instance, eventData, "whatsapp.handoff.notification.failed", "Falha ao avisar humano", "Instancia WhatsApp sem token seguro.", { reason: "missing_token" });
    return { status: "failed", reason: "missing_token" };
  }

  if (!eventData.test && !behavior.humanHandoffNotifications) {
    await recordNotificationEvent(client, instance, eventData, "whatsapp.handoff.notification.skipped", "Aviso humano desativado", "O pedido de humano foi registrado, mas o aviso por WhatsApp esta desligado.", { reason: "disabled" });
    return { status: "skipped", reason: "disabled" };
  }

  if (recipients.length === 0) {
    await recordNotificationEvent(client, instance, eventData, "whatsapp.handoff.notification.skipped", "Aviso humano sem destinatario", "Nenhum numero responsavel foi configurado para receber avisos de atendimento humano.", { reason: "missing_recipients" });
    return { status: "skipped", reason: "missing_recipients" };
  }

  const cooldownMinutes = Math.max(eventData.notificationCooldownMinutes ?? behavior.humanHandoffNotificationCooldownMinutes, 1);
  const cooldown = !eventData.test && conversation
    ? readNotificationCooldown(conversation.metadata, cooldownMinutes)
    : null;

  if (cooldown?.active) {
    await recordNotificationEvent(client, instance, eventData, "whatsapp.handoff.notification.skipped", "Aviso humano em cooldown", `Aviso ja enviado recentemente. Proximo aviso liberado apos ${cooldown.availableAt}.`, {
      reason: "cooldown",
      availableAt: cooldown.availableAt,
      cooldownMinutes,
    });
    return { status: "skipped", reason: "cooldown", availableAt: cooldown.availableAt };
  }

  const text = buildNotificationText({
    data: eventData,
    instance,
    lead,
    test: eventData.test === true,
  });
  const results = [];

  for (const recipient of recipients) {
    try {
      const response = await callUazapi(credentials, "/send/text", {
        method: "POST",
        token,
        body: {
          number: recipient,
          text,
          linkPreview: false,
          track_source: "connectyhub",
          track_id: `human_handoff_notify_${eventData.conversationId ?? instance.id}_${Date.now()}`,
        },
      });
      results.push({ number: recipient, status: "sent", providerResponse: sanitizeProviderData(response.data) });
    } catch (error) {
      results.push({ number: recipient, status: "failed", error: error instanceof Error ? error.message : "Erro desconhecido ao enviar aviso." });
    }
  }

  const sent = results.filter((item) => item.status === "sent");
  const failed = results.filter((item) => item.status === "failed");
  const now = new Date().toISOString();

  if (conversation) {
    await updateConversationNotificationState(client, conversation, {
      status: sent.length > 0 ? "sent" : "failed",
      sentAt: sent.length > 0 ? now : null,
      recipients: sent.map((item) => item.number),
      results,
      cooldownMinutes,
    });
  }

  if (lead) {
    await updateLeadNotificationState(client, lead, {
      status: sent.length > 0 ? "sent" : "failed",
      sentAt: sent.length > 0 ? now : null,
      recipients: sent.map((item) => item.number),
      results,
    });
  }

  await recordNotificationEvent(
    client,
    instance,
    eventData,
    sent.length > 0 ? "whatsapp.handoff.notification.sent" : "whatsapp.handoff.notification.failed",
    sent.length > 0 ? "Dono avisado no WhatsApp" : "Falha ao avisar dono no WhatsApp",
    sent.length > 0
      ? `Aviso enviado para ${sent.length} numero(s) responsavel(is).`
      : "Nenhum aviso de atendimento humano foi entregue.",
    {
      recipients: sent.map((item) => item.number),
      failedRecipients: failed,
      results,
      cooldownMinutes,
      test: eventData.test === true,
    },
  );

  return {
    status: sent.length > 0 ? "sent" : "failed",
    sent: sent.length,
    failed: failed.length,
  };
}

function resolveNotificationBehavior(instance: WhatsappInstanceRow, data: WhatsappHandoffNotificationEventData) {
  const metadata = readRecord(instance.metadata);
  const stored = normalizeWhatsappBehaviorConfig(metadata?.behavior_config);

  if (!data.test) {
    return stored;
  }

  return normalizeWhatsappBehaviorConfig({
    ...stored,
    humanHandoffNotifications: true,
    humanHandoffNotificationNumbers: data.notificationNumbers ?? stored.humanHandoffNotificationNumbers,
    humanHandoffNotificationCooldownMinutes: data.notificationCooldownMinutes ?? stored.humanHandoffNotificationCooldownMinutes,
  });
}

function resolveNotificationRecipients(behavior: WhatsappBehaviorConfig, data: WhatsappHandoffNotificationEventData) {
  const source = data.test && data.notificationNumbers !== undefined
    ? data.notificationNumbers
    : behavior.humanHandoffNotificationNumbers;
  return normalizeRecipientList(source);
}

function buildNotificationText(input: {
  data: WhatsappHandoffNotificationEventData;
  instance: WhatsappInstanceRow;
  lead: LeadRow | null;
  test: boolean;
}) {
  const leadName = input.data.leadName?.trim() || input.lead?.display_name?.trim() || "Lead sem nome";
  const leadPhone = normalizePhone(input.data.leadPhone ?? input.lead?.phone_number) || "numero nao informado";
  const requestText = preview(input.data.requestText ?? "", 500) || (input.test ? "Teste de aviso de atendimento humano." : "Pedido de atendimento humano.");
  const pausedUntil = formatDateForMessage(input.data.pausedUntil);
  const instanceName = input.instance.display_name || input.instance.phone_number || "WhatsApp conectado";

  return [
    input.test ? "Teste de aviso humano" : "Atendimento humano solicitado",
    "",
    `WhatsApp: ${instanceName}`,
    `Lead: ${leadName}`,
    `Numero: ${leadPhone}`,
    `Mensagem: "${requestText}"`,
    pausedUntil ? `IA pausada ate: ${pausedUntil}` : "IA pausada para atendimento humano.",
    "",
    "Abra o WhatsApp conectado e continue a conversa com esse lead.",
    "Nao responda este alerta; ele serve apenas para te chamar.",
  ].join("\n");
}

async function updateConversationNotificationState(
  client: SupabaseClient,
  conversation: ConversationRow,
  input: {
    status: "sent" | "failed";
    sentAt: string | null;
    recipients: string[];
    results: Array<Record<string, unknown>>;
    cooldownMinutes: number;
  },
) {
  const metadata = readRecord(conversation.metadata);
  const human = readRecord(metadata?.human_intervention);

  await client
    .from("conversations")
    .update({
      metadata: {
        ...(metadata ?? {}),
        human_intervention: {
          ...(human ?? {}),
          notification_status: input.status,
          notification_last_sent_at: input.sentAt ?? asString(human?.notification_last_sent_at),
          notification_recipients: input.recipients,
          notification_results: input.results,
          notification_cooldown_minutes: input.cooldownMinutes,
          notification_updated_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", conversation.id);
}

async function updateLeadNotificationState(
  client: SupabaseClient,
  lead: LeadRow,
  input: {
    status: "sent" | "failed";
    sentAt: string | null;
    recipients: string[];
    results: Array<Record<string, unknown>>;
  },
) {
  const metadata = readRecord(lead.metadata);
  const handoff = readRecord(metadata?.human_handoff);

  await client
    .from("leads")
    .update({
      metadata: {
        ...(metadata ?? {}),
        human_handoff: {
          ...(handoff ?? {}),
          notification_status: input.status,
          notification_sent_at: input.sentAt ?? asString(handoff?.notification_sent_at),
          notification_recipients: input.recipients,
          notification_results: input.results,
          notification_updated_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", lead.id);
}

async function recordNotificationEvent(
  client: SupabaseClient,
  instance: WhatsappInstanceRow,
  data: WhatsappHandoffNotificationEventData,
  eventType: string,
  title: string,
  summary: string,
  payload: JsonRecord,
) {
  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: data.organizationId || instance.organization_id,
    source_type: "whatsapp",
    source_id: data.conversationId ?? instance.id,
    producer_agent_id: data.agentId ?? null,
    event_type: eventType,
    title,
    summary: preview(summary, 500),
    confidence: eventType.includes("failed") ? 0.45 : 0.86,
    visibility: "organization",
    tags: ["whatsapp", "handoff", "notification"],
    payload: {
      ...payload,
      leadId: data.leadId ?? null,
      conversationId: data.conversationId ?? null,
      whatsappInstanceId: data.whatsappInstanceId,
      agentRunId: data.agentRunId ?? null,
      requestedAt: data.requestedAt ?? null,
      pausedUntil: data.pausedUntil ?? null,
      source: data.source ?? null,
    },
  });
}

function readNotificationCooldown(metadata: JsonRecord | null, cooldownMinutes: number) {
  const human = readRecord(metadata?.human_intervention);
  const lastSentAt = asString(human?.notification_last_sent_at);
  if (!lastSentAt) return null;

  const lastSentTime = new Date(lastSentAt).getTime();
  if (!Number.isFinite(lastSentTime)) return null;

  const availableAtMs = lastSentTime + cooldownMinutes * 60 * 1000;
  return {
    active: availableAtMs > Date.now(),
    availableAt: new Date(availableAtMs).toISOString(),
  };
}

async function loadWhatsappInstance(client: SupabaseClient, instanceId: string) {
  if (!instanceId) return null;

  const { data, error } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, phone_number, display_name, instance_token_encrypted, metadata")
    .eq("id", instanceId)
    .maybeSingle<WhatsappInstanceRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar instancia WhatsApp: ${error.message}`);
  }

  return data ?? null;
}

async function loadConversation(client: SupabaseClient, conversationId: string) {
  const { data } = await client
    .from("conversations")
    .select("id, metadata")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  return data ?? null;
}

async function loadLead(client: SupabaseClient, leadId: string) {
  const { data } = await client
    .from("leads")
    .select("id, phone_number, display_name, metadata")
    .eq("id", leadId)
    .maybeSingle<LeadRow>();

  return data ?? null;
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    token: string;
  },
) {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token: options.token,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const data = await readProviderResponse(response);

  if (!response.ok) {
    throw new Error(readProviderError(data) ?? `Uazapi respondeu status ${response.status}.`);
  }

  return { status: response.status, data };
}

async function readProviderResponse(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeRecipientList(value: unknown) {
  if (Array.isArray(value)) {
    return dedupe(value.map((item) => normalizeRecipient(String(item))).filter((item): item is string => Boolean(item)));
  }

  if (typeof value !== "string") {
    return [];
  }

  return dedupe(
    value
      .split(/[\n,;]/)
      .map((item) => normalizeRecipient(item))
      .filter((item): item is string => Boolean(item)),
  );
}

function normalizeRecipient(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

export function isWhatsappHandoffNotificationRecipient(behavior: WhatsappBehaviorConfig, phoneNumber: string | null | undefined) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return false;

  return normalizeRecipientList(behavior.humanHandoffNotificationNumbers).some((recipient) => samePhone(recipient, phone));
}

function samePhone(left: string | null | undefined, right: string | null | undefined) {
  const leftPhone = normalizePhone(left);
  const rightPhone = normalizePhone(right);
  return Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
}

function normalizePhone(value: string | null | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.includes("@")) return trimmed.split("@")[0]?.replace(/\D/g, "") ?? "";
  return trimmed.replace(/\D/g, "");
}

function decryptInstanceToken(instance: WhatsappInstanceRow) {
  if (!instance.instance_token_encrypted) return null;

  try {
    return decryptCredentialValue(instance.instance_token_encrypted);
  } catch {
    return null;
  }
}

function sanitizeProviderData(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return preview(value, 1000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 10).map(sanitizeProviderData);
  const record = readRecord(value);
  if (!record) return null;

  return Object.fromEntries(
    Object.entries(record)
      .slice(0, 30)
      .map(([key, item]) => [key, sanitizeProviderData(item)]),
  );
}

function readProviderError(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  return findString(value, ["error", "message", "detail"]);
}

function findString(value: unknown, keys: string[]): string | null {
  const lower = new Set(keys.map((key) => key.toLowerCase()));
  const stack = [value];
  const seen = new Set<unknown>();

  while (stack.length) {
    const item = stack.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);

    for (const [key, entry] of Object.entries(item as JsonRecord)) {
      if (typeof entry === "string" && lower.has(key.toLowerCase()) && entry.trim()) {
        return entry.trim();
      }
      if (entry && typeof entry === "object") {
        stack.push(entry);
      }
    }
  }

  return null;
}

function formatDateForMessage(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function preview(value: string, max = 240) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}

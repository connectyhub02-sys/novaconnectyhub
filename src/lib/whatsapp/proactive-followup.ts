import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeWhatsappBehaviorConfig } from "./agent-behavior";
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

type ConversationMessageRow = {
  id: string;
  direction: string;
  text_content: string | null;
  occurred_at: string | null;
  payload: JsonRecord | null;
};

export const whatsappFollowUpEventName = "connectyhub/whatsapp.followup.scheduled";

export type WhatsappFollowUpEventData = {
  organizationId: string;
  whatsappInstanceId: string;
  conversationId: string;
  leadId: string;
  agentId: string;
  agentRunId: string;
};

export async function enqueueWhatsappFollowUp(
  data: WhatsappFollowUpEventData,
  delayMinutes: number,
) {
  const ts = Date.now() + delayMinutes * 60 * 1000;
  await inngest.send({
    name: whatsappFollowUpEventName,
    data,
    ts,
  });
}

export async function processWhatsappProactiveFollowUp(input: {
  data: WhatsappFollowUpEventData;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data: eventData } = input;

  const instance = await loadInstance(client, eventData.whatsappInstanceId);
  if (!instance) return { status: "skipped", reason: "missing_instance" };

  const behavior = normalizeWhatsappBehaviorConfig(
    readRecord(instance.metadata)?.behavior_config,
  );

  if (!behavior.proactiveFollowUp) {
    return { status: "skipped", reason: "disabled" };
  }

  if (!isWithinTimeWindow(behavior.followUpTimeWindowStart, behavior.followUpTimeWindowEnd, behavior.aiScheduleTimezone)) {
    return { status: "skipped", reason: "outside_time_window" };
  }

  const token = decryptInstanceToken(instance);
  if (!token) return { status: "skipped", reason: "missing_token" };

  const messages = await loadRecentMessages(client, eventData.conversationId, eventData.whatsappInstanceId);

  const latestMessage = messages[messages.length - 1];
  if (latestMessage?.direction === "outbound") {
    return { status: "skipped", reason: "lead_already_replied_or_agent_sent" };
  }

  const followUpCount = messages.filter(
    (m) => m.direction === "outbound" && readRecord(m.payload)?.delivery_source === "proactive_follow_up",
  ).length;
  if (followUpCount >= behavior.followUpMaxPerConversation) {
    return { status: "skipped", reason: "max_follow_ups_reached" };
  }

  const credentials = await loadUazapiCredentials(client);

  const agent = await loadAgent(client, eventData.agentId, eventData.organizationId);
  if (!agent) return { status: "skipped", reason: "missing_agent" };

  const conversationText = messages
    .slice(-8)
    .map((m) => `${m.direction === "inbound" ? "Lead" : "Agente"}: ${m.text_content ?? ""}`)
    .filter((line) => line.length > 10)
    .join("\n");

  const geminiCredentials = await loadGeminiCredentials(client);
  if (!geminiCredentials) return { status: "skipped", reason: "missing_gemini" };

  const followUpText = await generateFollowUpMessage(geminiCredentials, agent, conversationText);
  if (!followUpText) return { status: "skipped", reason: "empty_generation" };

  const lead = await loadLead(client, eventData.leadId);
  const phone = lead?.phone_number;
  if (!phone) return { status: "skipped", reason: "missing_phone" };

  const providerResponse = await callUazapi(credentials, "/send/text", {
    method: "POST",
    token,
    body: {
      number: phone,
      text: followUpText,
      linkPreview: false,
      track_source: "connectyhub",
      track_id: `proactive_followup_${eventData.conversationId}_${Date.now()}`,
    },
  });

  await client.from("conversation_messages").insert({
    conversation_id: eventData.conversationId,
    whatsapp_instance_id: eventData.whatsappInstanceId,
    organization_id: eventData.organizationId,
    direction: "outbound",
    message_type: "text",
    text_content: followUpText,
    occurred_at: new Date().toISOString(),
    payload: {
      delivery_source: "proactive_follow_up",
      agent_run_id: eventData.agentRunId,
      provider_response: sanitize(providerResponse),
    },
  });

  return { status: "sent", text: followUpText };
}

function isWithinTimeWindow(start: string, end: string, timezone: string) {
  const tz = timezone || "America/Sao_Paulo";
  let hour: number;
  try {
    hour = parseInt(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()), 10);
  } catch {
    hour = new Date().getHours();
  }
  const [startH] = start.split(":").map(Number);
  const [endH] = end.split(":").map(Number);
  if (startH <= endH) {
    return hour >= startH && hour < endH;
  }
  return hour >= startH || hour < endH;
}

async function generateFollowUpMessage(
  geminiCredentials: { apiKey: string; model: string },
  agent: { model_id: string | null; prompt: string | null; persona_name: string | null; name: string },
  conversationText: string,
): Promise<string | null> {
  const prompt = [
    "Voce e um vendedor brasileiro de WhatsApp. O lead parou de responder.",
    "Gere UMA mensagem curta (1-2 frases) de follow-up natural e contextual.",
    "Nao seja generico ('oi, tudo bem?'). Retome algo especifico da conversa.",
    "Exemplos de tom: 'e ai, pensou sobre aquilo?', 'achei uma novidade que combina com o que vc tava procurando'.",
    "Nao mencione que e follow-up, automacao, sistema ou IA.",
    "",
    `Agente: ${agent.persona_name ?? agent.name}`,
    "",
    "Conversa recente:",
    conversationText,
    "",
    "Responda somente a mensagem de follow-up, sem JSON, sem aspas.",
  ].join("\n");

  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(agent.model_id || geminiCredentials.model)}:generateContent`);
  url.searchParams.set("key", geminiCredentials.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        topP: 0.9,
        maxOutputTokens: 200,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;

  const data = await readProviderResponse(response);
  return extractGeminiText(data) || null;
}

function decryptInstanceToken(instance: WhatsappInstanceRow): string | null {
  if (!instance.instance_token_encrypted) return null;
  try {
    return decryptCredentialValue(instance.instance_token_encrypted);
  } catch {
    return null;
  }
}

async function loadInstance(client: SupabaseClient, id: string) {
  const { data } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, phone_number, display_name, instance_token_encrypted, metadata")
    .eq("id", id)
    .maybeSingle<WhatsappInstanceRow>();
  return data;
}

async function loadAgent(client: SupabaseClient, agentId: string, organizationId: string) {
  const { data } = await client
    .from("agent_registry")
    .select("id, name, persona_name, prompt, model_id, metadata")
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .maybeSingle<{ id: string; name: string; persona_name: string | null; prompt: string | null; model_id: string | null; metadata: JsonRecord | null }>();
  return data;
}

async function loadLead(client: SupabaseClient, leadId: string) {
  const { data } = await client
    .from("leads")
    .select("id, phone_number, display_name")
    .eq("id", leadId)
    .maybeSingle<{ id: string; phone_number: string | null; display_name: string | null }>();
  return data;
}

async function loadRecentMessages(client: SupabaseClient, conversationId: string, whatsappInstanceId: string) {
  const { data } = await client
    .from("conversation_messages")
    .select("id, direction, text_content, occurred_at, payload")
    .eq("conversation_id", conversationId)
    .eq("whatsapp_instance_id", whatsappInstanceId)
    .order("occurred_at", { ascending: true })
    .limit(24);
  return (data ?? []) as ConversationMessageRow[];
}

async function loadGeminiCredentials(client: SupabaseClient) {
  const { data } = await client
    .from("credential_vault")
    .select("credential_key, credential_value_encrypted")
    .in("credential_key", ["gemini_api_key", "gemini_model"])
    .limit(2);

  const entries = (data ?? []) as Array<{ credential_key: string; credential_value_encrypted: string }>;
  const apiKeyRow = entries.find((r) => r.credential_key === "gemini_api_key");
  const modelRow = entries.find((r) => r.credential_key === "gemini_model");

  if (!apiKeyRow) return null;

  return {
    apiKey: decryptCredentialValue(apiKeyRow.credential_value_encrypted),
    model: modelRow ? decryptCredentialValue(modelRow.credential_value_encrypted) : "gemini-2.0-flash",
  };
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: { method: "POST"; body: unknown; token: string },
) {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token: options.token,
    },
    body: JSON.stringify(options.body),
    cache: "no-store",
  });
  return readProviderResponse(response);
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

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function sanitize(value: unknown): unknown {
  try {
    const text = JSON.stringify(value);
    return text.length > 2000 ? { truncated: true, preview: text.slice(0, 2000) } : value;
  } catch {
    return null;
  }
}

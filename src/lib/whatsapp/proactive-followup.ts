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

type SalesCatalogFollowUpKind = "abandoned_order" | "post_sale" | "manual";

type SalesCatalogFollowUpOrder = {
  id: string;
  status: string | null;
  paymentStatus: string | null;
  fulfillmentStatus: string | null;
  customerName: string | null;
  total: string | null;
  paymentMethod: string | null;
  shippingMethod: string | null;
  items: Array<{
    title: string;
    tag: string | null;
    quantity: number | null;
    total: string | null;
  }>;
};

export const whatsappFollowUpEventName = "connectyhub/whatsapp.followup.scheduled";

export type WhatsappFollowUpEventData = {
  organizationId: string;
  whatsappInstanceId: string;
  conversationId: string;
  leadId: string;
  agentId: string;
  agentRunId: string;
  salesCatalogOrderId?: string | null;
  salesCatalogFollowUpKind?: SalesCatalogFollowUpKind | null;
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

  const referenceIndex = findFollowUpReferenceIndex(messages, eventData.agentRunId);
  const latestMessage = messages[messages.length - 1];
  if (referenceIndex >= 0 && messages.slice(referenceIndex + 1).some((message) => message.direction === "inbound")) {
    return { status: "skipped", reason: "lead_replied_after_reference" };
  }
  if (referenceIndex < 0 && latestMessage?.direction === "inbound") {
    return { status: "skipped", reason: "lead_already_replied" };
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

  const salesCatalogOrder = eventData.salesCatalogOrderId
    ? await loadSalesCatalogFollowUpOrder(client, eventData.salesCatalogOrderId, eventData.organizationId)
    : null;
  const salesCatalogSkipReason = salesCatalogOrder
    ? getSalesCatalogFollowUpSkipReason(salesCatalogOrder, eventData.salesCatalogFollowUpKind)
    : null;
  if (salesCatalogSkipReason) {
    return { status: "skipped", reason: salesCatalogSkipReason };
  }

  const conversationText = messages
    .slice(-8)
    .map((m) => `${m.direction === "inbound" ? "Lead" : "Agente"}: ${m.text_content ?? ""}`)
    .filter((line) => line.length > 10)
    .join("\n");

  const geminiCredentials = await loadGeminiCredentials(client);
  if (!geminiCredentials) return { status: "skipped", reason: "missing_gemini" };

  const followUpText = await generateFollowUpMessage(geminiCredentials, agent, conversationText, {
    salesCatalogOrder,
    salesCatalogFollowUpKind: eventData.salesCatalogFollowUpKind ?? null,
  });
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

  const sentAt = new Date().toISOString();
  await client.from("conversation_messages").insert({
    conversation_id: eventData.conversationId,
    whatsapp_instance_id: eventData.whatsappInstanceId,
    organization_id: eventData.organizationId,
    lead_id: lead.id,
    provider: "uazapi",
    direction: "outbound",
    message_type: "text",
    text_content: followUpText,
    occurred_at: sentAt,
    payload: {
      delivery_source: "proactive_follow_up",
      agent_run_id: eventData.agentRunId,
      sales_catalog_order_id: eventData.salesCatalogOrderId ?? null,
      sales_catalog_follow_up_kind: eventData.salesCatalogFollowUpKind ?? null,
      provider_response: sanitize(providerResponse),
    },
  });

  await client
    .from("conversations")
    .update({
      status: "waiting_customer",
      last_message_preview: preview(followUpText, 240),
      last_message_at: sentAt,
    })
    .eq("id", eventData.conversationId);

  await client
    .from("leads")
    .update({
      last_event_summary: preview(followUpText, 240),
      last_message_at: sentAt,
    })
    .eq("id", lead.id);

  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: eventData.organizationId,
    source_type: "whatsapp",
    source_id: eventData.conversationId,
    producer_agent_id: eventData.agentId,
    event_type: "whatsapp.proactive_followup.sent",
    title: salesCatalogOrder ? "Follow-up de pedido enviado no WhatsApp" : "Follow-up enviado no WhatsApp",
    summary: preview(followUpText, 500),
    confidence: 0.78,
    visibility: "organization",
    tags: [
      "whatsapp",
      "follow_up",
      ...(salesCatalogOrder ? ["sales_catalog", "sales_catalog_order"] : []),
    ],
    payload: {
      conversation_id: eventData.conversationId,
      lead_id: lead.id,
      agent_run_id: eventData.agentRunId,
      sales_catalog_order_id: eventData.salesCatalogOrderId ?? null,
      sales_catalog_follow_up_kind: eventData.salesCatalogFollowUpKind ?? null,
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
  options: {
    salesCatalogOrder?: SalesCatalogFollowUpOrder | null;
    salesCatalogFollowUpKind?: SalesCatalogFollowUpKind | null;
  } = {},
): Promise<string | null> {
  const prompt = [
    "Voce e um vendedor brasileiro de WhatsApp. O lead parou de responder.",
    "Gere UMA mensagem curta (1-2 frases) de follow-up natural e contextual.",
    "Nao seja generico ('oi, tudo bem?'). Retome algo especifico da conversa.",
    "Exemplos de tom: 'e ai, pensou sobre aquilo?', 'achei uma novidade que combina com o que vc tava procurando'.",
    "Nao mencione que e follow-up, automacao, sistema ou IA.",
    ...buildSalesCatalogFollowUpPromptLines(options.salesCatalogOrder ?? null, options.salesCatalogFollowUpKind ?? null),
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

function findFollowUpReferenceIndex(messages: ConversationMessageRow[], agentRunId: string) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const payload = readRecord(message.payload);
    if (message.direction === "outbound" && payload?.agent_run_id === agentRunId) {
      return index;
    }
  }

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const payload = readRecord(message.payload);
    if (message.direction === "outbound" && payload?.delivery_source !== "proactive_follow_up") {
      return index;
    }
  }

  return -1;
}

async function loadSalesCatalogFollowUpOrder(
  client: SupabaseClient,
  orderId: string,
  organizationId: string,
): Promise<SalesCatalogFollowUpOrder | null> {
  const { data: order } = await client
    .from("sales_catalog_orders")
    .select("id, status, payment_status, fulfillment_status, customer_name, total, payment_method, shipping_method")
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .maybeSingle<{
      id: string;
      status: string | null;
      payment_status: string | null;
      fulfillment_status: string | null;
      customer_name: string | null;
      total: string | null;
      payment_method: string | null;
      shipping_method: string | null;
    }>();

  if (!order) return null;

  const { data: items } = await client
    .from("sales_catalog_order_items")
    .select("title, tag, quantity, total")
    .eq("order_id", order.id)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    customerName: order.customer_name,
    total: order.total,
    paymentMethod: order.payment_method,
    shippingMethod: order.shipping_method,
    items: ((items ?? []) as Array<{ title: string | null; tag: string | null; quantity: number | null; total: string | null }>).map((item) => ({
      title: item.title ?? "Item do catalogo",
      tag: item.tag,
      quantity: item.quantity,
      total: item.total,
    })),
  };
}

function getSalesCatalogFollowUpSkipReason(order: SalesCatalogFollowUpOrder, kind?: SalesCatalogFollowUpKind | null) {
  if (kind !== "abandoned_order") return null;

  if (
    order.status === "paid"
    || order.status === "in_preparation"
    || order.status === "shipped"
    || order.status === "delivered"
    || order.status === "cancelled"
    || order.status === "needs_human"
    || order.paymentStatus === "proof_sent"
    || order.paymentStatus === "confirmed"
    || order.paymentStatus === "failed"
    || order.paymentStatus === "refunded"
  ) {
    return "sales_catalog_order_not_pending";
  }

  return null;
}

function buildSalesCatalogFollowUpPromptLines(order: SalesCatalogFollowUpOrder | null, kind: SalesCatalogFollowUpKind | null) {
  if (!order) return [];

  const itemSummary = order.items.length
    ? order.items.map((item) => {
      const quantity = item.quantity && item.quantity > 1 ? `${item.quantity}x ` : "";
      return `${quantity}${item.title}${item.total ? ` (${item.total})` : ""}`;
    }).join(", ")
    : "item do catalogo";
  const kindLabel = kind === "abandoned_order"
    ? "pedido/carrinho pendente"
    : kind === "post_sale"
      ? "pos-venda"
      : "pedido do catalogo";

  return [
    "",
    "Contexto do Catalogo de Vendas:",
    `- Tipo: ${kindLabel}.`,
    `- Pedido: ${order.id.slice(0, 8)}.`,
    `- Itens: ${itemSummary}.`,
    order.total ? `- Total: ${order.total}.` : "",
    order.paymentMethod ? `- Pagamento combinado: ${order.paymentMethod}.` : "",
    order.shippingMethod ? `- Entrega combinada: ${order.shippingMethod}.` : "",
    "- Use esse contexto apenas se fizer sentido na conversa.",
    "- Para pedido pendente, chame o lead com leveza para decidir o proximo passo: tirar duvida, confirmar pagamento, calcular frete ou reservar.",
    "- Nao invente desconto, prazo, estoque ou condicao que nao apareceu no contexto.",
  ].filter(Boolean);
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

function preview(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

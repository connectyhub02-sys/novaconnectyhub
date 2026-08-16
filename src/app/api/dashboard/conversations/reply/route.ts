import { NextResponse, type NextRequest } from "next/server";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";

type JsonRecord = Record<string, unknown>;

type ConversationRow = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  whatsapp_instance_id: string | null;
  provider: string;
  provider_chat_id: string | null;
  status: string | null;
  last_message_preview: string | null;
  metadata: JsonRecord | null;
};

type LeadRow = {
  id: string;
  phone_number: string | null;
  metadata: JsonRecord | null;
};

type WhatsappInstanceRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
  phone_number: string | null;
  instance_token_encrypted: string | null;
  last_message_at: string | null;
  metadata: JsonRecord | null;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  if (!workspace.organization?.id) {
    return NextResponse.json({ error: "Empresa obrigatoria." }, { status: 400 });
  }

  const body = await readJson<{
    conversationId?: unknown;
    text?: unknown;
  }>(request);
  const conversationId = asString(body?.conversationId) ?? "";
  const text = normalizeReplyText(asString(body?.text));

  if (!conversationId) {
    return NextResponse.json({ error: "Conversa invalida." }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "Digite uma mensagem para responder." }, { status: 422 });
  }

  if (text.length > 4000) {
    return NextResponse.json({ error: "A resposta manual precisa ter no maximo 4.000 caracteres." }, { status: 422 });
  }

  const client = createServiceClient();
  const { data: conversation, error: conversationError } = await client
    .from("conversations")
    .select("id, organization_id, lead_id, whatsapp_instance_id, provider, provider_chat_id, status, last_message_preview, metadata")
    .eq("id", conversationId)
    .eq("organization_id", workspace.organization.id)
    .maybeSingle<ConversationRow>();

  if (conversationError) {
    return NextResponse.json({ error: conversationError.message }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversa nao encontrada nesta empresa." }, { status: 404 });
  }

  if (!conversation.whatsapp_instance_id) {
    return NextResponse.json({ error: "Esta conversa ainda nao tem WhatsApp conectado para resposta direta." }, { status: 409 });
  }

  const { data: instance, error: instanceError } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, provider, status, phone_number, instance_token_encrypted, last_message_at, metadata")
    .eq("id", conversation.whatsapp_instance_id)
    .eq("organization_id", workspace.organization.id)
    .neq("status", "archived")
    .maybeSingle<WhatsappInstanceRow>();

  if (instanceError) {
    return NextResponse.json({ error: instanceError.message }, { status: 500 });
  }

  if (!instance) {
    return NextResponse.json({ error: "Instancia WhatsApp nao encontrada para esta conversa." }, { status: 404 });
  }

  if (instance.status !== "connected") {
    return NextResponse.json({ error: "Conecte o WhatsApp antes de responder pelo painel." }, { status: 409 });
  }

  const token = decryptInstanceToken(instance);

  if (!token) {
    return NextResponse.json({ error: "Instancia sem token seguro. Reconecte o WhatsApp." }, { status: 409 });
  }

  const lead = conversation.lead_id ? await loadLead(client, conversation.lead_id, workspace.organization.id) : null;
  const recipient = normalizeWhatsappRecipient(conversation.provider_chat_id)
    ?? normalizeWhatsappRecipient(lead?.phone_number)
    ?? normalizeWhatsappRecipient(readString(readRecord(lead?.metadata)?.phone));

  if (!recipient) {
    return NextResponse.json({ error: "Nao encontramos o numero do lead para enviar a resposta." }, { status: 422 });
  }

  const credentials = await loadUazapiCredentials(client);
  const now = new Date().toISOString();
  const trackId = `dashboard_human_reply_${conversation.id}_${Date.now()}`;
  const providerResponse = await sendUazapiText({
    credentials,
    token,
    number: recipient,
    text,
    trackId,
  });

  if (!providerResponse.ok) {
    return NextResponse.json(
      {
        error: readProviderError(providerResponse.data) ?? "Falha ao enviar mensagem pelo WhatsApp conectado.",
        provider: sanitizeProviderData(providerResponse.data),
      },
      { status: providerResponse.status || 502 },
    );
  }

  const providerMessageId = findNestedString(providerResponse.data, [
    "messageId",
    "message_id",
    "messageid",
    "id",
    "keyId",
    "key_id",
    "wa_id",
  ]);
  const metadata = readRecord(conversation.metadata) ?? {};
  const currentHuman = readRecord(metadata.human_intervention) ?? {};
  const pausedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const humanIntervention = {
    ...currentHuman,
    active: true,
    reason: "manual_dashboard_reply",
    source: "connectyhub_dashboard",
    last_human_message_at: now,
    paused_until: pausedUntil,
    updated_at: now,
  };
  const authorLabel = workspace.profile.fullName ?? workspace.profile.email ?? "Humano";
  const messagePayload = {
    delivery_source: "dashboard_manual_reply",
    track_source: "connectyhub_dashboard_human",
    track_id: trackId,
    author_type: "human",
    author_label: authorLabel,
    author_source: "connectyhub_dashboard",
    message_author: {
      type: "human",
      label: authorLabel,
      source: "connectyhub_dashboard",
      user_id: workspace.user.id,
    },
    provider_response: sanitizeProviderData(providerResponse.data),
  };

  const { data: message, error: messageError } = await client
    .from("conversation_messages")
    .insert({
      organization_id: workspace.organization.id,
      conversation_id: conversation.id,
      lead_id: conversation.lead_id,
      whatsapp_instance_id: instance.id,
      provider: instance.provider || "uazapi",
      provider_message_id: providerMessageId,
      provider_chat_id: conversation.provider_chat_id ?? recipient,
      direction: "outbound",
      message_type: "text",
      text_content: text,
      payload: messagePayload,
      occurred_at: now,
    })
    .select("id, direction, provider, provider_message_id, provider_chat_id, message_type, text_content, payload, occurred_at, created_at")
    .single<{
      id: string;
      direction: "inbound" | "outbound" | "system" | "unknown";
      provider: string;
      provider_message_id: string | null;
      provider_chat_id: string | null;
      message_type: string | null;
      text_content: string | null;
      payload: JsonRecord | null;
      occurred_at: string | null;
      created_at: string | null;
    }>();

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }

  const preview = previewText(text, 240);

  await Promise.all([
    client
      .from("conversations")
      .update({
        status: "waiting_customer",
        last_message_preview: preview,
        last_message_at: now,
        metadata: {
          ...metadata,
          human_intervention: humanIntervention,
        },
      })
      .eq("id", conversation.id)
      .eq("organization_id", workspace.organization.id),
    conversation.lead_id
      ? client
          .from("leads")
          .update({
            last_event_summary: preview,
            last_message_at: now,
          })
          .eq("id", conversation.lead_id)
          .eq("organization_id", workspace.organization.id)
      : Promise.resolve(null),
    client
      .from("whatsapp_instances")
      .update({
        last_message_at: now,
        metadata: {
          ...(readRecord(instance.metadata) ?? {}),
          last_dashboard_reply_at: now,
          last_dashboard_reply_conversation_id: conversation.id,
        },
      })
      .eq("id", instance.id)
      .eq("organization_id", workspace.organization.id),
  ]);

  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: workspace.organization.id,
    source_type: "whatsapp",
    source_id: conversation.id,
    event_type: "whatsapp.human.reply.sent",
    title: "Atendente respondeu pelo painel",
    summary: previewText(text, 500),
    confidence: 1,
    visibility: "organization",
    tags: ["whatsapp", "human", "dashboard_reply"],
    payload: {
      conversation_id: conversation.id,
      lead_id: conversation.lead_id,
      whatsapp_instance_id: instance.id,
      provider_message_id: providerMessageId,
      track_id: trackId,
    },
    occurred_at: now,
  });

  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      direction: message.direction,
      author: "human",
      authorLabel: authorLabel,
      authorSource: "connectyhub_dashboard",
      agentRunId: null,
      agentId: null,
      provider: message.provider,
      providerMessageId: message.provider_message_id,
      providerChatId: message.provider_chat_id,
      type: message.message_type ?? "text",
      text: message.text_content ?? text,
      mediaUrl: null,
      occurredAt: message.occurred_at ?? message.created_at ?? now,
    },
    humanIntervention: {
      active: true,
      pausedUntil,
      reason: humanIntervention.reason,
      source: humanIntervention.source,
      updatedAt: now,
    },
  });
}

async function loadLead(client: ReturnType<typeof createServiceClient>, leadId: string, organizationId: string) {
  const { data } = await client
    .from("leads")
    .select("id, phone_number, metadata")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle<LeadRow>();

  return data ?? null;
}

async function sendUazapiText(input: {
  credentials: UazapiCredentials;
  token: string;
  number: string;
  text: string;
  trackId: string;
}) {
  const startedAt = Date.now();
  const response = await fetch(`${input.credentials.baseUrl}/send/text`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token: input.token,
    },
    body: JSON.stringify({
      number: input.number,
      text: input.text,
      linkPreview: false,
      track_source: "connectyhub_dashboard_human",
      track_id: input.trackId,
    }),
    cache: "no-store",
  });

  return {
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - startedAt,
    data: await readProviderResponse(response),
  };
}

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function readProviderResponse(response: Response) {
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

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeReplyText(value: string | null) {
  return value?.replace(/\r\n/g, "\n").trim() ?? "";
}

function normalizeWhatsappRecipient(value: string | null | undefined) {
  const text = value?.trim();

  if (!text) {
    return null;
  }

  if (/@g\.us$/i.test(text)) {
    return text;
  }

  const withoutDomain = text.replace(/@s\.whatsapp\.net$/i, "");
  const digits = withoutDomain.replace(/\D/g, "");

  return digits.length >= 10 ? digits : null;
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
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function findNestedString(value: unknown, keys: string[]): string | null {
  const direct = readRecord(value);

  if (direct) {
    for (const key of keys) {
      const candidate = readString(direct[key]);

      if (candidate) {
        return candidate;
      }
    }

    for (const nested of Object.values(direct)) {
      const candidate = findNestedString(nested, keys);

      if (candidate) {
        return candidate;
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findNestedString(item, keys);

      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

function readProviderError(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 500);
  }

  const record = readRecord(value);
  const message = readString(record?.message)
    ?? readString(record?.error)
    ?? readString(record?.details)
    ?? readString(record?.reason);

  return message ? message.slice(0, 500) : null;
}

function sanitizeProviderData(value: unknown): unknown {
  try {
    const text = JSON.stringify(value);
    return text.length > 3000 ? { truncated: true, preview: text.slice(0, 3000) } : value;
  } catch {
    return null;
  }
}

function previewText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

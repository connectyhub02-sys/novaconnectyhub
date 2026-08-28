import { NextResponse, type NextRequest } from "next/server";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import {
  buildUazapiDownloadBodies,
  extractMimeType,
  extractProviderDownloadUrl,
  readProviderError,
  resolveConversationMessageMedia,
  type ConversationMessageMediaInput,
} from "@/lib/whatsapp/message-media";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MessageMediaRow = ConversationMessageMediaInput & {
  organization_id: string;
  conversation_id: string | null;
  whatsapp_instance_id: string | null;
  occurred_at: string | null;
  created_at: string | null;
};

type WhatsappInstanceRow = {
  id: string;
  organization_id: string;
  instance_token_encrypted: string | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const { messageId } = await params;
    const normalizedMessageId = messageId?.trim();

    if (!normalizedMessageId) {
      return NextResponse.json({ error: "Mensagem obrigatoria." }, { status: 400 });
    }

    const workspace = await getCurrentWorkspace();

    if (!workspace) {
      return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    }

    const client = createServiceClient();
    const message = await loadConversationMessage(client, normalizedMessageId);

    if (!message) {
      return NextResponse.json({ error: "Audio nao encontrado." }, { status: 404 });
    }

    if (!workspace.profile.isPlatformAdmin && workspace.organization?.id !== message.organization_id) {
      return NextResponse.json({ error: "Sem permissao para acessar esta midia." }, { status: 403 });
    }

    const media = resolveConversationMessageMedia(message);

    if (media.kind !== "audio") {
      return NextResponse.json({ error: "Esta mensagem nao e um audio." }, { status: 404 });
    }

    const directUrl = media.directUrl;

    if (directUrl) {
      return await proxyAudioUrl(request, directUrl, media.mimeType);
    }

    if (!message.whatsapp_instance_id) {
      return NextResponse.json({ error: "Instancia do WhatsApp nao encontrada para esta mensagem." }, { status: 404 });
    }

    const instance = await loadWhatsappInstance(client, message.whatsapp_instance_id);

    if (!instance || instance.organization_id !== message.organization_id) {
      return NextResponse.json({ error: "Instancia do WhatsApp indisponivel." }, { status: 404 });
    }

    const token = decryptInstanceToken(instance);

    if (!token) {
      return NextResponse.json({ error: "Token da instancia indisponivel." }, { status: 409 });
    }

    const credentials = await loadUazapiCredentials(client);
    const downloaded = await resolveProviderAudioDownloadUrl({
      credentials,
      message,
      token,
    });

    return await proxyAudioUrl(request, downloaded.url, downloaded.mimeType ?? media.mimeType);
  } catch (error) {
    console.error("[AttendanceMedia] Falha ao carregar audio da mensagem", error);

    return NextResponse.json(
      { error: "Nao foi possivel carregar o audio agora." },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 503,
      },
    );
  }
}

async function loadConversationMessage(client: ReturnType<typeof createServiceClient>, messageId: string) {
  const { data, error } = await client
    .from("conversation_messages")
    .select("id, organization_id, conversation_id, whatsapp_instance_id, provider_message_id, provider_chat_id, message_type, text_content, payload, occurred_at, created_at")
    .eq("id", messageId)
    .maybeSingle<MessageMediaRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar mensagem: ${error.message}`);
  }

  return data ?? null;
}

async function loadWhatsappInstance(client: ReturnType<typeof createServiceClient>, instanceId: string) {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, instance_token_encrypted")
    .eq("id", instanceId)
    .maybeSingle<WhatsappInstanceRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar instancia WhatsApp: ${error.message}`);
  }

  return data ?? null;
}

async function resolveProviderAudioDownloadUrl(input: {
  credentials: UazapiCredentials;
  message: MessageMediaRow;
  token: string;
}) {
  const bodies = buildUazapiDownloadBodies(input.message, input.message.provider_chat_id, {
    transcribe: false,
  });
  let lastError = "sem detalhe do provedor";

  for (const body of bodies) {
    const response = await callUazapi(input.credentials, "/message/download", {
      body,
      token: input.token,
      timeoutMs: 20000,
    });

    if (response.ok) {
      const url = extractProviderDownloadUrl(response.data);
      const mimeType = extractMimeType(response.data);

      if (url) {
        return {
          mimeType,
          url,
        };
      }

      lastError = "provedor nao retornou link de audio";
      continue;
    }

    lastError = readProviderError(response.data) ?? `status ${response.status}`;
  }

  throw new Error(`Nao foi possivel baixar audio do WhatsApp: ${lastError}.`);
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: {
    body: unknown;
    timeoutMs: number;
    token: string;
  },
) {
  const response = await fetchWithTimeout(`${credentials.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token: options.token,
    },
    body: JSON.stringify(options.body),
    cache: "no-store",
  }, options.timeoutMs, `Uazapi ${path}`);
  const data = await readProviderResponse(response);

  return {
    data,
    ok: response.ok,
    status: response.status,
  };
}

async function proxyAudioUrl(request: NextRequest, url: string, fallbackMimeType: string | null) {
  const range = request.headers.get("range");
  const response = await fetchWithTimeout(url, {
    headers: range ? { Range: range } : undefined,
    cache: "no-store",
  }, 30000, "Download do audio");

  if (!response.ok && response.status !== 206) {
    throw new Error(`Origem do audio respondeu status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim()
    || fallbackMimeType
    || "audio/mpeg";
  const headers = new Headers({
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": "inline",
    "Content-Type": contentType,
  });

  for (const header of ["accept-ranges", "content-length", "content-range"]) {
    const value = response.headers.get(header);

    if (value) {
      headers.set(header, value);
    }
  }

  return new Response(response.body, {
    headers,
    status: response.status === 206 ? 206 : 200,
  });
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number, label: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${label} excedeu ${Math.round(timeoutMs / 1000)}s.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readProviderResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return await response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");
  return text ? { message: text.slice(0, 500) } : null;
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

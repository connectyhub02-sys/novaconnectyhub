import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import {
  cloudRequest,
  officialSettings,
  type OfficialConnection,
} from "./whatsapp-cloud";

const types: Record<string, { type: string; max: number }> = {
  "image/jpeg": { type: "image", max: 5 },
  "image/png": { type: "image", max: 5 },
  "video/mp4": { type: "video", max: 16 },
  "audio/mpeg": { type: "audio", max: 16 },
  "audio/ogg": { type: "audio", max: 16 },
  "audio/mp4": { type: "audio", max: 16 },
  "application/pdf": { type: "document", max: 16 },
};
export async function uploadOfficialMedia(
  client: SupabaseClient,
  connection: OfficialConnection,
  file: File,
) {
  const spec = types[file.type];
  if (!spec || file.size === 0 || file.size > spec.max * 1024 * 1024)
    throw new Error("Use JPG/PNG até 5 MB ou PDF, MP4, MP3/OGG até 16 MB.");
  const config = await officialSettings(client),
    token = decryptCredentialValue(connection.encrypted_token);
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", file.type);
  form.append("file", file);
  const uploadUrl = new URL(
    `https://graph.facebook.com/${config.graphVersion}/${connection.phone_number_id}/media`,
  );
  uploadUrl.searchParams.set(
    "appsecret_proof",
    createHmac("sha256", config.appSecret).update(token).digest("hex"),
  );
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !/^\d+$/.test(String(result?.id)))
    throw new Error("Meta não aceitou o arquivo. Confira tamanho e formato.");
  const filename = file.name.replace(/[\r\n"\\/]/g, "_").slice(0, 120);
  const stored = await client.from("meta_whatsapp_media").insert({
    id: result.id,
    organization_id: connection.organization_id,
    phone_number_id: connection.phone_number_id,
    mime_type: file.type,
    filename,
    media_type: spec.type,
  });
  if (stored.error)
    throw new Error(
      "Arquivo recebido pela Meta, mas não registrado no painel. Anexe novamente.",
    );
  return { id: result.id, type: spec.type, filename };
}
export async function downloadOfficialMedia(
  client: SupabaseClient,
  connection: OfficialConnection,
  messageId: string,
) {
  const row = await client
    .from("meta_whatsapp_messages")
    .select("content,message_type")
    .eq("organization_id", connection.organization_id)
    .eq("phone_number_id", connection.phone_number_id)
    .eq("id", messageId)
    .maybeSingle();
  if (row.error || !row.data)
    throw new Error("Arquivo não encontrado nesta conversa.");
  const id = String(row.data.content?.[row.data.message_type]?.id ?? "");
  if (!/^\d+$/.test(id))
    throw new Error("Esta mensagem não tem arquivo disponível.");
  const config = await officialSettings(client),
    token = decryptCredentialValue(connection.encrypted_token);
  const media = await cloudRequest<{
    url: string;
    mime_type: string;
    file_size: number;
  }>(config, token, id);
  const url = new URL(media.url);
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname === "lookaside.fbsbx.com" ||
      url.hostname.endsWith(".fbsbx.com")
    ) ||
    url.username ||
    url.password ||
    media.file_size > 16 * 1024 * 1024
  )
    throw new Error("Endereço ou tamanho de mídia não suportado.");
  const result = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!result.ok) throw new Error("Arquivo indisponível na Meta.");
  const reader = result.body?.getReader();
  if (!reader) throw new Error("Arquivo vazio.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Arquivo excede o limite.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // Downloads are attachments: never render untrusted active content on the app origin.
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="arquivo-whatsapp"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

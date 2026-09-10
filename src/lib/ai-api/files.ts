import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGeminiCredentials } from "@/lib/gemini/credentials";
import { AiApiError, record, type authenticateAi } from "./gateway";
type Auth = Awaited<ReturnType<typeof authenticateAi>>;
const provider = "https://generativelanguage.googleapis.com";

export function publicAiFile(row: Record<string, unknown>) {
  const metadata = record(row.metadata);
  return { id: row.id, name: `files/${row.id}`, display_name: metadata.display_name, mime_type: metadata.mime_type, size_bytes: metadata.size_bytes, status: row.status, created_at: row.created_at, expires_at: row.expires_at };
}

export async function uploadAiFile(client: SupabaseClient, auth: Auth, input: unknown) {
  const body = record(input);
  if (typeof body.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data) || body.data.length > 27_000_000) throw new AiApiError("invalid_file", 422, "Informe o arquivo em base64, com até 20 MB.");
  const bytes = Buffer.from(body.data, "base64");
  if (!bytes.length || bytes.length > 20_000_000) throw new AiApiError("invalid_file", 422, "Arquivo vazio ou maior que 20 MB.");
  const mime = String(body.mime_type ?? "");
  if (!/^(image\/(png|jpeg|webp)|audio\/(mpeg|mp4|wav|aac|ogg|flac)|video\/(mp4|webm|quicktime)|application\/pdf|text\/plain)$/.test(mime)) throw new AiApiError("invalid_file", 422, "Tipo de arquivo não suportado.");
  const displayName = String(body.display_name ?? "Arquivo").slice(0, 200);
  const saved = await client.from("ai_resources").insert({ organization_id: auth.billingOrganizationId, project_id: auth.project.id, key_id: auth.key.id, kind: "file", status:"preparing", metadata: { display_name: displayName, mime_type: mime, size_bytes: bytes.length } }).select("*").single();
  if (saved.error || !saved.data) throw new AiApiError("service_unavailable", 503, "Não foi possível registrar o arquivo.");
  const resource = saved.data;
  try {
    const { apiKey } = await loadGeminiCredentials(client);
    const start = await fetch(`${provider}/upload/v1beta/files`, { method: "POST", redirect: "error", headers: { "x-goog-api-key": apiKey, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(bytes.length), "X-Goog-Upload-Header-Content-Type": mime, "Content-Type": "application/json" }, body: JSON.stringify({ file: { display_name: displayName } }), signal: AbortSignal.timeout(20000) });
    const upload = start.headers.get("x-goog-upload-url");
    if (!start.ok || !upload || new URL(upload).origin !== provider || !new URL(upload).pathname.startsWith("/upload/")) throw new Error("Upload unavailable");
    const completed = await fetch(upload, { method: "POST", redirect: "error", headers: { "Content-Length": String(bytes.length), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "Content-Type": mime }, body: bytes, signal: AbortSignal.timeout(90000) });
    if (!completed.ok) throw new Error("Upload failed");
    const file = record(record(await completed.json()).file);
    if (typeof file.name !== "string" || !/^files\/[a-zA-Z0-9_-]+$/.test(file.name)) throw new Error("Invalid file response");
    const update = { provider_name: file.name, status: file.state === "ACTIVE" ? "active" : file.state === "FAILED" ? "failed" : "processing", metadata: { ...record(resource.metadata), uri: file.uri }, expires_at: file.expirationTime ?? null, updated_at: new Date().toISOString() };
    const persisted = await client.from("ai_resources").update(update).eq("id", resource.id).eq("status","preparing").select("id").maybeSingle();
    if (persisted.error || !persisted.data) {
      await fetch(`${provider}/v1beta/${file.name}`, { method: "DELETE", headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(10000) }).catch(() => undefined);
      throw new Error("Archive unavailable");
    }
    return publicAiFile({ ...resource, ...update });
  } catch {
    await client.from("ai_resources").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", resource.id).eq("status","preparing");
    throw new AiApiError("file_upload_failed", 502, "Não foi possível concluir o envio do arquivo.");
  }
}

export async function getOwnedAiResource(client: SupabaseClient, auth: Auth, id: string, kind: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new AiApiError("resource_not_found", 404, "Recurso não encontrado.");
  const { data, error } = await client.from("ai_resources").select("*").eq("id", id).eq("project_id", auth.project.id).eq("kind", kind).maybeSingle();
  if (error) throw new AiApiError("service_unavailable", 503, "Não foi possível consultar o recurso.");
  if (!data || data.status === "deleted") throw new AiApiError("resource_not_found", 404, "Recurso não encontrado neste projeto.");
  return data;
}

export async function refreshAiFile(client: SupabaseClient, auth: Auth, id: string, remove = false) {
  const row = await getOwnedAiResource(client, auth, id, "file");
  if (!row.provider_name) {
    if(remove) {
      const updated=await client.from("ai_resources").update({status:"deleted",updated_at:new Date().toISOString()}).eq("id",row.id).is("provider_name",null).select("id").maybeSingle();
      if(updated.error) throw new AiApiError("service_unavailable",503,"Não foi possível remover o arquivo.");
      if(!updated.data) return refreshAiFile(client,auth,id,true);
    }
    return publicAiFile({...row,...(remove?{status:"deleted"}:{})});
  }
  if (!/^files\/[a-zA-Z0-9_-]+$/.test(row.provider_name)) throw new AiApiError("service_unavailable", 503, "Arquivo indisponível.");
  const { apiKey } = await loadGeminiCredentials(client);
  const response = await fetch(`${provider}/v1beta/${row.provider_name}`, { method: remove ? "DELETE" : "GET", headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(20000) });
  if (!response.ok && response.status !== 404) throw new AiApiError("service_unavailable", 503, "Não foi possível atualizar o arquivo.");
  const file = remove || response.status === 404 ? {} : record(await response.json());
  const status = remove ? "deleted" : response.status === 404 ? "expired" : file.state === "ACTIVE" ? "active" : file.state === "FAILED" ? "failed" : "processing";
  const update = await client.from("ai_resources").update({ status, updated_at: new Date().toISOString() }).eq("id", row.id).neq("status","deleted").select("id").maybeSingle();
  if (update.error) throw new AiApiError("service_unavailable", 503, "Não foi possível registrar a atualização.");
  return publicAiFile({ ...row, status:update.data?status:"deleted" });
}

export async function resolveAiFileParts(client: SupabaseClient, auth: Auth, contents: Array<{ role: string; parts: Record<string, unknown>[] }>) {
  const capabilities: string[] = [];
  for (const content of contents) for (const part of content.parts) if (part.fileData) {
    const file = record(part.fileData);
    const id = String(file.fileUri).slice("files/".length);
    const row = await getOwnedAiResource(client, auth, id, "file");
    if (row.status !== "active" || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())) throw new AiApiError("file_not_ready", 422, "O arquivo ainda não está pronto ou expirou.");
    const metadata = record(row.metadata);
    if (typeof metadata.uri !== "string" || !metadata.uri.startsWith(`${provider}/`)) throw new AiApiError("file_not_ready", 422, "Arquivo indisponível.");
    part.fileData = { mimeType: metadata.mime_type, fileUri: metadata.uri };
    const mime = String(metadata.mime_type);
    capabilities.push(mime.startsWith("image/") ? "image_input" : mime.startsWith("audio/") ? "audio_input" : mime.startsWith("video/") ? "video_input" : "pdf_input");
  }
  return capabilities;
}

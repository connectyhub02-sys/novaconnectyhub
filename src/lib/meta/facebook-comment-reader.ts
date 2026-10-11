import "server-only";

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMetaGuidedOAuthConfig } from "@/lib/client-os/guided-oauth";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import type { MetaWebhookEvent } from "./webhook-events";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};

// Page feed notifications can contain only a comment reference, without its text.
// Resolve that reference with the selected Page's tenant-scoped credential.
export async function hydrateFacebookComment(input: {
  client: SupabaseClient;
  event: MetaWebhookEvent;
  integration: { organization_id: string; metadata: RecordValue | null };
}): Promise<MetaWebhookEvent> {
  const { event, integration } = input;
  const change = record(event.payload.change);
  const value = record(change.value);
  if (event.payload.object !== "page" || change.field !== "feed" || value.item !== "comment"
    || value.verb !== "add" || typeof value.message === "string") return event;

  const pageId = integration.metadata?.selected_facebook_page_id ?? integration.metadata?.facebook_page_id;
  const commentId = value.comment_id;
  if (typeof pageId !== "string" || event.assetId !== pageId
    || typeof value.post_id !== "string" || !value.post_id.startsWith(`${pageId}_`)
    || typeof commentId !== "string" || !/^\d+_\d+$/.test(commentId)) {
    throw new Error("Referencia de comentario fora da Pagina Meta selecionada.");
  }
  const { data, error } = await input.client.from("integration_credentials")
    .select("encrypted_value").eq("scope", "organization")
    .eq("organization_id", integration.organization_id).eq("integration_id", "meta")
    .eq("env_name", "FACEBOOK_PAGE_ACCESS_TOKEN")
    .maybeSingle<{ encrypted_value: string | null }>();
  if (error || !data?.encrypted_value) throw new Error("Credencial da Pagina indisponivel para ler comentario.");
  const token = decryptCredentialValue(data.encrypted_value);
  const config = await loadMetaGuidedOAuthConfig({ client: input.client });
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${commentId}`);
  url.searchParams.set("fields", "id,message");
  url.searchParams.set("appsecret_proof", createHmac("sha256", config.appSecret).update(token).digest("hex"));
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  } catch {
    throw new Error("Nao foi possivel consultar o comentario na Meta.");
  }
  const body = record(await response.json().catch(() => null));
  if (!response.ok || body.id !== commentId || typeof body.message !== "string") {
    throw new Error(`Texto do comentario indisponivel na Meta (HTTP ${response.status}).`);
  }
  return { ...event, payload: { ...event.payload,
    change: { ...change, value: { ...value, message: body.message } } } };
}

import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMetaGuidedOAuthConfig } from "@/lib/client-os/guided-oauth";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";

export type MetaRecord = Record<string, unknown>;
export const metaRecord = (v: unknown): MetaRecord => v && typeof v === "object" && !Array.isArray(v) ? v as MetaRecord : {};
export function selectedMetaAsset(metadata: MetaRecord, key: string) {
  const value = Object.hasOwn(metadata, `selected_${key}`) ? metadata[`selected_${key}`] : metadata[key];
  return typeof value === "string" && /^(act_)?\d+$/.test(value) ? value : "";
}
export async function loadAdsLeadsContext(client: SupabaseClient, organizationId: string) {
  const connection = await client.from("organization_integrations").select("id,status,scopes,metadata")
    .eq("organization_id", organizationId).eq("provider_id", "meta-ads").eq("status", "connected").single();
  if (connection.error || !connection.data) throw new Error("Conecte a conta Meta desta empresa em Integrações.");
  const credentials = await client.from("integration_credentials").select("env_name,encrypted_value")
    .eq("scope", "organization").eq("organization_id", organizationId).eq("integration_id", "meta")
    .in("env_name", ["META_ACCESS_TOKEN", "FACEBOOK_PAGE_ACCESS_TOKEN"]);
  if (credentials.error) throw new Error("Não foi possível abrir a conexão Meta.");
  const tokens = new Map((credentials.data ?? []).filter(r => r.encrypted_value)
    .map(r => [r.env_name, decryptCredentialValue(r.encrypted_value)]));
  const metadata = metaRecord(connection.data.metadata);
  return { client, organizationId, integrationId: connection.data.id as string,
    config: await loadMetaGuidedOAuthConfig({client}),
    scopes: (connection.data.scopes ?? []) as string[],
    pageId: selectedMetaAsset(metadata, "facebook_page_id"),
    adAccountId: selectedMetaAsset(metadata, "ad_account_id"),
    token: tokens.get("META_ACCESS_TOKEN") ?? "", pageToken: tokens.get("FACEBOOK_PAGE_ACCESS_TOKEN") ?? "" };
}
export type AdsLeadsContext = Awaited<ReturnType<typeof loadAdsLeadsContext>>;
export class MetaGraphError extends Error {
  constructor(message:string,public definitive:boolean){super(message);}
}
export function requireMetaScopes(ctx: AdsLeadsContext, scopes: string[]) {
  const missing = scopes.filter(s => !ctx.scopes.includes(s));
  if (missing.length) throw new Error(`Reconecte a Meta com as permissões: ${missing.join(", ")}.`);
}
export async function adsLeadsGraph(ctx: AdsLeadsContext, path: string, params: Record<string,string> = {}, page = true, method: "GET" | "POST" = "GET") {
  const token = page ? ctx.pageToken : ctx.token;
  if (!token || !/^(?:act_)?\d+(?:\/[a-z_]+)?$/.test(path)) throw new Error("Ativo ou credencial Meta indisponível.");
  const url = new URL(`https://graph.facebook.com/${ctx.config.graphVersion}/${path}`);
  url.searchParams.set("appsecret_proof", createHmac("sha256", ctx.config.appSecret).update(token).digest("hex"));
  if (method === "GET") for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const response = await fetch(url, {method, cache:"no-store", redirect:"error", signal:AbortSignal.timeout(20000),
    headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},
    ...(method === "POST" ? {body:new URLSearchParams(params)} : {})});
  const body = metaRecord(await response.json().catch(() => null));
  if (!response.ok || body.error) {
    const error=metaRecord(body.error),code=error.code;
    const hint=typeof error.error_user_msg==="string"?error.error_user_msg.slice(0,600):"Confira permissões e acesso ao ativo.";
    throw new MetaGraphError(`Meta recusou a operação (HTTP ${response.status}${typeof code === "number" ? `, código ${code}` : ""}). ${hint}`,response.status>=400&&response.status<500&&error.is_transient!==true&&typeof code==="number");
  }
  return body;
}

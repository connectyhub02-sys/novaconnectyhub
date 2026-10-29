import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { getAppBaseUrl } from "@/lib/client-os/guided-oauth";
import { hasSocialScopes, socialScopes, type SocialProvider, type SocialAccount } from "./policy";

export type SocialConfig = { provider: SocialProvider; clientId: string; clientSecret: string; redirectUri: string };
export type SocialTokens = { accessToken: string; refreshToken: string; expiresAt: number; refreshExpiresAt: number | null; scopes: string[]; subject: string | null };
export class SocialProviderError extends Error {
  constructor() { super("Não foi possível validar a autorização. Confira as permissões e reconecte a conta."); }
}
export async function loadSocialConfig(provider: SocialProvider, client: SupabaseClient): Promise<SocialConfig | null> {
  const prefix = provider.toUpperCase();
  const idKey = provider === "tiktok" ? "TIKTOK_CLIENT_KEY" : "YOUTUBE_CLIENT_ID";
  const names = [idKey, `${prefix}_CLIENT_SECRET`];
  const result = await client.from("integration_credentials").select("env_name,encrypted_value")
    .eq("scope", "platform").is("organization_id", null).eq("integration_id", provider).in("env_name", names).order("updated_at", { ascending: false });
  if (result.error) throw new Error("Não foi possível consultar a configuração das redes sociais.");
  const values: Record<string, string> = {};
  for (const row of result.data ?? []) {
    if (!values[row.env_name]) values[row.env_name] = decryptCredentialValue(row.encrypted_value);
  }
  const clientId = values[idKey] || process.env[idKey]?.trim();
  const clientSecret = values[names[1]] || process.env[names[1]]?.trim();
  if (!clientId || !clientSecret || !process.env.CREDENTIAL_ENCRYPTION_KEY) return null;
  return { provider, clientId, clientSecret, redirectUri: `${getAppBaseUrl()}/api/dashboard/social/${provider}/callback` };
}
export function socialAuthorizationUrl(config: SocialConfig, state: string) {
  const youtube = config.provider === "youtube";
  const url = new URL(youtube ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set(youtube ? "client_id" : "client_key", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", socialScopes[config.provider].join(youtube ? " " : ","));
  if (youtube) { url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent select_account"); }
  return url.toString();
}
async function providerJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || (data.error && data.error.code !== "ok")) throw new SocialProviderError();
  return data;
}
export async function exchangeSocialTokens(config: SocialConfig, code: string, previous?: SocialTokens): Promise<SocialTokens> {
  const youtube = config.provider === "youtube";
  const form = new URLSearchParams({ [youtube ? "client_id" : "client_key"]: config.clientId, client_secret: config.clientSecret,
    grant_type: previous ? "refresh_token" : "authorization_code" });
  if (previous) form.set("refresh_token", previous.refreshToken);
  else { form.set("code", code); form.set("redirect_uri", config.redirectUri); }
  const data = await providerJson(youtube ? "https://oauth2.googleapis.com/token" : "https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
  });
  const scopes = typeof data.scope === "string" ? data.scope.split(/[\s,]+/).filter(Boolean) : previous?.scopes ?? [];
  const refreshToken = data.refresh_token || previous?.refreshToken;
  if (typeof data.access_token !== "string" || !data.access_token || typeof refreshToken !== "string" || !refreshToken || !hasSocialScopes(config.provider, scopes) || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new SocialProviderError();
  if (previous?.subject && data.open_id && data.open_id !== previous.subject) throw new SocialProviderError();
  return { accessToken: data.access_token, refreshToken, expiresAt: Date.now() + data.expires_in * 1000,
    refreshExpiresAt: Number.isFinite(data.refresh_expires_in) ? Date.now() + data.refresh_expires_in * 1000 : previous?.refreshExpiresAt ?? null,
    scopes, subject: typeof data.open_id === "string" ? data.open_id : previous?.subject ?? null };
}
export async function readSocialAccounts(provider: SocialProvider, tokens: SocialTokens): Promise<SocialAccount[]> {
  const headers = { Authorization: `Bearer ${tokens.accessToken}` };
  if (provider === "youtube") {
    const data = await providerJson("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50", { headers });
    const accounts: SocialAccount[] = (data.items ?? []).filter((v: { id?: string; snippet?: { title?: string } }) => typeof v.id === "string" && typeof v.snippet?.title === "string")
      .map((v: { id: string; snippet: { title: string } }) => ({ id: v.id, name: v.snippet.title }));
    if (!accounts.length) throw new SocialProviderError();
    return accounts;
  }
  const data = await providerJson("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", { headers });
  const user = data.data?.user;
  if (!user?.open_id || user.open_id !== tokens.subject || typeof user.display_name !== "string") throw new SocialProviderError();
  return [{ id: user.open_id, name: user.display_name }];
}
export async function revokeSocialTokens(config: SocialConfig, tokens: SocialTokens) {
  const youtube = config.provider === "youtube";
  const body = youtube ? new URLSearchParams({ token: tokens.refreshToken }) : new URLSearchParams({ client_key: config.clientId, client_secret: config.clientSecret, token: tokens.accessToken });
  const response = await fetch(youtube ? "https://oauth2.googleapis.com/revoke" : "https://open.tiktokapis.com/v2/oauth/revoke/", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, redirect: "error", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return false;
  if (youtube) return true;
  const data = await response.json().catch(() => null);
  return data !== null && (!data.error || data.error.code === "ok");
}

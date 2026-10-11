import "server-only";
import { createHmac } from "node:crypto";
import { requireMetaCompanyAccess } from "./company-access";
import { createServiceClient } from "@/lib/supabase/service";
import { loadMetaGuidedOAuthConfig } from "@/lib/client-os/guided-oauth";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";

type InstagramProfile = { id: string; username: string; name?: string; biography?: string; media_count?: number };
type InstagramMedia = { id: string; caption?: string; media_type?: string; permalink?: string; timestamp?: string };
export type InstagramOverview = { profile: InstagramProfile | null; media: InstagramMedia[]; error: string | null };

export async function getInstagramOverview(userId: string, organizationId: string): Promise<InstagramOverview> {
  const client = createServiceClient();
  // Authorization must happen before loading any tenant credentials.
  const company = await requireMetaCompanyAccess({ userId, companyId: organizationId, client });
  const empty: InstagramOverview = { profile: null, media: [], error: null };
  try {
    const { data, error } = await client.from("integration_credentials")
      .select("env_name,encrypted_value").eq("scope", "organization")
      .eq("organization_id", company.id).eq("integration_id", "meta")
      .in("env_name", ["META_ACCESS_TOKEN", "INSTAGRAM_BUSINESS_ACCOUNT_ID"]);
    if (error) return { ...empty, error: "Não foi possível consultar a conexão Instagram." };
    const credentials = new Map((data ?? []).filter(row => row.encrypted_value)
      .map(row => [row.env_name, decryptCredentialValue(row.encrypted_value)]));
    const token = credentials.get("META_ACCESS_TOKEN");
    const instagramId = credentials.get("INSTAGRAM_BUSINESS_ACCOUNT_ID");
    if (!token || !instagramId || !/^\d+$/.test(instagramId)) return empty;
    const config = await loadMetaGuidedOAuthConfig({ client });
    const proof = createHmac("sha256", config.appSecret).update(token).digest("hex");
    const read = async (path: string, fields: string) => {
      const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${instagramId}${path}`);
      url.searchParams.set("fields", fields);
      url.searchParams.set("appsecret_proof", proof);
      if (path) url.searchParams.set("limit", "12");
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      // Never return raw provider errors, URLs or credential material to the client.
      if (!response.ok) throw new Error("instagram_read_failed");
      return response.json();
    };
    const [profile, media] = await Promise.all([
      read("", "id,username,name,biography,media_count"),
      read("/media", "id,caption,media_type,permalink,timestamp"),
    ]);
    return { profile, media: Array.isArray(media.data) ? media.data : [], error: null };
  } catch {
    return { ...empty, error: "A Meta não permitiu ler o Instagram agora. Confira a conexão e a permissão instagram_basic." };
  }
}

export function safeInstagramPermalink(value?: string) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && ["www.instagram.com", "instagram.com"].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

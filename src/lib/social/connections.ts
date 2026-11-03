import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptCredentialValue, decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { loadSocialConfig, exchangeSocialTokens, readSocialAccounts, revokeSocialTokens, type SocialTokens } from "./providers";
import { hasSocialScopes, type SocialAccountsOverview, type SocialProvider, type SocialAccount } from "./policy";

type ConnectionRow = { id: string; provider: SocialProvider; status: string; encrypted_tokens: string; scopes: string[]; accounts: SocialAccount[]; selected_account_id: string | null; checked_at: string | null };
export async function socialAccountsOverview(client: SupabaseClient, organizationId: string, canManage: boolean): Promise<SocialAccountsOverview> {
  const [rows, meta, youtube, tiktok] = await Promise.all([
    client.from("social_connections").select("provider,status,accounts,selected_account_id,checked_at").eq("organization_id", organizationId),
    client.from("organization_integrations").select("status,external_account_label,scopes,metadata").eq("organization_id", organizationId).eq("provider_id", "meta-ads").maybeSingle(),
    loadSocialConfig("youtube", client), loadSocialConfig("tiktok", client),
  ]);
  if (rows.error && !["42P01", "PGRST205"].includes(rows.error.code)) throw Error("Não foi possível consultar suas contas. Tente novamente.");
  const metaData = meta.data;
  const pageId = metaData?.metadata?.selected_facebook_page_id;
  const pages = metaData?.metadata?.facebook_pages;
  const page = Array.isArray(pages) ? pages.find((item: { id?: string }) => item.id === pageId)?.name : null;
  return { schemaReady: !rows.error, canManage,
    meta: { connected: !meta.error && metaData?.status === "connected", account: typeof page === "string" ? page : metaData?.external_account_label ?? null,
      available: !meta.error, publishingScopes: ["pages_manage_posts", "instagram_content_publish"].every(s => metaData?.scopes?.includes(s)) },
    connections: (["youtube", "tiktok"] as const).map(provider => {
      const row = (rows.data ?? []).find(r => r.provider === provider);
      return { provider, configured: Boolean(provider === "youtube" ? youtube : tiktok), connected: row?.status === "connected", status: row?.status ?? "disconnected",
        accounts: row?.accounts ?? [], selectedAccountId: row?.selected_account_id ?? null, checkedAt: row?.checked_at ?? null };
    }),
  };
}
export async function saveSocialConnection(client: SupabaseClient, organizationId: string, userId: string, provider: SocialProvider, stateHash: string, tokens: SocialTokens, accounts: SocialAccount[]) {
  if (!hasSocialScopes(provider, tokens.scopes) || !accounts.length) throw Error("A autorização está incompleta.");
  const result = await client.rpc("complete_social_oauth", {
    p_organization_id: organizationId, p_user_id: userId, p_provider: provider, p_state_hash: stateHash,
    p_encrypted_tokens: encryptCredentialValue(JSON.stringify(tokens)), p_scopes: tokens.scopes, p_accounts: accounts,
  });
  if (result.error) throw Error("Não foi possível salvar a conexão.");
}
export async function changeSocialConnection(client: SupabaseClient, organizationId: string, provider: SocialProvider, action: "select" | "check" | "disconnect", accountId?: string) {
  const result = await client.from("social_connections").select("*").eq("organization_id", organizationId).eq("provider", provider).maybeSingle();
  if (result.error) throw Error("Não foi possível consultar a conexão.");
  const row = result.data as ConnectionRow | null;
  if (action === "disconnect") {
    // Invalidate pending authorizations as well, so an old tab cannot reconnect later.
    const pending = await client.from("social_oauth_attempts").delete().eq("organization_id", organizationId).eq("provider", provider);
    if (pending.error) throw Error("Não foi possível encerrar a autorização pendente.");
    const removed = await client.from("social_connections").delete().eq("organization_id", organizationId).eq("provider", provider);
    if (removed.error) throw Error("Não foi possível desconectar a conta.");
    // Also clean historical API data if an older release already removed the connection.
    if (!row) {
      const cleanup = await client.rpc('erase_social_provider_data', { p_org: organizationId, p_provider: provider });
      if (cleanup.error) throw Error('Não foi possível concluir a exclusão dos dados da integração.');
      return { message: "Conta desconectada e dados da integração removidos." };
    }
    const revoked = await (async () => {
      const config = await loadSocialConfig(provider, client);
      return config ? revokeSocialTokens(config, JSON.parse(decryptCredentialValue(row.encrypted_tokens))) : false;
    })().catch(() => false);
    return { message: revoked ? "Conta desconectada e autorização revogada." : "Conta removida da ConnectyHub. A revogação externa não foi confirmada; remova também o acesso nas configurações da plataforma." };
  }
  if (!row) throw Error("Conecte a conta antes de continuar.");
  if (action === "select") {
    if (row.status !== "connected" || !row.accounts.some(a => a.id === accountId)) throw Error("Selecione uma conta desta autorização ativa.");
    const updated = await client.from("social_connections").update({ selected_account_id: accountId, updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("organization_id", organizationId).eq("status", "connected").eq("encrypted_tokens", row.encrypted_tokens).select("id").maybeSingle();
    if (updated.error || !updated.data) throw Error("A conexão mudou. Atualize a página antes de selecionar.");
    return { message: "Conta selecionada. Prepare e aprove seu vídeo em Publicações." };
  }
  const config = await loadSocialConfig(provider, client);
  if (!config) throw Error("A configuração desta integração ainda está pendente.");
  const operationId = randomUUID();
  const claimed = await client.from("social_connections").update({ status: "checking", operation_id: operationId, updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("organization_id", organizationId).eq("status", "connected").eq("encrypted_tokens", row.encrypted_tokens).select("id").maybeSingle();
  if (claimed.error || !claimed.data) throw Error("A conexão exige reconexão ou já está sendo verificada. Atualize a página.");
  try {
    let tokens = JSON.parse(decryptCredentialValue(row.encrypted_tokens)) as SocialTokens;
    if (tokens.expiresAt <= Date.now() + 60000) {
      if (tokens.refreshExpiresAt !== null && tokens.refreshExpiresAt <= Date.now()) throw Error("Autorização expirada.");
      tokens = await exchangeSocialTokens(config, "", tokens);
      // Preserve rotating refresh tokens before the subsequent profile request.
      const refreshed = await client.from("social_connections").update({ encrypted_tokens: encryptCredentialValue(JSON.stringify(tokens)), scopes: tokens.scopes })
        .eq("id", row.id).eq("organization_id", organizationId).eq("operation_id", operationId).select("id").maybeSingle();
      if (refreshed.error || !refreshed.data) throw Error("A conexão mudou durante a renovação.");
    }
    const accounts = await readSocialAccounts(provider, tokens);
    const saved = await client.from("social_connections").update({ status: "connected", accounts,
      selected_account_id: accounts.some(a => a.id === row.selected_account_id) ? row.selected_account_id : null,
      operation_id: null, checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("organization_id", organizationId).eq("operation_id", operationId).select("id").maybeSingle();
    if (saved.error || !saved.data) throw Error("A conexão foi alterada durante a verificação.");
    return { message: "Conexão verificada. Nenhuma publicação foi enviada." };
  } catch {
    await client.from("social_connections").update({ status: "reconnect", operation_id: null }).eq("id", row.id).eq("organization_id", organizationId).eq("operation_id", operationId);
    throw Error("Não foi possível confirmar o acesso. Reconecte a conta; nenhum envio foi realizado.");
  }
}

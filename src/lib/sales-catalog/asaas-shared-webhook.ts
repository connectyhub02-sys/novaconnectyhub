import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue, encryptCredentialValue, hashCredentialValue } from "@/lib/security/credentials-crypto";

type Identity = { mode: "sandbox" | "production"; webhookId: string; url: string };

/** The provider webhook ID is obtained through the caller's validated API key,
 * never accepted from the browser. Different keys for one account see this same ID.
 * Asaas /myAccount does not reliably return an account or wallet ID. */
export async function loadSharedAsaasWebhook(client: SupabaseClient, identity: Identity) {
  const { data, error } = await client.from("asaas_account_webhooks")
    .select("secret_encrypted,webhook_url").eq("mode", identity.mode)
    .eq("provider_webhook_id", identity.webhookId).maybeSingle();
  if (error) throw new Error("Não foi possível conferir a configuração compartilhada do webhook Asaas.");
  if (!data) return null;
  if (data.webhook_url !== identity.url) throw new Error("O webhook Asaas pertence a outro endereço de integração.");
  return decryptCredentialValue(data.secret_encrypted);
}

export async function ensureSharedAsaasWebhook(client: SupabaseClient, identity: Identity, proposedSecret: string) {
  const current = await loadSharedAsaasWebhook(client, identity);
  if (current) return current;
  // Adopt a pre-existing connection without rotating its webhook secret.
  const legacy = await client.from("sales_catalog_payment_integrations")
    .select("webhook_secret_encrypted").eq("provider", "asaas").eq("mode", identity.mode)
    .eq("webhook_url", identity.url).eq("metadata->>webhook_provider_id", identity.webhookId)
    .not("webhook_secret_encrypted", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (legacy.error) throw new Error("Não foi possível preservar o webhook Asaas existente.");
  const secret = legacy.data?.webhook_secret_encrypted
    ? decryptCredentialValue(legacy.data.webhook_secret_encrypted) : proposedSecret;
  const { error } = await client.from("asaas_account_webhooks").upsert({
    mode: identity.mode, provider_webhook_id: identity.webhookId, webhook_url: identity.url,
    secret_encrypted: encryptCredentialValue(secret), secret_hash: hashCredentialValue(secret),
  }, { onConflict: "mode,provider_webhook_id", ignoreDuplicates: true });
  if (error) throw new Error("Não foi possível salvar o webhook compartilhado do Asaas.");
  // Concurrent connections must use the winner of the unique insert, not their
  // locally generated secret. Never rotate this row on reconnect/disconnect.
  const saved = await loadSharedAsaasWebhook(client, identity);
  if (!saved) throw new Error("Webhook compartilhado Asaas ainda não confirmado.");
  return saved;
}

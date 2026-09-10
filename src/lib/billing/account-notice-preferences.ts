import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadNotificationAccount } from "./notification-sender";

export type NoticeRecipient = { organization_id: string; phone: string; public_key: string; enabled: boolean; welcome_contact_phone: string | null };
export const validNoticeKey = (key: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key);
const normalizePhone = (phone: string) => phone.replace(/\D/g, "");
const validPhone = (phone: string) => /^[1-9][0-9]{9,14}$/.test(phone);

export async function ensureNoticeRecipient(client: SupabaseClient, organizationId: string, phone: string): Promise<NoticeRecipient> {
  const account = await loadNotificationAccount(client, organizationId);
  const normalized = normalizePhone(phone);
  if (!validPhone(normalized)) throw new Error("Telefone dos avisos inválido.");
  const result = await client.rpc("ensure_account_notice_recipient", { p_org: account.id, p_phone: normalized });
  if (result.error || !result.data) throw new Error("Não foi possível conferir a preferência dos avisos.");
  return result.data as NoticeRecipient;
}

export async function loadNoticeRecipientByKey(client: SupabaseClient, key: string): Promise<NoticeRecipient | null> {
  if (!validNoticeKey(key)) return null;
  const result = await client.from("account_notice_recipients").select("organization_id,phone,public_key,enabled,welcome_contact_phone").eq("public_key", key).maybeSingle();
  if (result.error) throw new Error("Não foi possível consultar a preferência.");
  return result.data;
}

export async function optOutAccountNotices(client: SupabaseClient, key: string) {
  if (!validNoticeKey(key)) return false;
  const result = await client.from("account_notice_recipients").update({ enabled: false, opted_out_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("public_key", key).select("public_key").maybeSingle();
  if (result.error) throw new Error("Não foi possível confirmar a saída. Tente novamente.");
  return Boolean(result.data);
}

export class AccountNoticesOptedOut extends Error {
  constructor() { super("Destinatário saiu da lista de avisos da conta."); }
}

export async function prepareNoticeActions(client: SupabaseClient, recipient: NoticeRecipient, input: { appUrl: string; senderKind: "customer" | "platform"; senderPhone: string | null; eventType: string | null }) {
  const current = await loadNoticeRecipientByKey(client, recipient.public_key);
  if (!current) throw new Error("Preferência do destinatário indisponível.");
  if (!current.enabled) throw new AccountNoticesOptedOut();
  const url = `${input.appUrl}/avisos/${current.public_key}`;
  const phone = normalizePhone(input.senderPhone ?? "");
  const saveContact = input.senderKind === "platform" && input.eventType === "trial_started" && validPhone(phone);
  if (saveContact) {
    const saved = await client.from("account_notice_recipients").update({ welcome_contact_phone: phone }).eq("public_key", current.public_key);
    if (saved.error) throw new Error("Não foi possível preparar o contato da ConnectyHub.");
  }
  return { unsubscribeUrl: url, ...(saveContact ? { contactUrl: `${url}/contato` } : {}) };
}

export async function loadOwnerNoticeDelivery(client: SupabaseClient, organizationId: string) {
  const account = await loadNotificationAccount(client, organizationId);
  const profile = await client.from("profiles").select("phone").eq("id", account.ownerId).maybeSingle();
  if (profile.error) throw new Error("Não foi possível conferir o telefone do titular.");
  const phone = normalizePhone(profile.data?.phone ?? "");
  if (!validPhone(phone)) return { account, phone: null, enabled: true };
  const saved = await client.from("account_notice_recipients").select("enabled").eq("organization_id", account.id).eq("phone", phone).maybeSingle();
  if (saved.error) throw new Error("Não foi possível consultar os avisos.");
  return { account, phone, enabled: saved.data?.enabled !== false };
}

export async function saveOwnerNoticeDelivery(client: SupabaseClient, organizationId: string, actorId: string, enabled: boolean) {
  const current = await loadOwnerNoticeDelivery(client, organizationId);
  if (current.account.ownerId !== actorId) throw new Error("Somente o titular pode alterar o recebimento dos avisos.");
  if (!current.phone) throw new Error("Cadastre seu telefone antes de configurar os avisos.");
  const saved = await client.from("account_notice_recipients").upsert({ organization_id: current.account.id, phone: current.phone, enabled, opted_out_at: enabled ? null : new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "organization_id,phone" });
  if (saved.error) throw new Error("Não foi possível salvar a preferência.");
}

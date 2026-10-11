import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { officialAssetId, officialPhone } from "./whatsapp-policy";
import { recipientAliases, recipientIdentity } from "./whatsapp-recipient";
import { enrichOfficialContacts } from "./whatsapp-contact-profile";

export async function officialInbox(
  client: SupabaseClient,
  org: string,
  sender: string | null,
  phone: string | null,
  offset: number,
  before?: string | null,
) {
  let query = client
    .from("meta_whatsapp_threads")
    .select("*")
    .eq("organization_id", org);
  if (sender) query = query.eq("phone_number_id", officialAssetId(sender));
  const threads = await query
    .order("last_message_at", { ascending: false })
    .range(offset, offset + 49);
  if (threads.error) throw new Error("Falha ao carregar conversas.");
  let messages: Record<string, unknown>[] = [],
    notes: Record<string, unknown>[] = [],
    contact: Record<string, unknown> | null = null,
    selectedThread: Record<string, unknown> | null = null;
  if (sender && phone) {
    const identity = recipientIdentity(
      officialPhone(phone),
      await recipientAliases(client, org, sender, [phone]),
    );
    let history = client
      .from("meta_whatsapp_messages")
      .select(
        "id,phone_number_id,phone,direction,message_type,text_content,status,occurred_at,error_code,content",
      )
      .eq("organization_id", org)
      .eq("phone_number_id", sender)
      .in("phone", identity.phones)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    if (before) {
      const cursor = await client
        .from("meta_whatsapp_messages")
        .select("id,occurred_at")
        .eq("organization_id", org)
        .eq("phone_number_id", sender)
        .in("phone", identity.phones)
        .eq("id", before)
        .maybeSingle();
      if (cursor.error || !cursor.data)
        throw new Error("Página de histórico inválida.");
      const at = new Date(cursor.data.occurred_at).toISOString();
      history = history.or(
        `occurred_at.lt.${at},and(occurred_at.eq.${at},id.lt.${cursor.data.id})`,
      );
    }
    const [chat, noteRows, contacts, threadRow] = await Promise.all([
      history,
      client
        .from("meta_whatsapp_notes")
        .select("id,body,created_at,created_by")
        .eq("organization_id", org)
        .eq("phone_number_id", sender)
        .eq("phone", identity.phone)
        .order("created_at", { ascending: false })
        .limit(50),
      client
        .from("meta_whatsapp_contacts")
        .select("phone,lead_id,opted_out,consent_note,consent_at")
        .eq("organization_id", org)
        .in("phone", identity.phones),
      client
        .from("meta_whatsapp_threads")
        .select("*")
        .eq("organization_id", org)
        .eq("phone_number_id", sender)
        .eq("phone", identity.phone)
        .maybeSingle(),
    ]);
    if (chat.error || noteRows.error || contacts.error || threadRow.error)
      throw new Error("Falha ao carregar histórico e dados do lead.");
    selectedThread = threadRow.data;
    messages = (chat.data ?? []).reverse();
    notes = noteRows.data ?? [];
    const rows = contacts.data ?? [];
    contact = rows.find((c) => c.phone === identity.phone) ?? rows[0] ?? null;
    if (contact)
      contact = { ...contact, opted_out: rows.some((c) => c.opted_out) };
  }
  const enriched = await enrichOfficialContacts(client, org, [...(threads.data ?? []), ...(selectedThread ? [selectedThread] : [])]);
  return {
    threads: enriched.slice(0, threads.data?.length ?? 0),
    hasMore: threads.data?.length === 50,
    messages,
    notes,
    contact,
    selectedThread: selectedThread ? enriched[enriched.length - 1] : null,
    requestedPhone: phone,
  };
}

export async function updateOfficialThread(
  client: SupabaseClient,
  org: string,
  actor: string,
  body: Record<string, unknown>,
) {
  const sender = officialAssetId(body.sender),
    phone = officialPhone(body.phone);
  const thread = await client
    .from("meta_whatsapp_threads")
    .select("phone,last_message_at")
    .eq("organization_id", org)
    .eq("phone_number_id", sender)
    .eq("phone", phone)
    .maybeSingle();
  if (thread.error || !thread.data)
    throw new Error("Conversa não encontrada nesta empresa.");
  if (body.action === "note") {
    const text = String(body.text ?? "").trim();
    if (!text || text.length > 4000)
      throw new Error("Nota: entre 1 e 4.000 caracteres.");
    const result = await client.from("meta_whatsapp_notes").insert({
      organization_id: org,
      phone_number_id: sender,
      phone,
      created_by: actor,
      body: text,
    });
    if (result.error) throw new Error("Falha ao salvar nota interna.");
  } else {
    const update: Record<string, unknown> = {};
    if (body.action === "read") {
      update.unread_count = 0;
      update.last_read_at = thread.data.last_message_at;
    } else if (body.action === "assign")
      update.assigned_to = body.assign === true ? actor : null;
    else if (body.action === "resolve")
      update.status = body.resolved === true ? "resolved" : "open";
    else if (body.action === "rename_contact") {
      const name = String(body.name ?? "").trim();
      if (!name || name.length > 120) throw new Error("Nome inválido.");
      update.display_name = name;
    } else throw new Error("Ação de conversa inválida.");
    let query = client
      .from("meta_whatsapp_threads")
      .update(update)
      .eq("organization_id", org)
      .eq("phone_number_id", sender)
      .eq("phone", phone);
    // Do not erase unread messages that arrived while the read action was in flight.
    if (body.action === "read")
      query = query.eq("last_message_at", thread.data.last_message_at);
    const result = await query;
    if (result.error) throw new Error("Falha ao atualizar conversa.");
  }
  return { ok: true };
}

export async function officialCampaigns(client: SupabaseClient, org: string) {
  const result = await client.rpc("meta_whatsapp_campaign_summaries", {
    p_org: org,
  });
  if (result.error) throw new Error("Falha ao consultar campanhas.");
  return result.data ?? [];
}

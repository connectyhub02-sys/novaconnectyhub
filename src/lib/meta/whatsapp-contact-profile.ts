import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readLeadProfileImageUrl } from "@/lib/whatsapp/lead-avatar-sync";

// Cloud API inbound contacts expose a name, not the customer's WhatsApp photo.
// Reuse only an existing CRM photo through the tenant's verified contact -> lead link.
export async function enrichOfficialContacts(
  client: SupabaseClient,
  org: string,
  threads: Record<string, unknown>[],
) {
  const phones = [...new Set(threads.map((t) => String(t.phone)))];
  if (!phones.length) return threads;
  const contacts = await client
    .from("meta_whatsapp_contacts")
    .select("phone,lead_id")
    .eq("organization_id", org)
    .in("phone", phones);
  if (contacts.error) return threads;
  const ids = [
    ...new Set((contacts.data ?? []).map((c) => c.lead_id).filter(Boolean)),
  ];
  if (!ids.length) return threads;
  const leads = await client
    .from("leads")
    .select("id,metadata")
    .eq("organization_id", org)
    .in("id", ids);
  if (leads.error) return threads;
  const byId = new Map((leads.data ?? []).map((l) => [l.id, l]));
  const byPhone = new Map(
    (contacts.data ?? []).map((c) => [c.phone, byId.get(c.lead_id)]),
  );
  return threads.map((t) => {
    const lead = byPhone.get(String(t.phone));
    const url = readLeadProfileImageUrl(lead?.metadata);
    let avatar: string | null = null;
    try {
      const parsed = new URL(url ?? "");
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password)
        avatar = parsed.href;
    } catch {}
    return { ...t, avatar_url: avatar };
  });
}

export function officialInboundProfileName(
  contacts: unknown,
  sender: string,
): string | null {
  if (!Array.isArray(contacts)) return null;
  const contact = contacts.find(
    (c) => c && typeof c === "object" && c.wa_id === sender,
  );
  const name = contact?.profile?.name;
  return typeof name === "string" && name.trim()
    ? name.trim().slice(0, 120)
    : null;
}

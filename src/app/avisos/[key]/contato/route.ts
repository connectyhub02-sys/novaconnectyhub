import { createServiceClient } from "@/lib/supabase/service";
import { loadNoticeRecipientByKey, validNoticeKey } from "@/lib/billing/account-notice-preferences";
import { connectyHubContactCard } from "@/lib/billing/account-notice-actions";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!validNoticeKey(key)) return new Response("Contato não encontrado.", { status: 404, headers });
  try {
    const recipient = await loadNoticeRecipientByKey(createServiceClient(), key);
    if (!recipient?.welcome_contact_phone) return new Response("Contato não encontrado.", { status: 404, headers });
    return new Response(connectyHubContactCard(recipient.welcome_contact_phone), { headers: { ...headers, "Content-Type": "text/vcard; charset=utf-8", "Content-Disposition": 'attachment; filename="ConnectyHub.vcf"' } });
  } catch { return new Response("Não foi possível carregar o contato.", { status: 503, headers }); }
}

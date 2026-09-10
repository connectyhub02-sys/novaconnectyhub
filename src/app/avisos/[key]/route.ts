import { createServiceClient } from "@/lib/supabase/service";
import { loadNoticeRecipientByKey, optOutAccountNotices, validNoticeKey } from "@/lib/billing/account-notice-preferences";
import { accountNoticePage, accountNoticePageHeaders } from "@/lib/billing/account-notice-page";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ key: string }> };
const page = (state: Parameters<typeof accountNoticePage>[0], key = "", status = 200) => new Response(accountNoticePage(state, key), { status, headers: accountNoticePageHeaders });

export async function GET(_request: Request, context: Context) {
  const { key } = await context.params;
  if (!validNoticeKey(key)) return page("missing", "", 404);
  try {
    const recipient = await loadNoticeRecipientByKey(createServiceClient(), key);
    return recipient ? page(recipient.enabled ? "confirm" : "disabled", key) : page("missing", "", 404);
  } catch { return page("error", "", 503); }
}

export async function POST(request: Request, context: Context) {
  const { key } = await context.params;
  if (!validNoticeKey(key)) return page("missing", "", 404);
  const origin = request.headers.get("origin");
  // Browsers send Origin: null for this no-referrer form; Fetch Metadata still identifies same-origin submissions.
  const sameOriginPrivateForm = origin === "null" && request.headers.get("sec-fetch-site") === "same-origin";
  if (origin && origin !== new URL(request.url).origin && !sameOriginPrivateForm) return page("error", "", 403);
  try {
    const form = await request.formData();
    if (form.get("action") !== "unsubscribe") return page("error", "", 422);
    return await optOutAccountNotices(createServiceClient(), key) ? page("disabled") : page("missing", "", 404);
  } catch { return page("error", "", 503); }
}
